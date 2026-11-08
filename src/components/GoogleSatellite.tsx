import React, { useEffect, useState } from 'react';
import type { Hole } from '../store';
import type { MapFrame, satelliteTiles } from '../satellite-geometry';
import { loadGoogleFrame } from '../google-tiles';

export function GoogleSatellite({hole,frame,onAttribution}:{hole:Hole;frame:MapFrame;onAttribution:(text:string)=>void}) {
  const key=JSON.stringify([hole.tee,hole.mapBearing,frame]);
  const [loaded,setLoaded]=useState<{key:string;tiles:ReturnType<typeof satelliteTiles>;images:string[]}|null>(null);
  const [problem,setProblem]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setLoaded(null); setProblem(''); onAttribution('');
    loadGoogleFrame(hole,frame,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      setLoaded({key,...result}); onAttribution(`Google Maps · ${result.attribution}`);
    }).catch(error=>{
      if(!controller.signal.aborted)setProblem(error instanceof Error?error.message:'Google satellite unavailable.');
    });
    return ()=>controller.abort();
  },[key,onAttribution]);
  const visible=loaded?.key===key?loaded:null;
  return <g className="satellite-layer" pointerEvents="none">
    {visible?.tiles.map((tile,i)=><image key={`${tile.z}/${tile.x}/${tile.y}`} href={visible.images[i]} width="256.5" height="256.5" transform={tile.transform}/>)}
    {!visible&&<text x="10" y="22" fontSize="9" className="map-status">{problem||'Loading Google satellite…'}</text>}
  </g>;
}
