import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coveredZoom, loadGoogleFrame, viewportFor, type GoogleBridge } from '../src/google-tiles';
import type { Hole } from '../src/store';

const hole = {tee:{lat:-23.1457524,lon:150.7199949},mapBearing:45} as Hole;
const frame = {minX:-30,maxX:30,minY:-25,maxY:370,scale:1.2};
const world = {north:90,south:-90,east:180,west:-180,maxZoom:18};

test('Google coverage limits requests to supported detail across the whole viewport',()=>{
  const view=viewportFor(hole,frame);
  assert.ok(view.north>hole.tee!.lat && view.south<hole.tee!.lat);
  assert.equal(coveredZoom(view,[world],22),18);
  assert.equal(coveredZoom(view,[world,{...view,maxZoom:21}],22),21);
  assert.throws(()=>coveredZoom(view,[],22),/coverage/);
});

test('Google requests current-view tiles after attribution, in bounded batches and stops on navigation',async()=>{
  const controller=new AbortController(); let active=0, peak=0, tiles=0;
  const bridge: GoogleBridge = {async request(options){
    if(options.kind==='viewport')return {copyright:'Imagery © Example',maxZoomRects:[world]};
    tiles++; active++; peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,1)); active--;
    return {dataUrl:'data:image/jpeg;base64,example'};
  }};
  const result=await loadGoogleFrame(hole,frame,controller.signal,bridge);
  assert.equal(result.attribution,'Imagery © Example');
  assert.ok(tiles>0&&peak<=6);
  assert.equal(result.tiles.length,result.images.length);
  assert.ok(result.tiles.every(tile=>tile.z===18));
  controller.abort(); const previous=tiles;
  await assert.rejects(loadGoogleFrame(hole,frame,controller.signal,bridge),/stopped/);
  assert.equal(tiles,previous);
});

test('Google pictures are not shown without source attribution or after leaving the hole',async()=>{
  const noAttribution: GoogleBridge={async request(){return {maxZoomRects:[world]};}};
  await assert.rejects(loadGoogleFrame(hole,frame,new AbortController().signal,noAttribution),/attribution/);
  const controller=new AbortController();let requested=0;
  const navigation: GoogleBridge={async request(options){
    if(options.kind==='viewport')return {copyright:'Example',maxZoomRects:[world]};
    requested++;controller.abort();return {dataUrl:'data:image/jpeg;base64,example'};
  }};
  await assert.rejects(loadGoogleFrame(hole,frame,controller.signal,navigation),/stopped/);
  assert.ok(requested<=6);
});
