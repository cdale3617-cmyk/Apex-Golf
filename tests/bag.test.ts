import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('launcher opens home and club editor has a fixed save action that persists carry', async()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost'});
  for(const name of ['window','document','localStorage','HTMLElement','SVGElement','Event','MouseEvent'])Object.defineProperty(globalThis,name,{value:(dom.window as any)[name],configurable:true,writable:true});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
  localStorage.setItem('apex_tab','play');
  globalThis.fetch=async()=>{throw Error('Offline');};
  const React=await import('react');
  const {render,fireEvent,cleanup}=await import('@testing-library/react');
  const App=(await import('../src/App')).default;
  const ui=render(React.createElement(App));
  try{
    assert.ok(ui.getByRole('heading',{name:'Your caddie. Every shot.'}));
    assert.equal(document.documentElement.dataset.appearance,'day');
    fireEvent.click(ui.getByRole('button',{name:'Night',exact:true}));
    assert.equal(document.documentElement.dataset.appearance,'night');
    fireEvent.click(ui.getByRole('button',{name:'Bag',exact:true}));
    fireEvent.click(ui.getByRole('button',{name:'Add club',exact:true}));
    const save=ui.getByRole('button',{name:'Save club',exact:true});
    assert.ok(save.closest('.sheet-footer'));
    fireEvent.click(save);
    assert.ok(ui.getByRole('alert').textContent?.includes('club name'));
    fireEvent.change(ui.getByLabelText('Name'),{target:{value:'8 Iron'}});
    fireEvent.change(ui.getByLabelText('Carry (m)'),{target:{value:'135'}});
    const storage=Object.getPrototypeOf(localStorage),write=storage.setItem;
    storage.setItem=function(key:string,value:string){if(key==='apex.data.v1')throw Error('Full');return write.call(this,key,value);};
    fireEvent.click(save);
    assert.ok(ui.getByRole('alert').textContent?.includes('storage is full'));
    assert.ok(ui.getByRole('dialog',{name:'Add a club'}));
    storage.setItem=write;
    fireEvent.click(save);
    assert.equal(ui.queryByRole('dialog',{name:'Add a club'}),null);
    const club=JSON.parse(localStorage.getItem('apex.data.v1')!).clubs[0];
    assert.equal(JSON.parse(localStorage.getItem('apex.data.v1')!).clubs.length,1);
    assert.equal(club.name,'8 Iron');assert.equal(club.carryM,135);assert.equal(club.totalM,135);
    fireEvent.click(ui.getByRole('button',{name:'Edit 8 Iron'}));
    assert.equal((ui.getByLabelText('Carry (m)') as HTMLInputElement).value,'135');
  }finally{cleanup();dom.window.close();}
});
