import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {CAPRICORN_HOLES,CAPRICORN_REVISION,selectLayout,type MapWay} from '../src/course-layout';
import {metres} from '../src/geo';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/capricorn-osm.json',import.meta.url),'utf8')) as MapWay[];

test('36-hole Capricorn source never mixes the closed Resort routing into Championship',async()=>{
  assert.equal(fixture.filter(w=>w.tags?.golf==='hole').length,36);
  assert.throws(()=>selectLayout(fixture),/Several course layouts/);
  const selected=selectLayout(fixture,true).filter(w=>w.tags?.golf==='hole');
  assert.deepEqual(selected.map(w=>w.id),CAPRICORN_HOLES);
  assert.equal(selected[3].tags?.par,'4');
  const greens=fixture.filter(w=>w.tags?.golf==='green').map(w=>{
    const g=w.geometry!;return {lat:g.reduce((s,p)=>s+p.lat,0)/g.length,lon:g.reduce((s,p)=>s+p.lon,0)/g.length};
  });
  const used=new Set<number>();
  for(const h of selected){
    const g=h.geometry!,end=g.at(-1)!;
    const ds=greens.map(p=>metres(p,end));const nearest=Math.min(...ds);
    assert.ok(nearest<30,`Hole ${h.tags?.ref} ends on its mapped green`);
    used.add(ds.indexOf(nearest));
    assert.ok(metres(g[0],end)>100 && metres(g[0],end)<600);
  }
  assert.equal(used.size,18);
  assert.throws(()=>selectLayout(fixture.filter(w=>w.id!==CAPRICORN_HOLES[3]),true),/incomplete/);
});

test('saved mixed course repairs offline once, preserves scores and bag and backs up old coordinates',async()=>{
  const dom=new JSDOM('',{url:'http://localhost'});
  Object.defineProperty(globalThis,'localStorage',{value:dom.window.localStorage,configurable:true});
  Object.defineProperty(globalThis,'window',{value:dom.window,configurable:true});
  Object.defineProperty(globalThis,'Event',{value:dom.window.Event,configurable:true});
  const {actions,getState}=await import('../src/store');
  const {buildHoles,repairCapricorn}=await import('../src/courses');
  const {startHole,playingKey}=await import('../src/round-state');
  const rows=buildHoles(fixture,true);
  assert.equal(rows.length,18);assert.equal(rows[3].par,4);
  const courseId=actions.addCourse({name:'Mercure Capricorn Resort Golf',location:'Yeppoon',holes:18,par:72,lat:-23.0598,lon:150.7541},rows.map(h=>({number:h.number,par:5,handicap:0,centerM:999,frontM:999,backM:999,windKmh:0,windDir:'N',tempC:20,elevationM:0,bearing:0,tee:{lat:0,lon:0},shape:h.shape,teeMarker:[900,900]})));
  actions.saveClub({name:'Driver',type:'Driver',loft:10,carryM:232,totalM:250});
  const round=actions.startRound(courseId,'2026-11-08');actions.saveScore(round,4,{strokes:5,putts:2,fairwayHit:true});
  const old=getState().holes.find(h=>h.courseId===courseId&&h.number===4)!;
  actions.setPlaying({...startHole(old,round),target:[-1000,500]});
  const clubs=getState().clubs,scores=getState().scores;
  const storage=Object.getPrototypeOf(localStorage),write=storage.setItem;
  storage.setItem=()=>{throw Error('Full');};
  assert.equal(repairCapricorn(courseId),false);assert.equal(getState().holes.find(h=>h.id===old.id)?.centerM,999);
  storage.setItem=write;
  assert.equal(repairCapricorn(courseId),true);
  const fixed=getState().holes.find(h=>h.id===old.id)!;
  assert.equal(fixed.par,4);assert.ok(fixed.centerM<450);assert.equal(fixed.teeMarker,undefined);
  assert.ok(getState().playing[playingKey(old.id,round)].ball!.every(v=>v===0));
  assert.equal(getState().playing[playingKey(old.id,round)].target,null);
  assert.equal(getState().clubs,clubs);assert.equal(getState().scores,scores);
  assert.equal(getState().mappingBackups?.[0].holes.find(h=>h.id===old.id)?.centerM,999);
  assert.equal(getState().courses[0].mappingRevision,CAPRICORN_REVISION);
  assert.equal(repairCapricorn(courseId),false);assert.equal(getState().mappingBackups?.length,1);
  assert.equal(JSON.parse(localStorage.getItem('apex.data.v1')!).mappingBackups.length,1);
  dom.window.close();
});
