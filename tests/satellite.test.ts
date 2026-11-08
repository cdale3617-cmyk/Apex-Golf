import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geographicPoint, satelliteTiles } from '../src/components/Satellite';
import { localPoint } from '../src/strategy';
import type { Hole } from '../src/store';

test('satellite tiles align with the same heading-up GPS coordinates as the shot markers',()=>{
  const tee={lat:-23.0572591,lon:150.7552536};
  for(const bearing of [0,45,90,180,270]){
    const point=localPoint(geographicPoint([40,450],tee,bearing),tee,bearing);
    assert.ok(Math.hypot(point[0]-40,point[1]-450)<0.001);
  }
  const hole={tee,mapBearing:90} as Hole;
  const frame={minX:-45,maxX:45,minY:-25,maxY:550,scale:0.8};
  const tiles=satelliteTiles(hole,frame);
  assert.ok(tiles.length>0&&tiles.length<=80);
  for(const tile of tiles){
    assert.ok(tile.url.startsWith('https://server.arcgisonline.com/'));
    assert.ok(tile.transform.slice(7,-1).split(' ').map(Number).every(Number.isFinite));
  }
  assert.deepEqual(satelliteTiles({} as Hole,frame),[]);
});

test('HTTP-success no-data pictures are rejected and the whole frame retries at an available zoom',async()=>{
  const {unavailablePixels,loadSatelliteFrame,satelliteZoom}=await import('../src/components/Satellite');
  const placeholder=new Uint8Array(Array.from({length:100},()=>[204,204,204,255]).flat());
  const photograph=new Uint8Array(Array.from({length:100},()=>[110,112,81,255]).flat());
  assert.equal(unavailablePixels(placeholder),true);
  assert.equal(unavailablePixels(photograph),false);
  const hole={tee:{lat:-23.1457524,lon:150.7199949},mapBearing:0} as Hole;
  const frame={minX:-30,maxX:30,minY:-25,maxY:370,scale:1.2};
  assert.equal(satelliteZoom(hole,frame),19);
  const tried=new Set<number>();
  const result=await loadSatelliteFrame(hole,frame,async tile=>{
    const zoom=Number(tile.url.match(/tile\/(\d+)/)![1]);tried.add(zoom);
    // Both replies are HTTP 200. Their decoded pixels decide whether they are useful.
    const response={ok:true,pixels:zoom===19?placeholder:photograph};
    if(unavailablePixels(response.pixels))throw Error('No imagery at this zoom');
    return tile.url;
  },new AbortController().signal);
  assert.deepEqual([...tried],[19,18]);
  assert.ok(result.tiles.every(tile=>tile.url.includes('/tile/18/')));
  assert.equal(result.images.length,result.tiles.length);
});
