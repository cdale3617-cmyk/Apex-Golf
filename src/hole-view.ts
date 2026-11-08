import type { Hole, XY } from './store';
import { greenCentre } from './strategy';
import type { MapFrame } from './satellite-geometry';
/** Rotate only the view; saved GPS, marker and hazard coordinates remain unchanged. */
export function holeView(hole:Hole) {
  const tee=hole.teeMarker??hole.shape?.path[0]??[0,0],green=greenCentre(hole)??tee;
  const angle=Math.hypot(green[0]-tee[0],green[1]-tee[1])>1?Math.atan2(green[0]-tee[0],green[1]-tee[1]):0;
  const rotate=(p:XY,inverse=false):XY=>{
    const a=inverse?-angle:angle,c=Math.cos(a),s=Math.sin(a);
    return [p[0]*c-p[1]*s,p[0]*s+p[1]*c];
  };
  const project=(h:Hole):Hole=>({...h,
    mapBearing:h.mapBearing===undefined?undefined:(h.mapBearing+angle*180/Math.PI+360)%360,
    bearing:h.bearing===null?null:(h.bearing+angle*180/Math.PI+360)%360,
    teeMarker:h.teeMarker?rotate(h.teeMarker):undefined,greenMarker:h.greenMarker?rotate(h.greenMarker):undefined,
    shape:h.shape?{path:h.shape.path.map(p=>rotate(p)),green:h.shape.green?.map(p=>rotate(p))??null,
      fairways:h.shape.fairways.map(poly=>poly.map(p=>rotate(p))),water:h.shape.water.map(poly=>poly.map(p=>rotate(p))),bunkers:h.shape.bunkers.map(poly=>poly.map(p=>rotate(p)))}:h.shape,
  });
  return {angle,rotate,project};
}
export function teeBottomFrame(tee:XY,points:XY[]):MapFrame {
  const forward=Math.max(30,...points.map(p=>p[1]-tee[1]))+25;
  const side=Math.max(20,...points.map(p=>Math.abs(p[0]-tee[0])))+15;
  const scale=Math.min(440/forward,135/side);
  const cx=tee[0],cy=tee[1]+230/scale;
  return {minX:cx-160/scale,maxX:cx+160/scale,minY:cy-270/scale,maxY:cy+270/scale,scale};
}
