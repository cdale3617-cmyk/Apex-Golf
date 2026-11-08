import React, { useEffect, useState } from 'react';
import type { Hole } from '../store';
import type { MapFrame, satelliteTiles } from '../satellite-geometry';
import { loadGoogleFrame } from '../google-tiles';
import { frameTransform } from '../map-camera';

export function GoogleSatellite({hole,frame,onAttribution}:{hole:Hole;frame:MapFrame;onAttribution:(text:string)=>void}) {
  const identity=JSON.stringify([hole.id,hole.tee,hole.mapBearing]);
  const key=JSON.stringify([identity,frame]);
  const [loaded,setLoaded]=useState<{key:string;identity:string;frame:MapFrame;tiles:ReturnType<typeof satelliteTiles>;images:string[]}|null>(null);
  const [problem,setProblem]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setProblem('');
    // Wait for a pinch/pan to settle instead of issuing requests for every finger movement.
    const timer=setTimeout(()=>{
      loadGoogleFrame(hole,frame,controller.signal).then(result=>{
        if(controller.signal.aborted)return;
        setLoaded({key,identity,frame,...result});onAttribution(`Google Maps · ${result.attribution}`);
      }).catch(error=>{
        if(!controller.signal.aborted)setProblem(error instanceof Error?error.message:'Google satellite unavailable.');
      });
    },180);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[key,onAttribution]);
  useEffect(()=>{setLoaded(null);onAttribution('');},[identity,onAttribution]);
  const visible=loaded?.identity===identity?loaded:null;
  return <g className="satellite-layer" pointerEvents="none">
    {visible&&<g transform={`matrix(${frameTransform(visible.frame,frame).join(' ')})`}>
      {visible.tiles.map((tile,i)=><image key={`${tile.z}/${tile.x}/${tile.y}`} href={visible.images[i]} width="256.5" height="256.5" transform={tile.transform}/>)}
    </g>}
    {(problem||loaded?.key!==key)&&<text x="10" y="22" fontSize="9" className="map-status">{problem||(visible?'Loading satellite detail…':'Loading Google satellite…')}</text>}
  </g>;
}
