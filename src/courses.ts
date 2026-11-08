import { actions, getState, type Hole, type Shape, type XY } from "./store";
import { edgeDistance } from "./strategy";
import { COMPASS, bearing, metres, type Dir, type Pt } from "./geo";
import { CAPRICORN_NAME, CAPRICORN_REVISION, isCapricorn, selectLayout, type MapWay } from './course-layout';
import capricornMap from './data/capricorn-championship.json';

// Courses come from OpenStreetMap (search and hole maps) and Open-Meteo (weather and height).
// These services are asked straight from the phone. Nothing goes through a server of ours.

export type Hit = { id: string; name: string; location: string; lat: number; lon: number; south: number; west: number; north: number; east: number };
type Way = MapWay;
type Box = { south: number; north: number; west: number; east: number };
type Nom = { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string; category?: string; type?: string; boundingbox: string[] };
type HoleIn = { number: number; par: number | null; handicap: number | null; edgesEstimated: boolean; lengthM: number; frontM: number; backM: number; teeLat: number; teeLon: number; greenLat: number; greenLon: number; bearing: number; shape: Shape };

const MIRRORS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

async function nominatim(q: string, box?: Box): Promise<Nom[]> {
  const area = box ? "&viewbox=" + box.west + "," + box.north + "," + box.east + "," + box.south + "&bounded=1" : "";
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=" + (box ? 30 : 15) + "&q=" + encodeURIComponent(q) + area);
    if (!r.ok) return [];
    return (await r.json()) as Nom[];
  } catch {
    return [];
  }
}

const isCourse = (h: Nom) => h.category === "leisure" && h.type === "golf_course";

/** Finds courses by club name, by a looser version of the name, or by the town they are in. */
export async function searchCourses(query: string): Promise<Hit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const found = new Map<string, Nom>();
  const add = (list: Nom[]) => {
    for (const h of list) if (isCourse(h) && !found.has(h.osm_type + "/" + h.osm_id)) found.set(h.osm_type + "/" + h.osm_id, h);
  };
  const core = q.replace(/\b(golf|links|club|course|country|resort|gc|g\.c\.|cc|the)\b/gi, " ").replace(/\s{2,}/g, " ").trim();
  const tries = [q, q + " golf course"];
  if (core && core.toLowerCase() !== q.toLowerCase()) tries.push(core + " golf");
  for (const t of tries) {
    add(await nominatim(t));
    if (found.size >= 8) break;
  }
  if (found.size < 6) {
    const place = (await nominatim(core || q)).find((h) => !isCourse(h) && h.boundingbox);
    if (place) {
      const [s, n, w, e] = place.boundingbox.map(Number);
      const pad = 0.03;
      const box = { south: s - pad, north: n + pad, west: w - pad, east: e + pad };
      add(await nominatim("golf course", box));
      if (found.size < 6) add(await nominatim("golf club", box));
    }
  }
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const score = (h: Nom) => {
    const hay = ((h.name ?? "") + " " + h.display_name).toLowerCase();
    return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) + ((h.name ?? "").toLowerCase() === q.toLowerCase() ? 5 : 0);
  };
  const seen = new Set<string>();
  return [...found.values()]
    .sort((a, z) => score(z) - score(a))
    .filter((h) => {
      const key = (h.name ?? "").toLowerCase() + "|" + Number(h.lat).toFixed(2) + "|" + Number(h.lon).toFixed(2);
      if (!h.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 15)
    .map((h) => {
      const parts = h.display_name.split(",").map((p) => p.trim());
      const [south, north, west, east] = h.boundingbox.map(Number);
      return { id: h.osm_type + "/" + h.osm_id, name: h.name || parts[0], location: parts.slice(1, 4).join(", "), lat: Number(h.lat), lon: Number(h.lon), south, west, north, east };
    });
}

async function mapData(hit: Hit): Promise<Way[]> {
  const box = hit.south + "," + hit.west + "," + hit.north + "," + hit.east;
  const w = (t: string) => "way[" + t + "](" + box + ");";
  const query = "[out:json][timeout:30];(" + w('"golf"="hole"') + w('"golf"="green"') + w('"golf"="fairway"') + w('"golf"="bunker"') + w('"golf"="water_hazard"') + w('"golf"="lateral_water_hazard"') + w('"natural"="water"') + ");out geom tags;";
  // Ask every mirror at once and take the first good answer: any one of them can be busy.
  const controllers = MIRRORS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((c) => c.abort()), 40000);
  try {
    const elements = await Promise.any(
      MIRRORS.map(async (url, i) => {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query), signal: controllers[i].signal });
        if (!r.ok) throw new Error(String(r.status));
        return ((await r.json()) as { elements: Way[] }).elements;
      }),
    );
    controllers.forEach((c) => c.abort());
    return elements;
  } catch {
    throw new Error("The course map service did not answer. Try again in a minute.");
  } finally {
    clearTimeout(timer);
  }
}

export function buildHoles(input: Way[], capricorn = false): HoleIn[] {
  const elements = selectLayout(input, capricorn);
  const greens = elements.filter((e) => e.tags?.golf === "green" && e.geometry && e.geometry.length > 2);
  const holeWays = elements.filter((e) => e.tags?.golf === "hole" && e.geometry && e.geometry.length >= 2);
  const anyRef = holeWays.some((w) => Number.isFinite(parseInt(w.tags?.ref ?? "", 10)));
  const byNumber = new Map<number, HoleIn>();
  holeWays.forEach((w, i) => {
    const g = w.geometry as Pt[];
    const number = anyRef ? parseInt(w.tags?.ref ?? "", 10) : i + 1;
    if (!Number.isFinite(number) || number < 1 || number > 18) return;
    let length = 0;
    for (let k = 1; k < g.length; k++) length += metres(g[k - 1], g[k]);
    if (length < 40) return;
    const tee = g[0];
    const end = g[g.length - 1];
    // The green outline nearest the end of the hole gives real front and back edges.
    let front = length - 12;
    let back = length + 12;
    let best = 80;
    let greenRing: Pt[] | null = null;
    greens.forEach((gr) => {
      const ring = gr.geometry as Pt[];
      const centre = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
      const d = metres(end, centre);
      if (d < best) {
        best = d;
        greenRing = ring;
        const fromTee = ring.map((p) => metres(tee, p));
        const toCentre = metres(tee, centre);
        front = length + (Math.min(...fromTee) - toCentre);
        back = length + (Math.max(...fromTee) - toCentre);
      }
    });
    const par = parseInt(w.tags?.par ?? "", 10);
    const handicap = parseInt(w.tags?.handicap ?? w.tags?.["golf:handicap"] ?? "", 10);
    const next: HoleIn = {
      number, par: Number.isFinite(par) ? par : null, handicap: Number.isFinite(handicap) ? handicap : null,
      edgesEstimated: !greenRing, lengthM: length, frontM: Math.max(1, front), backM: back,
      teeLat: tee.lat, teeLon: tee.lon, greenLat: end.lat, greenLon: end.lon, bearing: bearing(tee, end), shape: shapeFor(g, elements, greenRing),
    };
    byNumber.set(number, next);
  });
  return [...byNumber.values()].sort((a, z) => a.number - z.number);
}

export type Weather = { tempC: number; windKmh: number; windDir: Dir };

export async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,wind_speed_10m,wind_direction_10m");
    const cur = ((await r.json()) as { current?: { temperature_2m?: number; wind_speed_10m?: number; wind_direction_10m?: number } }).current;
    if (!cur) return null;
    const deg = cur.wind_direction_10m;
    return { tempC: Math.round(cur.temperature_2m ?? 20), windKmh: Math.round(cur.wind_speed_10m ?? 0), windDir: typeof deg === "number" ? COMPASS[Math.round(deg / 45) % 8] : "N" };
  } catch {
    return null;
  }
}

/** Brings the wind and temperature up to date when the saved ones are old. */
export async function refreshWeather(courseId: string, force = false): Promise<boolean> {
  const c = getState().courses.find((x) => x.id === courseId);
  if (!c || c.lat === null || c.lon === null) return false;
  if (!force && getState().holes.filter(h => h.courseId === courseId).every(h => h.weatherAt && Date.now() - h.weatherAt < 45 * 60 * 1000)) return false;
  const w = await fetchWeather(c.lat, c.lon);
  if (!w) return false;
  actions.setWeather(courseId, w);
  return true;
}

const guessPar = (m: number) => (m <= 230 ? 3 : m <= 430 ? 4 : 5);

function championshipRows(): Omit<Hole,'id'|'courseId'>[] {
  return buildHoles(capricornMap,true).map(h=>({number:h.number,par:h.par!,handicap:0,
    centerM:Math.round(h.lengthM),frontM:Math.round(h.frontM),backM:Math.round(h.backM),
    tee:{lat:h.teeLat,lon:h.teeLon},mapBearing:h.bearing,bearing:h.bearing,shape:h.shape,
    edgesEstimated:h.edgesEstimated,windKmh:0,windDir:'N',tempC:20,elevationM:0,slopeKnown:false}));
}

/** Repair the known combined 36-hole import, including stale coordinates, without network access. */
export function repairCapricorn(courseId:string):boolean {
  const course=getState().courses.find(c=>c.id===courseId);
  if(!course || !isCapricorn(course) || course.mappingRevision===CAPRICORN_REVISION)return false;
  return actions.replaceCourseMapping(courseId,CAPRICORN_NAME,CAPRICORN_REVISION,championshipRows());
}

export async function importCourse(hit: Hit, progress: (m: string) => void): Promise<string> {
  if(isCapricorn(hit)) {
    const existing=getState().courses.find(isCapricorn);
    if(existing){
      repairCapricorn(existing.id);
      if(getState().courses.find(c=>c.id===existing.id)?.mappingRevision!==CAPRICORN_REVISION)throw new Error('The repaired mapping could not be saved. Free some storage and try again.');
      return existing.id;
    }
    const rows=championshipRows();
    return actions.addCourse({name:CAPRICORN_NAME,location:hit.location,holes:18,par:72,lat:hit.lat,lon:hit.lon,mappingRevision:CAPRICORN_REVISION},rows);
  }
  progress("Reading " + hit.name + " hole by hole…");
  const holes = buildHoles(await mapData(hit));
  if (!holes.length) throw new Error("This course has no mapped holes yet, so there are no distances to load. Type it in by hand instead.");
  const existing = getState().courses.find((c) => c.name.toLowerCase() === hit.name.toLowerCase());
  if (existing) {
    const map: Record<number, number> = {};
    holes.forEach((h) => { map[h.number] = h.bearing; });
    actions.setBearings(existing.id, map);
    const shapes: Record<number, Shape> = {};
    holes.forEach((h) => { shapes[h.number] = h.shape; });
    actions.setShapes(existing.id, shapes, map, Object.fromEntries(holes.map((h) => [h.number, { lat: h.teeLat, lon: h.teeLon }])));
    return existing.id;
  }
  progress("Found " + holes.length + " holes. Checking weather and slope…");
  const w = await fetchWeather(hit.lat, hit.lon);
  let elevations: number[] = [];
  try {
    const lats = holes.flatMap((h) => [h.teeLat, h.greenLat]).map((v) => v.toFixed(5)).join(",");
    const lons = holes.flatMap((h) => [h.teeLon, h.greenLon]).map((v) => v.toFixed(5)).join(",");
    const r = await fetch("https://api.open-meteo.com/v1/elevation?latitude=" + lats + "&longitude=" + lons);
    elevations = ((await r.json()) as { elevation?: number[] }).elevation ?? [];
  } catch {
    elevations = [];
  }
  const rows: Omit<Hole, "id" | "courseId">[] = holes.map((h, i) => {
    const rise = elevations.length >= (i + 1) * 2 ? Math.round(elevations[i * 2 + 1] - elevations[i * 2]) : 0;
    return {
      tee: { lat: h.teeLat, lon: h.teeLon }, mapBearing: h.bearing, edgesEstimated: h.edgesEstimated, weatherAt: w ? Date.now() : undefined, slopeKnown: elevations.length >= (i + 1) * 2,
      number: h.number,
      par: h.par && h.par >= 3 && h.par <= 6 ? h.par : guessPar(h.lengthM),
      handicap: h.handicap ?? 0,
      centerM: Math.round(h.lengthM), frontM: Math.round(h.frontM), backM: Math.round(h.backM),
      windKmh: w?.windKmh ?? 0, windDir: w?.windDir ?? "N", tempC: w?.tempC ?? 20, elevationM: rise, bearing: h.bearing, shape: h.shape,
    };
  });
  return actions.addCourse({ name: hit.name, location: hit.location, holes: rows.length, par: rows.reduce((s, h) => s + h.par, 0), lat: hit.lat, lon: hit.lon }, rows);
}

/** A course typed in by hand, for places the map data doesn't cover. */
export async function addManualCourse(name: string, location: string, list: { number: number; par: number; lengthM: number }[]): Promise<string> {
  const n = name.trim();
  if (!n) throw new Error("Give the course a name.");
  const holes = list.filter((h) => h.par >= 3 && h.par <= 6 && h.lengthM >= 40 && h.lengthM <= 700);
  if (!holes.length) throw new Error("Add at least one hole with a par and a length.");
  if (getState().courses.some((c) => c.name.toLowerCase() === n.toLowerCase())) throw new Error("A course with this name is already in your list.");
  let w: Weather | null = null;
  let lat: number | null = null;
  let lon: number | null = null;
  const place = (await nominatim(location ? n + " " + location : n))[0] ?? (location ? (await nominatim(location))[0] : undefined);
  if (place) {
    lat = Number(place.lat);
    lon = Number(place.lon);
    w = await fetchWeather(lat, lon);
  }
  const rows: Omit<Hole, "id" | "courseId">[] = holes
    .sort((a, z) => a.number - z.number)
    .map((h) => ({
      number: h.number, par: h.par, handicap: 0, edgesEstimated: true, weatherAt: w ? Date.now() : undefined,
      centerM: Math.round(h.lengthM), frontM: Math.round(h.lengthM - 10), backM: Math.round(h.lengthM + 10),
      windKmh: w?.windKmh ?? 0, windDir: w?.windDir ?? "N", tempC: w?.tempC ?? 20, elevationM: 0, bearing: null,
    }));
  return actions.addCourse({ name: n, location: location.trim(), holes: rows.length, par: rows.reduce((s, h) => s + h.par, 0), lat, lon }, rows);
}

const segDist = (p: XY, a: XY, b: XY) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const pathDist = (p: XY, path: XY[]) => {
  let m = Infinity;
  for (let i = 1; i < path.length; i++) m = Math.min(m, segDist(p, path[i - 1], path[i]));
  return m;
};

/** The hole and what sits beside it (fairway, bunkers, water, green), turned so the tee is at the bottom and the green straight up. */
function shapeFor(g: Pt[], elements: Way[], greenRing: Pt[] | null): Shape {
  const t = g[0];
  const b = (bearing(t, g[g.length - 1]) * Math.PI) / 180;
  const kx = Math.cos((t.lat * Math.PI) / 180) * 111320;
  const local = (p: Pt): XY => {
    const x = (p.lon - t.lon) * kx;
    const y = (p.lat - t.lat) * 110540;
    return [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
  };
  const r1 = (p: XY): XY => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
  const thin = (pts: XY[], max: number): XY[] => {
    if (pts.length <= max) return pts.map(r1);
    const out: XY[] = [];
    for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
    return out.map(r1);
  };
  const full = g.map(local);
  const near = (test: (w: Way) => boolean, d: number, max: number, pts: number): XY[][] =>
    elements
      .filter((w) => w.geometry && w.geometry.length > 2 && test(w))
      .map((w) => {
        const poly = (w.geometry as Pt[]).map(local);
        let nearest = Math.min(...poly.map((p) => pathDist(p, full)));
        for (let i = 1; i < full.length; i++) {
          const steps = Math.max(1, Math.ceil(Math.hypot(full[i][0]-full[i-1][0], full[i][1]-full[i-1][1])/5));
          for (let j = 0; j <= steps; j++) {
            const p: XY = [full[i-1][0] + (full[i][0]-full[i-1][0])*j/steps, full[i-1][1] + (full[i][1]-full[i-1][1])*j/steps];
            nearest = Math.min(nearest, edgeDistance(p,poly));
          }
        }
        return { poly, d: nearest };
      })
      .filter((x) => x.d <= d)
      .sort((a, z) => a.d - z.d)
      .slice(0, max)
      .map((x) => thin(x.poly, pts));
  const tag = (w: Way, k: string, v: string[]) => v.includes(w.tags?.[k] ?? "");
  return {
    path: thin(full, 14),
    green: greenRing ? thin(greenRing.map(local), 14) : null,
    fairways: near((w) => tag(w, "golf", ["fairway"]), 30, 4, 22),
    bunkers: near((w) => tag(w, "golf", ["bunker"]), 60, 10, 12),
    water: near((w) => tag(w, "golf", ["water_hazard", "lateral_water_hazard"]) || tag(w, "natural", ["water"]), 70, 4, 26),
  };
}

/** Courses loaded before holes were drawn: fetch the map again and draw them. Returns true when holes were drawn. */
export async function redrawCourse(courseId: string): Promise<boolean> {
  const c = getState().courses.find((x) => x.id === courseId);
  if (!c || c.lat === null || c.lon === null) return false;
  if(isCapricorn(c))return repairCapricorn(courseId);
  try {
    const pad = 0.015;
    const hit: Hit = { id: "", name: c.name, location: c.location, lat: c.lat, lon: c.lon, south: c.lat - pad, north: c.lat + pad, west: c.lon - pad * 1.3, east: c.lon + pad * 1.3 };
    const found = buildHoles(await mapData(hit));
    const have = getState().holes.filter((h) => h.courseId === courseId);
    const shapes: Record<number, Shape> = {};
    const bears: Record<number, number> = {};
    found.forEach((h) => {
      const mine = have.find((x) => x.number === h.number);
      // Only trust a hole that is the same length as the one saved, so a neighbouring course is never mixed in.
      if (mine && Math.abs(h.lengthM - mine.centerM) / mine.centerM < 0.12) {
        shapes[h.number] = h.shape;
        bears[h.number] = h.bearing;
      }
    });
    if (!Object.keys(shapes).length) return false;
    actions.setShapes(courseId, shapes, bears, Object.fromEntries(found.filter((h) => shapes[h.number]).map((h) => [h.number, { lat: h.teeLat, lon: h.teeLon }])));
    return true;
  } catch {
    return false;
  }
}
