import { registerPlugin } from '@capacitor/core';
import type { Hole } from './store';
import { geographicPoint, satelliteTiles, type MapFrame } from './satellite-geometry';

export type Viewport = { north: number; south: number; east: number; west: number };
export type Coverage = Viewport & { maxZoom: number };
export interface GoogleBridge {
  request(options: Record<string, string | number>): Promise<{
    copyright?: string; maxZoomRects?: Coverage[]; dataUrl?: string;
  }>;
}
export const GoogleTiles = registerPlugin<GoogleBridge>('GoogleTiles');

export function viewportFor(hole: Hole, frame: MapFrame): Viewport {
  if (!hole.tee || hole.mapBearing === undefined) throw Error('Satellite needs a mapped tee.');
  const corners = [[0,0],[320,0],[320,540],[0,540]].map(([x,y]) => geographicPoint([
    (x-160)/frame.scale+(frame.minX+frame.maxX)/2,
    (270-y)/frame.scale+(frame.minY+frame.maxY)/2,
  ], hole.tee!, hole.mapBearing!));
  return {
    north: Math.max(...corners.map(p=>p.lat)), south: Math.min(...corners.map(p=>p.lat)),
    east: Math.max(...corners.map(p=>p.lon)), west: Math.min(...corners.map(p=>p.lon)),
  };
}

// Select a rectangle covering the complete view. Never request detail beyond coverage.
export function coveredZoom(view: Viewport, rectangles: Coverage[], desired: number) {
  const levels = rectangles.filter(r => r.north >= view.north && r.south <= view.south &&
    r.east >= view.east && r.west <= view.west && Number.isInteger(r.maxZoom))
    .map(r=>r.maxZoom);
  if (!levels.length) throw Error('Google satellite coverage unavailable here. Use Map.');
  return Math.max(0, Math.min(desired, Math.max(...levels)));
}

export async function loadGoogleFrame(hole: Hole, frame: MapFrame, signal: AbortSignal, bridge: GoogleBridge = GoogleTiles) {
  const check = () => { if (signal.aborted) throw Error('Satellite loading stopped.'); };
  check();
  const view = viewportFor(hole, frame);
  // 512-pixel images cover a logical 256-pixel tile, including on high-density phones.
  const desired = Math.max(14, Math.min(22, Math.ceil(Math.log2(156543.03 *
    Math.cos(hole.tee!.lat*Math.PI/180) * frame.scale))));
  const metadata = await bridge.request({ kind: 'viewport', zoom: desired, ...view });
  check();
  if (!metadata.copyright) throw Error('Google attribution unavailable. Try again online.');
  let zoom = coveredZoom(view, metadata.maxZoomRects ?? [], desired);
  let tiles = satelliteTiles(hole,frame,zoom);
  while (!tiles.length && zoom>0) tiles=satelliteTiles(hole,frame,--zoom);
  if (!tiles.length) throw Error('Satellite view unavailable. Use Map.');
  const images: string[] = [];
  // Request only this visible hole. No disk cache, prefetch, pixel analysis or art export.
  for (let offset=0; offset<tiles.length; offset+=6) {
    check();
    const batch = await Promise.all(tiles.slice(offset,offset+6).map(async tile=>{
      const result = await bridge.request({kind:'tile',z:tile.z,x:tile.x,y:tile.y});
      if (!result.dataUrl?.startsWith('data:image/')) throw Error('Google satellite picture unavailable.');
      return result.dataUrl;
    }));
    check(); images.push(...batch);
  }
  return {tiles,images,attribution:metadata.copyright};
}
