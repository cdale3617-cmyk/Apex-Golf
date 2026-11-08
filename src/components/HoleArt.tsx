import React, { useRef, useState } from 'react';
import type { Hole, XY } from '../store';
import type { PlayingState } from '../round-state';
import { usableBall } from '../round-state';
import { greenCentre } from '../strategy';
import { Satellite } from './Satellite';
import { COMPASS } from '../geo';
import { anchoredCamera, cameraFrame, clampZoom, worldAt, zoomAt, type Camera } from '../map-camera';
import type { MapFrame } from '../satellite-geometry';

export type MapMode = 'target' | 'ball' | 'water' | 'bunker' | 'remove';
export function HoleArt({ hole, playing, plannedTarget, mode, onPoint, satellite = true, aimPoint, frameHole, editingMarkers = false, onMarker, targetLocked = false, onToggleTargetLock, selectedMarker = 'tee', onMarkerStart }: {
  hole: Hole; playing: PlayingState; plannedTarget: XY | null; mode: MapMode; onPoint: (p: XY) => void; satellite?: boolean; aimPoint?: XY | null; frameHole?: Hole; editingMarkers?: boolean; onMarker?: (kind:'tee'|'green',p:XY)=>void; targetLocked?: boolean; onToggleTargetLock?:()=>void; selectedMarker?:'tee'|'green'; onMarkerStart?:(kind:'tee'|'green')=>void;
}) {
  const [attribution, setAttribution] = useState("");
  const ref = useRef<SVGSVGElement>(null);
  type DragKind='tee'|'green'|'yellow'|'pan'|'point';
  const pointers=useRef(new Map<number,XY>());
  const dragging=useRef<{id:number;kind:DragKind;start:XY;origin:XY;frame:MapFrame;camera:Camera;moved:boolean}|null>(null);
  const pinching=useRef<{distance:number;zoom:number;anchor:XY}|null>(null);
  const suppressed=useRef(false);
  const [cameraState,setCameraState]=useState<Camera|null>(null);
  const cameraRef=useRef<Camera|null>(null);
  const shape = hole.shape;
  if (!shape || shape.path.length < 2) return <div className="empty"><h2>Hole map unavailable</h2><p>Use the card distance or enter your remaining distance. No hazards have been invented.</p></div>;
  const ball = usableBall(playing);
  const tee = hole.teeMarker ?? shape.path[0], green = greenCentre(hole)!;
  const target = playing.target ?? aimPoint ?? green;
  const frameShape = frameHole?.shape ?? shape;
  const all = [...frameShape.path, ...(frameShape.green ?? []), ...(frameHole?.teeMarker ? [frameHole.teeMarker] : []), ...(frameHole?.greenMarker ? [frameHole.greenMarker] : [])];
  const minX = Math.min(...all.map(p => p[0])) - 25, maxX = Math.max(...all.map(p => p[0])) + 25;
  const minY = Math.min(...all.map(p => p[1])) - 25, maxY = Math.max(...all.map(p => p[1])) + 25;
  const base={minX,maxX,minY,maxY,scale:Math.min(270/(maxX-minX),470/(maxY-minY))};
  const home:Camera={zoom:1,center:[(minX+maxX)/2,(minY+maxY)/2]};
  const camera=cameraState??home;cameraRef.current=camera;
  const frame=cameraFrame(base,camera),scale=frame.scale;
  const setCamera=(value:Camera)=>{cameraRef.current=value;setCameraState(value);};
  const x=(p:XY)=>160+(p[0]-(frame.minX+frame.maxX)/2)*scale;
  const y=(p:XY)=>270-(p[1]-(frame.minY+frame.maxY)/2)*scale;
  const pts=(points:XY[])=>points.map(p=>`${x(p)},${y(p)}`).join(' ');
  const screen=(e:React.PointerEvent):XY|null=>{
    const matrix=ref.current?.getScreenCTM();if(!matrix)return null;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return [p.x,p.y];
  };
  const begin=(e:React.PointerEvent,kind:DragKind)=>{
    e.stopPropagation();const pos=screen(e);if(!pos)return;
    ref.current?.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,pos);
    if(pointers.current.size===2){
      const [a,b]=[...pointers.current.values()];const middle:XY=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      const current=cameraRef.current??home;
      pinching.current={distance:Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),zoom:current.zoom,anchor:worldAt(middle,cameraFrame(base,current))};
      dragging.current=null;suppressed.current=true;return;
    }
    if(pointers.current.size!==1||suppressed.current)return;
    if(kind==='tee'||kind==='green')onMarkerStart?.(kind);
    const current=cameraRef.current??home,currentFrame=cameraFrame(base,current);
    dragging.current={id:e.pointerId,kind,start:pos,origin:kind==='tee'?tee:kind==='green'?green:kind==='yellow'?target:worldAt(pos,currentFrame),frame:currentFrame,camera:current,moved:false};
  };
  const move=(e:React.PointerEvent)=>{
    const pos=screen(e);if(!pos||!pointers.current.has(e.pointerId))return;
    pointers.current.set(e.pointerId,pos);
    if(pointers.current.size>=2&&pinching.current){
      const [a,b]=[...pointers.current.values()],start=pinching.current;
      const middle:XY=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      setCamera(anchoredCamera(base,start.zoom*Math.hypot(a[0]-b[0],a[1]-b[1])/start.distance,middle,start.anchor));return;
    }
    const drag=dragging.current;if(!drag||drag.id!==e.pointerId||suppressed.current)return;
    if(Math.hypot(pos[0]-drag.start[0],pos[1]-drag.start[1])<4&&!drag.moved)return;drag.moved=true;
    if(drag.kind==='pan'){
      setCamera({zoom:drag.camera.zoom,center:[drag.camera.center[0]-(pos[0]-drag.start[0])/drag.frame.scale,drag.camera.center[1]+(pos[1]-drag.start[1])/drag.frame.scale]});return;
    }
    const current=worldAt(pos,drag.frame),start=worldAt(drag.start,drag.frame);
    const p:XY=drag.kind==='point'?current:[drag.origin[0]+current[0]-start[0],drag.origin[1]+current[1]-start[1]];
    if(drag.kind==='tee'||drag.kind==='green')onMarker?.(drag.kind,p);
    else if((!targetLocked||mode!=='target')&&!editingMarkers&&(drag.kind==='yellow'||['ball','target'].includes(mode)))onPoint(p);
  };
  const end=(e:React.PointerEvent,cancel=false)=>{
    const drag=dragging.current;
    if(!cancel&&!suppressed.current&&pointers.current.size===1&&drag?.id===e.pointerId&&!drag.moved){
      if(drag.kind==='yellow')onToggleTargetLock?.();
      else if(drag.kind==='point'){const pos=screen(e);if(pos)onPoint(worldAt(pos,drag.frame));}
    }
    pointers.current.delete(e.pointerId);dragging.current=null;
    if(!pointers.current.size){pinching.current=null;suppressed.current=false;}
  };
  const zoom=(factor:number)=>{
    const current=cameraRef.current??home,next=clampZoom(current.zoom*factor);
    if(next===1){setCamera(home);return;}
    if(editingMarkers){setCamera({zoom:next,center:selectedMarker==='tee'?tee:green});return;}
    const focus:XY=x(target)>=0&&x(target)<=320&&y(target)>=0&&y(target)<=540?[x(target),y(target)]:[160,270];
    setCamera(zoomAt(base,current,next,focus));
  };
  const marker = (p: XY, fill: string, label: string) => <g><circle cx={x(p)} cy={y(p)} r="3.5" fill={fill} stroke="#fff" strokeWidth="1.5"/><title>{label}</title></g>;
  const windFresh = !!hole.weatherAt && Date.now()-hole.weatherAt<45*60000;
  const windFrom = COMPASS.indexOf(hole.windDir)*45;
  const windAngle = windFrom+180-(hole.mapBearing??hole.bearing??0);
  const showWind = windFresh&&hole.windKmh>0&&windFrom>=0&&(hole.mapBearing!==undefined||hole.bearing!==null);
  return <><div className="hole-viewport"><svg ref={ref} viewBox="0 0 320 540" role="img" aria-label={`Hole ${hole.number}. Tee at bottom. Tap or drag to set ${mode}.`}
    style={{ touchAction:'none' }}
    onPointerDown={e=>begin(e,editingMarkers||(targetLocked&&mode==='target')?'pan':'point')}
    onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)}>
    <rect width="320" height="540" fill="#17391d"/>
    {satellite&&<Satellite hole={hole} frame={frame} onAttribution={setAttribution}/>}
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

    {ball&&marker(ball,'#ffffff','Your ball')}
    <g role="button" pointerEvents={mode==='target'?'auto':'none'} aria-label={targetLocked?'Unlock yellow target on map':'Lock yellow target on map'} aria-pressed={targetLocked} tabIndex={0}
      onPointerDown={e=>begin(e,'yellow')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onToggleTargetLock?.();}}}>
      <circle cx={x(target)} cy={y(target)} r="18" fill="transparent"/>
      <circle cx={x(target)} cy={y(target)} r="4" fill="#ffdf00" stroke={targetLocked?'#222':'#fff'} strokeWidth="1.5"><title>{targetLocked?'Yellow target locked':'Tap yellow to lock; drag to move'}</title></circle>
    </g>
    {(['tee','green'] as const).map(kind=>{
      const p=kind==='tee'?tee:green,label=kind==='tee'?'Red tee':'Green centre';
      const enabled=(editingMarkers&&selectedMarker===kind)||(!editingMarkers&&targetLocked&&mode==='target');
      return <g key={kind} role={enabled?'button':undefined} aria-label={enabled?label:undefined} tabIndex={enabled?0:undefined} pointerEvents={enabled?'auto':'none'}
        onPointerDown={e=>begin(e,kind)}
        onKeyDown={e=>{if(!enabled)return;const step=e.shiftKey?5:1,delta:Record<string,XY>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};const d=delta[e.key];if(d){e.preventDefault();onMarkerStart?.(kind);onMarker?.(kind,[p[0]+d[0],p[1]+d[1]]);}}}>
        {enabled&&<circle cx={x(p)} cy={y(p)} r="32" fill="transparent"/>}
        <circle cx={x(p)} cy={y(p)} r="4" fill={kind==='tee'?'#f23937':'#32e76d'} stroke="#fff" strokeWidth="1"><title>{label}{enabled?' — drag to move':''}</title></circle>
      </g>;
    })}
    {!targetLocked&&!editingMarkers&&<circle pointerEvents="none" cx={x(target)} cy={y(target)} r="4" fill="#ffdf00" stroke="#fff" strokeWidth="1.5"/>}
    {!satellite&&<text x="10" y="525" fill="#fff" fontSize="9">{shape.fairways.length ? 'Mapped features · tee at bottom' : 'Fairway outline unavailable · use Satellite'}</text>}
  </svg><div className="map-zoom-controls" aria-label="Map zoom">
    <button type="button" aria-label="Zoom in" disabled={camera.zoom>=6} onClick={()=>zoom(1.5)}>+</button>
    <button type="button" aria-label="Zoom out" disabled={camera.zoom<=1} onClick={()=>zoom(1/1.5)}>−</button>
    <button type="button" onClick={()=>setCamera(home)}>Whole hole</button>
    <span aria-live="polite">{camera.zoom.toFixed(1)}×</span>
  </div></div>{satellite && attribution && <div className="map-attribution">
    <strong>{attribution.startsWith("Google Maps") ? 'Google Maps' : 'Imagery'}</strong>
    <details className="map-sources"><summary>Data sources</summary><div className="map-sources-body">
      <p>{attribution.replace(/^Google Maps · /, "")}</p>
      <p className="feature-source">Course features © OpenStreetMap contributors / your observations</p>
    </div></details>
  </div>}</>;
}
