import type { Pt } from './geo';

export type MapWay = { id?: number; tags?: Record<string,string|undefined>; geometry?: Pt[] };
export const CAPRICORN_REVISION = 'capricorn-championship-osm-2026-11-09';
export const CAPRICORN_NAME = 'Capricorn Resort — Championship';
// OSM way 332993065 still encloses both the Championship and the closed Resort course.
// Keep an explicit routing: never choose individual holes by whichever is longest.
export const CAPRICORN_HOLES = [1175463527,1175463526,1175463528,1175463525,1175463524,1175463523,1175463522,1175463521,1175463520,1175463519,1175463518,1175463517,1175463516,1175463515,1175463514,1175463513,1175463512,1175463511];
const forward = new Set([3,10,11,13,14]);
const pars = [5,4,3,4,4,4,3,4,5,4,3,4,4,3,5,4,4,5];
export function isCapricorn(c: { name:string;lat:number|null;lon:number|null }): boolean {
  return /capricorn/i.test(c.name) && c.lat !== null && c.lon !== null && Math.abs(c.lat + 23.0598)<0.02 && Math.abs(c.lon-150.7541)<0.025;
}
export function selectLayout(elements:MapWay[], capricorn=false):MapWay[] {
  if (capricorn) {
    const selected = CAPRICORN_HOLES.map((id,i)=>{
      const way=elements.find(w=>w.id===id && w.tags?.golf==='hole');
      if (!way?.geometry || way.geometry.length<2 || Number(way.tags?.ref)!==i+1) throw new Error('The Championship routing is incomplete. The saved map has not been changed.');
      return {...way,tags:{...way.tags,par:String(pars[i])},geometry:forward.has(i+1)?way.geometry:[...way.geometry].reverse()};
    });
    return [...elements.filter(w=>w.tags?.golf!=='hole'),...selected];
  }
  const seen=new Set<number>();
  for(const way of elements.filter(w=>w.tags?.golf==='hole')) {
    const number=parseInt(way.tags?.ref??'',10);
    if(!Number.isFinite(number)||number<1||number>18)continue;
    if(seen.has(number))throw new Error('Several course layouts share these hole numbers. A single layout must be identified before this course can be loaded.');
    seen.add(number);
  }
  return elements;
}
