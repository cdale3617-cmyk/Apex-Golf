import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('play screen shares shot, ball and target state across navigation and persisted storage', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost'});
  for (const name of ['window','document','localStorage','HTMLElement','SVGElement','Event','MouseEvent']) Object.defineProperty(globalThis,name,{value:(dom.window as any)[name],configurable:true,writable:true});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true,writable:true});
  Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
  (dom.window as any).PointerEvent=dom.window.MouseEvent;
  (globalThis as any).DOMPoint=class { constructor(public x:number,public y:number){} matrixTransform(){return this;} };
  (dom.window.SVGElement.prototype as any).setPointerCapture=()=>{};
  (dom.window.SVGElement.prototype as any).getScreenCTM=()=>({inverse:()=>({})});
  globalThis.fetch=async()=>{throw new Error('Offline test');};
  const box=(x:number,y:number,w:number,h:number)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const h={id:'h1',courseId:'c',number:1,par:5,handicap:1,centerM:500,frontM:490,backM:510,windKmh:0,windDir:'N',tempC:20,elevationM:0,bearing:0,mapBearing:0,tee:{lat:-23,lon:150},weatherAt:Date.now(),slopeKnown:true,shape:{path:[[0,0],[0,500]],green:box(-10,490,20,20),fairways:[],water:[box(-40,195,80,45)],bunkers:[]}};
  localStorage.setItem('apex.data.v1',JSON.stringify({courses:[{id:'c',name:'Test course',lat:-23,lon:150,wxAt:Date.now()}],holes:[h,{...h,id:'h2',number:2}],clubs:[['Driver',220],['7 iron',140],['Wedge',80]].map(([name,carryM])=>({id:name,name,type:'Iron',carryM,totalM:Number(carryM)+10,loft:30})),rounds:[{id:'r',courseId:'c',date:'2026-11-08',status:'In progress'}],shots:[],scores:[],profile:null}));
  const React=await import('react');
  const {render,fireEvent,cleanup}=await import('@testing-library/react');
  const Play=(await import('../src/pages/Play')).default;
  const ui=render(React.createElement(Play,{go:()=>{}}));
  try {
    assert.ok(ui.getByRole('heading',{name:'7 iron',exact:true}));
    fireEvent.click(ui.getByRole('button',{name:'Shot played',exact:true}));
    assert.ok(ui.getByRole('heading',{name:'Where is your ball?',exact:true}));
    fireEvent.click(ui.getByRole('button',{name:'Set ball on map',exact:true}));
    fireEvent.pointerDown(ui.getByRole('img'),{clientX:160,clientY:150,buttons:1,pointerId:1});
    const saved=()=>JSON.parse(localStorage.getItem('apex.data.v1')!);
    assert.equal(saved().playing['r:h1'].shot,2);assert.equal(saved().playing['r:h1'].source,'map');
    assert.ok(saved().playing['r:h1'].ball[1]>300);
    fireEvent.click(ui.getByRole('button',{name:'Move yellow target',exact:true}));
    fireEvent.pointerDown(ui.getByRole('img'),{clientX:160,clientY:80,buttons:1,pointerId:2});
    assert.ok(saved().playing['r:h1'].target);
    const ball= saved().playing['r:h1'].ball;
    fireEvent.click(ui.getByRole('button',{name:'Next',exact:true}));
    assert.ok(ui.getByRole('heading',{name:'7 iron',exact:true}));
    fireEvent.click(ui.getByRole('button',{name:'Previous',exact:true}));
    assert.deepEqual(saved().playing['r:h1'].ball,ball);
    ui.unmount();
    const again=render(React.createElement(Play,{go:()=>{}}));
    assert.ok(again.getByText('Ball set on map',{exact:true}));
    again.unmount();
  } finally {cleanup();dom.window.close();}
});
