import type { XY } from './store';
import type { MapFrame } from './satellite-geometry';
export type Camera = { zoom:number; center:XY };
export const clampZoom=(zoom:number)=>Math.max(1,Math.min(6,zoom));
export function cameraFrame(base:MapFrame,camera:Camera):MapFrame {
  const width=(base.maxX-base.minX)/camera.zoom, height=(base.maxY-base.minY)/camera.zoom;
  return {minX:camera.center[0]-width/2,maxX:camera.center[0]+width/2,minY:camera.center[1]-height/2,maxY:camera.center[1]+height/2,scale:base.scale*camera.zoom};
}
export const worldAt=(screen:XY,frame:MapFrame):XY=>[(frame.minX+frame.maxX)/2+(screen[0]-160)/frame.scale,(frame.minY+frame.maxY)/2+(270-screen[1])/frame.scale];
export function zoomAt(base:MapFrame,camera:Camera,zoom:number,screen:XY):Camera {
  return anchoredCamera(base,clampZoom(zoom),screen,worldAt(screen,cameraFrame(base,camera)));
}
export function anchoredCamera(base:MapFrame,zoom:number,screen:XY,anchor:XY):Camera {
  zoom=clampZoom(zoom);const scale=base.scale*zoom;
  return {zoom,center:[anchor[0]-(screen[0]-160)/scale,anchor[1]-(270-screen[1])/scale]};
}
/** Reproject the last visible image while a sharper frame is requested. */
export function frameTransform(from:MapFrame,to:MapFrame):[number,number,number,number,number,number] {
  const ratio=to.scale/from.scale;
  return [ratio,0,0,ratio,160*(1-ratio)+((from.minX+from.maxX)-(to.minX+to.maxX))/2*to.scale,
    270*(1-ratio)-((from.minY+from.maxY)-(to.minY+to.maxY))/2*to.scale];
}
