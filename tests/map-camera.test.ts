import {test} from 'node:test';
import assert from 'node:assert/strict';
import {anchoredCamera,cameraFrame,frameTransform,worldAt,zoomAt} from '../src/map-camera';
import {satelliteTiles} from '../src/satellite-geometry';
import type {Hole,XY} from '../src/store';
const base={minX:-40,maxX:40,minY:-25,maxY:525,scale:470/550};
const home={zoom:1,center:[0,250] as XY};
test('zoom keeps the touched golf coordinate anchored while loading geographically aligned tiles',()=>{
  for(const screen of [[160,480],[160,40],[90,270]] as XY[]){
    const before=worldAt(screen,cameraFrame(base,home));
    const zoomed=zoomAt(base,home,4,screen);
    const after=worldAt(screen,cameraFrame(base,zoomed));
    assert.ok(Math.hypot(before[0]-after[0],before[1]-after[1])<0.000001);
    const tiles=satelliteTiles({tee:{lat:-23.1457524,lon:150.7199949},mapBearing:45} as Hole,cameraFrame(base,zoomed));
    assert.ok(tiles.length>0&&tiles.length<=80);
  }
});
test('pinch supports moving its midpoint and clamps magnification between one and six',()=>{
  const anchor:XY=[20,120],screen:XY=[220,340];
  const camera=anchoredCamera(base,30,screen,anchor);
  assert.equal(camera.zoom,6);
  const actual=worldAt(screen,cameraFrame(base,camera));
  assert.ok(Math.hypot(actual[0]-anchor[0],actual[1]-anchor[1])<1e-9);
  assert.equal(anchoredCamera(base,0.1,screen,anchor).zoom,1);
});

test('the previous satellite frame stays aligned to markers during a zoom and pan',()=>{
  const previous=cameraFrame(base,home),next=cameraFrame(base,{zoom:3,center:[20,100]});
  const [a,b,c,d,e,f]=frameTransform(previous,next);
  const world:XY=[12,60];
  const old:XY=[160+(world[0]-home.center[0])*previous.scale,270-(world[1]-home.center[1])*previous.scale];
  const projected:XY=[a*old[0]+c*old[1]+e,b*old[0]+d*old[1]+f];
  const result=worldAt(projected,next);
  assert.ok(Math.hypot(result[0]-world[0],result[1]-world[1])<1e-9);
});
