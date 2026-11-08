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
