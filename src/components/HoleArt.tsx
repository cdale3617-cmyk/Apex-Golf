import React, { useRef, useState } from 'react';
import type { Hole, XY } from '../store';
import type { PlayingState } from '../round-state';
import { usableBall } from '../round-state';
import { greenCentre } from '../strategy';
import { Satellite } from './Satellite';
import { COMPASS } from '../geo';

export type MapMode = 'target' | 'ball' | 'water' | 'bunker' | 'remove';
export function HoleArt({ hole, playing, plannedTarget, mode, onPoint, satellite = true, aimPoint, frameHole, editingMarkers = false, onMarker }: {
  hole: Hole; playing: PlayingState; plannedTarget: XY | null; mode: MapMode; onPoint: (p: XY) => void; satellite?: boolean; aimPoint?: XY | null; frameHole?: Hole; editingMarkers?: boolean; onMarker?: (kind:'tee'|'green',p:XY)=>void;
}) {
  const [attribution, setAttribution] = useState("");
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef<{kind:'tee'|'green';pointerId:number}|null>(null);
  const shape = hole.shape;
  if (!shape || shape.path.length < 2) return <div className="empty"><h2>Hole map unavailable</h2><p>Use the card distance or enter your remaining distance. No hazards have been invented.</p></div>;
  const ball = usableBall(playing);
  const tee = hole.teeMarker ?? shape.path[0], green = greenCentre(hole)!;
  const target = playing.target ?? aimPoint ?? green;
  const frameShape = frameHole?.shape ?? shape;
  const all = [...frameShape.path, ...(frameShape.green ?? []), ...(frameHole?.teeMarker ? [frameHole.teeMarker] : []), ...(frameHole?.greenMarker ? [frameHole.greenMarker] : [])];
  const minX = Math.min(...all.map(p => p[0])) - 25, maxX = Math.max(...all.map(p => p[0])) + 25;
  const minY = Math.min(...all.map(p => p[1])) - 25, maxY = Math.max(...all.map(p => p[1])) + 25;
  const scale = Math.min(270 / (maxX - minX), 470 / (maxY - minY));
  const x = (p: XY) => 160 + (p[0] - (minX + maxX) / 2) * scale;
  const y = (p: XY) => 270 - (p[1] - (minY + maxY) / 2) * scale;
  const pts = (p: XY[]) => p.map(p => `${x(p)},${y(p)}`).join(' ');
  const point = (e: React.PointerEvent<SVGSVGElement>): XY | null => {
    const matrix = ref.current?.getScreenCTM();
    if (!matrix) return null;
    const pos = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const p: XY = [(pos.x - 160) / scale + (minX + maxX) / 2, (270 - pos.y) / scale + (minY + maxY) / 2];
    // Keep dragging inside the displayed hole frame to prevent runaway coordinates.
    return [Math.max(minX, Math.min(maxX, p[0])), Math.max(minY, Math.min(maxY, p[1]))];
  };
  const marker = (p: XY, fill: string, label: string) => <g><circle cx={x(p)} cy={y(p)} r="5" fill={fill} stroke="#fff" strokeWidth="1.5"/><title>{label}</title></g>;
  const windFresh = !!hole.weatherAt && Date.now()-hole.weatherAt<45*60000;
  const windFrom = COMPASS.indexOf(hole.windDir)*45;
  const windAngle = windFrom+180-(hole.mapBearing??hole.bearing??0);
  const showWind = windFresh&&hole.windKmh>0&&windFrom>=0&&(hole.mapBearing!==undefined||hole.bearing!==null);
  return <><svg ref={ref} viewBox="0 0 320 540" role="img" aria-label={`Hole ${hole.number}. Tee at bottom. Tap or drag to set ${mode}.`}
    style={{ touchAction: 'none' }}
    onPointerDown={e => { if(editingMarkers)return; e.currentTarget.setPointerCapture(e.pointerId); const p = point(e); if (p) onPoint(p); }}
    onPointerUp={()=>{dragging.current=null;}} onPointerCancel={()=>{dragging.current=null;}}
    onPointerMove={e => { if(editingMarkers){ if(dragging.current?.pointerId===e.pointerId){const p=point(e);if(p)onMarker?.(dragging.current.kind,p);}return;} if (e.buttons && ['ball','target'].includes(mode)) { const p = point(e); if (p) onPoint(p); } }}>
    <rect width="320" height="540" fill="#17391d"/>
    {satellite&&<Satellite hole={hole} frame={{minX,maxX,minY,maxY,scale}} onAttribution={setAttribution}/>}
    <g opacity={satellite?0.32:1} pointerEvents="none">
    {shape.fairways.map((p,i) => <polygon key={'f'+i} points={pts(p)} fill="#62b83b"/>)}
    {!shape.fairways.length && <polyline points={pts(shape.path)} fill="none" stroke="#658568" strokeDasharray="3 6" strokeWidth="2"/>}
    {shape.water.map((p,i) => <polygon key={'w'+i} points={pts(p)} fill="#168ade" stroke="#80d5ff"/>)}
    {shape.bunkers.map((p,i) => <polygon key={'b'+i} points={pts(p)} fill="#e6ca88" stroke="#fff0b9"/>)}
    {!hole.greenMarker && shape.green && <polygon points={pts(shape.green)} fill="#9fe44d" stroke="#d9ff86"/>}
    </g>
    {showWind&&<g className="wind-field" pointerEvents="none" aria-label={`Wind ${hole.windKmh} kilometres per hour from ${hole.windDir}`}>
      {Array.from({length:12},(_,i)=><g key={i} transform={`translate(${40+i%3*120} ${80+Math.floor(i/3)*120}) rotate(${windAngle})`}>
        <path className="wind-arrow" d="M0 15V-15M-4 -9L0 -15L4 -9"/>
      </g>)}
    </g>}
    {ball && <polyline points={pts([ball, target])} fill="none" stroke="#ffdf00" strokeWidth="2" strokeDasharray="6 4"/>}
    {plannedTarget && marker(plannedTarget, '#ffdf00', 'Recommended landing')}

    {!editingMarkers&&<><circle cx={x(tee)} cy={y(tee)} r="8" fill="#f23937"><title>Red tee</title></circle><circle cx={x(green)} cy={y(green)} r="8" fill="#32e76d"><title>Green centre</title></circle></>}
    {ball && marker(ball, '#ffffff', 'Your ball')}
    {marker(target, '#ffdf00', 'Your target')}
    {editingMarkers&&(['tee','green'] as const).map(kind=>{
      const p=kind==='tee'?tee:green, label=kind==='tee'?'Red tee':'Green centre';
      return <g key={kind} role={editingMarkers?'button':undefined} aria-label={editingMarkers?label:undefined} tabIndex={editingMarkers?0:undefined}
        pointerEvents={editingMarkers?'auto':'none'}
        onPointerDown={e=>{if(!editingMarkers)return;e.stopPropagation();dragging.current={kind,pointerId:e.pointerId};ref.current?.setPointerCapture(e.pointerId);}}
        onKeyDown={e=>{if(!editingMarkers)return;const step=e.shiftKey?5:1;const delta:Record<string,XY>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};const d=delta[e.key];if(d){e.preventDefault();onMarker?.(kind,[p[0]+d[0],p[1]+d[1]]);}}}>
        {editingMarkers&&<circle cx={x(p)} cy={y(p)} r="32" fill="transparent"/>}
        <circle cx={x(p)} cy={y(p)} r="8" fill={kind==='tee'?'#f23937':'#32e76d'} stroke={editingMarkers?'#fff':'none'} strokeWidth="2"><title>{label}{editingMarkers?' — drag to move':''}</title></circle>
      </g>;
    })}
    {!satellite&&<text x="10" y="525" fill="#fff" fontSize="9">{shape.fairways.length ? 'Mapped features · tee at bottom' : 'Fairway outline unavailable · use Satellite'}</text>}
  </svg>{satellite && attribution && <div className="map-attribution">
    <strong>{attribution.startsWith("Google Maps") ? 'Google Maps' : 'Imagery'}</strong>
    <details className="map-sources"><summary>Data sources</summary><div className="map-sources-body">
      <p>{attribution.replace(/^Google Maps · /, "")}</p>
      <p className="feature-source">Course features © OpenStreetMap contributors / your observations</p>
    </div></details>
  </div>}</>;
}
