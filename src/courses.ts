import { actions, getState, type Hole } from "./store";
import { COMPASS, bearing, metres, type Dir, type Pt } from "./geo";

// Courses come from OpenStreetMap (search and hole maps) and Open-Meteo (weather and height).
// These services are asked straight from the phone. Nothing goes through a server of ours.

export type Hit = { id: string; name: string; location: string; lat: number; lon: number; south: number; west: number; north: number; east: number };
type Way = { tags?: Record<string, string>; geometry?: Pt[] };
type Box = { south: number; north: number; west: number; east: number };
type Nom = { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string; category?: string; type?: string; boundingbox: string[] };
type HoleIn = { number: number; par: number | null; handicap: number | null; lengthM: number; frontM: number; backM: number; teeLat: number; teeLon: number; greenLat: number; greenLon: number; bearing: number };

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
  const query = '[out:json][timeout:25];(way["golf"="hole"](' + box + ');way["golf"="green"](' + box + "););out geom tags;";
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

function buildHoles(elements: Way[]): HoleIn[] {
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
    greens.forEach((gr) => {
      const ring = gr.geometry as Pt[];
      const centre = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
      const d = metres(end, centre);
      if (d < best) {
        best = d;
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
      lengthM: length, frontM: Math.max(1, front), backM: back,
      teeLat: tee.lat, teeLon: tee.lon, greenLat: end.lat, greenLon: end.lon, bearing: bearing(tee, end),
    };
    const have = byNumber.get(number);
    if (!have || have.lengthM < next.lengthM) byNumber.set(number, next);
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
  if (!force && Date.now() - c.wxAt < 45 * 60 * 1000) return false;
  const w = await fetchWeather(c.lat, c.lon);
  if (!w) return false;
  actions.setWeather(courseId, w);
  return true;
}

const guessPar = (m: number) => (m <= 230 ? 3 : m <= 430 ? 4 : 5);

export async function importCourse(hit: Hit, progress: (m: string) => void): Promise<string> {
  progress("Reading " + hit.name + " hole by hole…");
  const holes = buildHoles(await mapData(hit));
  if (!holes.length) throw new Error("This course has no mapped holes yet, so there are no distances to load. Type it in by hand instead.");
  const existing = getState().courses.find((c) => c.name.toLowerCase() === hit.name.toLowerCase());
  if (existing) {
    const map: Record<number, number> = {};
    holes.forEach((h) => { map[h.number] = h.bearing; });
    actions.setBearings(existing.id, map);
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
      number: h.number,
      par: h.par && h.par >= 3 && h.par <= 6 ? h.par : guessPar(h.lengthM),
      handicap: h.handicap ?? 0,
      centerM: Math.round(h.lengthM), frontM: Math.round(h.frontM), backM: Math.round(h.backM),
      windKmh: w?.windKmh ?? 0, windDir: w?.windDir ?? "N", tempC: w?.tempC ?? 20, elevationM: rise, bearing: h.bearing,
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
      number: h.number, par: h.par, handicap: 0,
      centerM: Math.round(h.lengthM), frontM: Math.round(h.lengthM - 10), backM: Math.round(h.lengthM + 10),
      windKmh: w?.windKmh ?? 0, windDir: w?.windDir ?? "N", tempC: w?.tempC ?? 20, elevationM: 0, bearing: null,
    }));
  return actions.addCourse({ name: n, location: location.trim(), holes: rows.length, par: rows.reduce((s, h) => s + h.par, 0), lat, lon }, rows);
}
