import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardsOnLine, localPoint, planCaddie, greenDistances, mappedLie } from '../src/strategy';
import { startHole, nextShot, playingKey, usableBall } from '../src/round-state';
import { clubStats, parseNote } from '../src/caddie';
import type { Club, Hole, Shot, XY } from '../src/store';
const box = (x:number,y:number,w:number,h:number): XY[] => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const hole: Hole = {id:'h', courseId:'c',number:1,par:5,handicap:1,centerM:500,frontM:490,backM:510,windKmh:0,windDir:'N',tempC:20,elevationM:0,bearing:0,mapBearing:0,tee:{lat:-23,lon:150},weatherAt:Date.now(),slopeKnown:true,
  shape:{path:[[0,0],[0,500]],green:box(-10,490,20,20),fairways:[],water:[],bunkers:[]}};
const club = (id:string,carryM:number):Club => ({id,name:id,type:id==='Driver'?'Driver':'Iron',carryM,totalM:carryM+10,loft:30});
const data = { clubs:[club('Driver',220),club('7 iron',140),club('Wedge',80)], shots:[], profile:null };
test('next shot clears old tee distances until the new ball is set',()=>{
 const p=nextShot(startHole(hole,'r')); assert.equal(p.shot,2);assert.equal(p.ball,null);
 const plan=planCaddie(hole,p,data,'m');assert.equal(plan.distanceM,null);assert.equal(plan.advice,null);
});
test('second shot uses actual ball distance and target not tee length',()=>{
 const p={...nextShot(startHole(hole,'r')),ball:[0,340] as XY,source:'map' as const,lie:'Fairway'};
 assert.equal(planCaddie(hole,p,data,'m').distanceM,160);
 const targetPlan=planCaddie(hole,{...p,target:[0,420]},data,'m');assert.equal(targetPlan.distanceM,80);
 assert.equal(targetPlan.advice?.club,'Wedge');
});
test('driver cannot be recommended into crossing water; a layup is chosen',()=>{
 const h={...hole,shape:{...hole.shape!,water:[box(-40,195,80,45)]}};
 const p=planCaddie(h,startHole(h,'r'),data,'m');
 assert.equal(p.advice?.club,'7 iron');assert.ok(p.plannedTarget![1]<195);assert.equal(p.hazards[0].kind,'Water');
});
test('a conservatively cleared short water crossing allows the driver',()=>{
 const h={...hole,shape:{...hole.shape!,water:[box(-40,60,80,30)]}};
 assert.equal(planCaddie(h,startHole(h,'r'),data,'m').advice?.club,'Driver');
});
test('no candidate clear of hazards withholds a club recommendation',()=>{
 const h={...hole,shape:{...hole.shape!,water:[box(-40,5,80,490)]}};
 assert.equal(planCaddie(h,startHole(h,'r'),data,'m').advice?.club,null);
});
test('large water polygon crossing the shot is detected even with distant vertices',()=>{
 const h={...hole,shape:{...hole.shape!,water:[box(-1000,200,2000,20)]}};
 const result=hazardsOnLine(h,[0,0],[0,500]);assert.equal(result.length,1);assert.ok(result[0].nearM<201);
});
test('bunker beside the landing area and roll beyond carry are checked',()=>{
 const h={...hole,shape:{...hole.shape!,bunkers:[box(6,220,12,20)]}};
 assert.notEqual(planCaddie(h,startHole(h,'r'),data,'m').advice?.club,'Driver');
});
test('stale GPS is not used for a new recommendation',()=>{
 const p={...startHole(hole,'r'),source:'gps' as const,accuracyM:5,locatedAt:Date.now()-180000};
 assert.equal(usableBall(p),null);assert.equal(planCaddie(hole,p,data,'m').advice,null);
});
test('manual distance gives advice but does not claim hazard clearance or directional aim',()=>{
 const p={...nextShot(startHole(hole,'r')),source:'manual' as const,remainingM:135};
 const plan=planCaddie(hole,p,data,'m');assert.equal(plan.distanceM,135);assert.equal(plan.hazards.length,0);
 assert.ok(plan.warnings.some(w=>w.includes('cannot be checked')));assert.ok(!plan.advice?.lines.some(l=>l.label==='Aim'));
});
test('weather and slope are excluded when unknown, including old saved courses',()=>{
 const h={...hole,weatherAt:undefined,slopeKnown:undefined,windKmh:40,tempC:4,elevationM:30};
 const p=planCaddie(h,startHole(h,'r'),data,'m');assert.equal(p.advice?.playsLikeM,500);
 assert.ok(p.warnings.some(w=>w.includes('Weather')));
});
test('front/back use real polygon distance from ball; missing edges stay unknown',()=>{
 const ds=greenDistances(hole,[0,400])!;assert.equal(ds.center,100);assert.ok(ds.front!<ds.back!);
 assert.equal(greenDistances({...hole,shape:{...hole.shape!,green:null}},[0,400])?.front,null);
});
test('geometry coordinates follow the imported tee heading',()=>{
 const tee={lat:0,lon:0};assert.ok(Math.abs(localPoint({lat:0,lon:0.001},tee,90)[0])<0.01);
 assert.ok(localPoint({lat:0,lon:0.001},tee,90)[1]>111);
});
test('total distance and invalid shots do not train carry recommendations',()=>{
 const shots:Shot[]=Array.from({length:4},(_,i)=>({id:String(i),clubId:'Driver',clubName:'Driver',carryM:300,direction:'Straight',lie:'Tee',holeId:'h',createdAt:new Date().toISOString(),measurement:'total'}));
 assert.equal(clubStats(data.clubs,shots).find(s=>s.clubId==='Driver')?.n,0);
});
test('spoken wind speed is not mistaken for distance',()=>{
 assert.equal(parseNote('wind 25 km/h in heavy rough','m').distanceM,undefined);
 assert.equal(parseNote('150 yards in the rough','m').distanceM,137);
 assert.equal(parseNote('150 out','m').distanceM,150);
 assert.equal(parseNote('1000 metres','m').distanceM,undefined);
});
test('hole and round state are isolated and green lie is identified',()=>{
 assert.notEqual(playingKey('h','r1'),playingKey('h','r2'));
 assert.notEqual(playingKey('h1',null),playingKey('h2',null));assert.equal(mappedLie(hole,[0,500]),'Green');
 const plan=planCaddie(hole,{...startHole(hole,'r'),ball:[0,500],source:'map',lie:'Green'},data,'m');assert.equal(plan.advice,null);
});
test('metres and yards share the same underlying geometry and club plan',()=>{
 const p=startHole(hole,'r');const m=planCaddie(hole,p,data,'m'),y=planCaddie(hole,p,data,'yd');
 assert.equal(m.advice?.club,y.advice?.club);assert.deepEqual(m.plannedTarget,y.plannedTarget);
});
