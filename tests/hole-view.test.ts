import {test} from 'node:test';
import assert from 'node:assert/strict';
import {holeView,teeBottomFrame} from '../src/hole-view';
import {greenCentre,localPoint} from '../src/strategy';
import {geographicPoint} from '../src/satellite-geometry';
import type {Hole,XY} from '../src/store';

test('every saved hole orientation places the tee at the bottom with the green ahead',()=>{
  for(const end of [[0,500],[500,0],[0,-500],[-500,0],[200,-400]] as XY[]){
    const hole={id:'h',tee:{lat:-23,lon:150},mapBearing:0,bearing:0,shape:{path:[[0,0],end],green:null,fairways:[],water:[[[20,80],[40,80],[40,100]]],bunkers:[]}} as Hole;
    const before=JSON.stringify(hole),view=holeView(hole),projected=view.project(hole);
    const tee=projected.shape!.path[0],green=greenCentre(projected)!;
    assert.ok(green[1]>tee[1]);assert.ok(Math.abs(green[0]-tee[0])<1e-8);
    const frame=teeBottomFrame(tee,projected.shape!.path);
    const sx=160+(tee[0]-(frame.minX+frame.maxX)/2)*frame.scale;
    const sy=270-(tee[1]-(frame.minY+frame.maxY)/2)*frame.scale;
    assert.ok(Math.abs(sx-160)<1e-8);assert.ok(Math.abs(sy-500)<1e-8);
    const greenY=270-(green[1]-(frame.minY+frame.maxY)/2)*frame.scale;
    assert.ok(greenY>=40&&greenY<500);
    assert.equal(JSON.stringify(hole),before,'view rotation never changes stored course data');
  }
});

test('rotated imagery, hazards and editable markers retain the same GPS positions and distances',()=>{
  const hole={tee:{lat:-23.1,lon:150.7},mapBearing:75,bearing:75,teeMarker:[30,20],greenMarker:[-100,-450],shape:{path:[[0,0],[0,-500]],green:null,fairways:[],water:[],bunkers:[]}} as Hole;
  const view=holeView(hole),projected=view.project(hole),original:XY=[20,-120];
  const gps=geographicPoint(original,hole.tee!,hole.mapBearing!);
  const fromGps=localPoint(gps,projected.tee!,projected.mapBearing!);
  const expected=view.rotate(original);
  assert.ok(Math.hypot(fromGps[0]-expected[0],fromGps[1]-expected[1])<0.001);
  const restored=view.rotate(expected,true);
  assert.ok(Math.hypot(restored[0]-original[0],restored[1]-original[1])<1e-8);
  const a=view.rotate(hole.teeMarker!),b=view.rotate(hole.greenMarker!);
  assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-Math.hypot(130,470))<1e-8);
});
