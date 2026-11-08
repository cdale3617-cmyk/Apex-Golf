import { COMPASS, type Dir } from "./geo";
import type { Club, Hole, Profile, Shot } from "./store";
import type { Unit } from "./units";

// The caddie runs on the phone. It works from the same facts a person would: distance, wind
// relative to the hole, slope, heat, lie and your own bag, and it prefers distances you have measured.

/** Shots needed before a measured distance replaces the number typed into the bag. */
export const MIN_SHOTS = 3;

export type ClubStat = { clubId: string; name: string; statedCarryM: number; n: number; avgCarryM: number; minM: number; maxM: number; left: number; straight: number; right: number };

export function clubStats(clubs: Club[], shots: Shot[]): ClubStat[] {
  return clubs
    .map((c) => {
      const mine = shots
        .filter((s) => s.clubId === c.id && s.measurement !== "total" && Number.isFinite(s.carryM) && s.carryM > 0 && s.carryM <= 400)
        .sort((a, z) => (a.createdAt < z.createdAt ? 1 : -1))
        .slice(0, 20);
      const n = mine.length;
      const carries = mine.map((s) => s.carryM);
      return {
        clubId: c.id,
        name: c.name,
        statedCarryM: c.carryM,
        n,
        avgCarryM: n ? Math.round(carries.reduce((a, b) => a + b, 0) / n) : 0,
        minM: n ? Math.round(Math.min(...carries)) : 0,
        maxM: n ? Math.round(Math.max(...carries)) : 0,
        left: mine.filter((s) => s.direction === "Left").length,
        straight: mine.filter((s) => s.direction === "Straight").length,
        right: mine.filter((s) => s.direction === "Right").length,
      };
    })
    .sort((a, z) => z.statedCarryM - a.statedCarryM);
}

export function carryFor(club: { id: string; carryM: number }, stats: ClubStat[]): number {
  const s = stats.find((x) => x.clubId === club.id);
  return s && s.n >= MIN_SHOTS ? s.avgCarryM : club.carryM;
}

export function tendency(s: ClubStat): string {
  if (s.n < 5) return "needs 5 shots";
  const top = Math.max(s.left, s.straight, s.right);
  if (top / s.n < 0.5) return "mixed";
  if (s.straight === top) return "mostly straight";
  return "mostly " + (s.left === top ? "left" : "right") + " (" + Math.round((top / s.n) * 100) + "%)";
}

/** Pulls a distance, lie or stance out of something typed or said: "150 yards, in the rough, ball above my feet". */
export function parseNote(note: string, unit: Unit): { distanceM?: number; lie?: string; stance?: string } {
  const out: { distanceM?: number; lie?: string; stance?: string } = {};
  const said = note.match(/\b(\d{1,3})\s*(yards?|yds?|metres?|meters?|m)\b(?!\s*\/)/i) ?? note.match(/\b(\d{1,3})\s*(?:out|to (?:the )?(?:pin|green)|remaining)\b/i);
  if (said) {
    const n = Number(said[1]);
    const u = (said[2] ?? "").toLowerCase();
    const yards = u ? u.startsWith("y") : unit === "yd";
    const m = yards ? Math.round(n * 0.9144) : n;
    if (m >= 3 && m <= 700) out.distanceM = m;
  }
  const t = note.toLowerCase();
  if (/green ?side bunker/.test(t)) out.lie = "Greenside bunker";
  else if (/bunker|sand/.test(t)) out.lie = "Fairway bunker";
  else if (/heavy rough|thick rough|deep rough/.test(t)) out.lie = "Heavy rough";
  else if (/rough/.test(t)) out.lie = "Light rough";
  else if (/hardpan|bare lie/.test(t)) out.lie = "Bare lie / hardpan";
  else if (/\bon (?:the )?green\b/.test(t)) out.lie = "Green";
  else if (/\bfairway\b/.test(t)) out.lie = "Fairway";
  else if (/\btee\b/.test(t)) out.lie = "Tee";
  if (/above (my )?feet/.test(t)) out.stance = "Ball above feet";
  else if (/below (my )?feet/.test(t)) out.stance = "Ball below feet";
  else if (/uphill/.test(t)) out.stance = "Uphill lie";
  else if (/downhill/.test(t)) out.stance = "Downhill lie";
  return out;
}

const LIE: Record<string, number> = { Tee: 1, Fairway: 1, "Light rough": 0.93, "Heavy rough": 0.85, "Fairway bunker": 0.88, "Greenside bunker": 0.7, "Bare lie / hardpan": 0.97 };
const STANCE: Record<string, number> = { Flat: 1, "Ball above feet": 0.98, "Ball below feet": 0.98, "Uphill lie": 0.95, "Downhill lie": 1.03 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type Ask = {
  hole: Hole; target: "F" | "C" | "B"; lie: string; stance: string; distanceM: number | null;
  unit: Unit; clubs: Club[]; stats: ClubStat[]; profile: Profile | null;
};

export type Advice = {
  lines: { label: string; text: string }[];
  playsLikeM: number; baseM: number; needM: number;
  headwind: number | null; crosswind: number | null; slopeM: number; tempC: number;
  club: string | null; carryM: number | null; measured: boolean; reaches: boolean;
};

export function advise(a: Ask): Advice {
  const { hole } = a;
  const u = a.unit;
  const conv = (m: number) => Math.round(u === "yd" ? m * 1.0936133 : m);
  const base = a.distanceM && a.distanceM > 0 ? a.distanceM : a.target === "F" ? hole.frontM : a.target === "B" ? hole.backM : hole.centerM;

  // Wind along and across the hole, from where the wind comes and which way the hole points.
  const from = COMPASS.indexOf(hole.windDir as Dir);
  let head: number | null = null;
  let cross: number | null = null; // positive = from the golfer's right
  if (from >= 0 && hole.bearing !== null && hole.bearing !== undefined) {
    const rel = ((from * 45 - hole.bearing) * Math.PI) / 180;
    head = Math.round(hole.windKmh * Math.cos(rel));
    cross = Math.round(hole.windKmh * Math.sin(rel));
  }
  const windPct = head === null ? 0 : head >= 0 ? head * 0.0062 : head * 0.0031;
  const tempPct = (20 - hole.tempC) * 0.003;
  const slope = hole.elevationM;
  const playsLike = Math.round(base * (1 + clamp(windPct + tempPct, -0.25, 0.25)) + slope);
  const lieF = LIE[a.lie] ?? 1;
  const stanceF = STANCE[a.stance] ?? 1;
  const need = Math.round(playsLike / (lieF * stanceF));

  let bag = a.clubs
    .filter((c) => c.type !== "Putter")
    .map((c) => {
      const s = a.stats.find((x) => x.clubId === c.id);
      const measured = !!s && s.n >= MIN_SHOTS;
      return { c, s, carry: measured && s ? s.avgCarryM : c.carryM, measured };
    })
    .sort((x, y) => x.carry - y.carry);
  if (a.lie === "Greenside bunker") {
    const wedges = bag.filter((b) => b.c.type === "Wedge");
    if (wedges.length) bag = wedges.sort((x, y) => y.c.loft - x.c.loft).slice(0, 1);
  }
  const reach = bag.findIndex((b) => b.carry >= need);
  const pick = reach >= 0 ? bag[reach] : bag[bag.length - 1];
  const reaches = reach >= 0;

  // Club and swing.
  let clubLine: string;
  if (!pick) {
    clubLine = "Add your clubs to your bag for a specific call. You need to cover " + conv(need) + " " + u + ".";
  } else if (!reaches) {
    clubLine = pick.c.name + ", full swing. It is short of the " + conv(need) + " " + u + " you need, so play for the best spot to hit from next.";
  } else {
    const pct = (pick.carry - need) / need;
    const swing = pct >= 0.08 ? "three-quarter swing, smooth tempo" : pct >= 0.03 ? "smooth full swing" : "full swing";
    clubLine = pick.c.name + ", " + swing + ".";
  }

  // Aim.
  const target = a.target === "F" ? "front of the green" : a.target === "B" ? "back of the green" : "middle of the green";
  const aim: string[] = [];
  if (cross !== null && Math.abs(cross) >= 5) {
    const side = cross > 0 ? "right" : "left";
    aim.push("The " + Math.abs(cross) + " km/h wind comes from your " + side + ", so aim a little " + side + " and let it bring the ball back.");
  }
  const bagMiss = pick?.s && pick.s.n >= 5 ? tendency(pick.s) : "";
  const profMiss = a.profile?.typicalMiss ?? "";
  const missSide = /left/i.test(bagMiss) ? "left" : /right/i.test(bagMiss) ? "right" : /left/i.test(profMiss) ? "left" : /right/i.test(profMiss) ? "right" : "";
  if (missSide) {
    const safe = missSide === "left" ? "right" : "left";
    aim.push("You tend to miss " + missSide + ", so take your line a touch to the " + safe + ".");
  }
  aim.push(aim.length ? "Target is the " + target + "." : "Aim at the " + target + ".");

  // Plays like.
  const bits: string[] = [];
  if (head !== null && Math.abs(head) >= 3) bits.push("a " + Math.abs(head) + " km/h " + (head > 0 ? "headwind" : "tailwind"));
  if (Math.abs(slope) >= 2) bits.push(conv(Math.abs(slope)) + " " + u + (slope > 0 ? " uphill" : " downhill"));
  if (hole.tempC <= 12) bits.push("cold air (" + hole.tempC + "°C)");
  else if (hole.tempC >= 28) bits.push("hot air (" + hole.tempC + "°C)");
  let plays = conv(playsLike) + " " + u + " (from " + conv(base) + ")";
  plays += bits.length ? " because of " + bits.join(", ") + "." : ", with no real adjustment.";
  if (need !== playsLike) plays += " From " + a.lie.toLowerCase() + (a.stance !== "Flat" ? ", " + a.stance.toLowerCase() : "") + " it plays like " + conv(need) + " " + u + ".";
  if (head === null) plays += " This hole's direction is not known, so the wind is not counted.";

  // Why.
  let why = "No clubs in the bag yet.";
  if (pick) {
    why = pick.c.name + " carries " + conv(pick.carry) + " " + u + (pick.measured && pick.s ? " (from " + pick.s.n + " of your own shots)" : " (the number in your bag)") + " against the " + conv(need) + " you need.";
    if (pick.s && pick.s.n >= 5) why += " With it you miss " + tendency(pick.s) + ".";
  }

  // Watch out.
  let watch = "Pick a small target, commit to it and keep the tempo smooth.";
  if (a.lie === "Greenside bunker") watch = "Accelerate through the sand and finish the swing.";
  else if (pick && !reaches) watch = "Do not force extra distance. Take the club and aim for the safest side.";
  else if (head !== null && head >= 20) watch = "Strong wind in your face. Keep it low, because a high ball will balloon.";
  else if (head !== null && head <= -20) watch = "Wind behind you will carry it, so it may run on. Think about where it lands.";
  else if (a.lie.indexOf("rough") >= 0) watch = "Out of the rough the ball can come out fast with no spin, so expect it to run.";

  return {
    lines: [
      { label: "Club", text: clubLine },
      { label: "Aim", text: aim.join(" ") },
      { label: "Plays like", text: plays },
      { label: "Why", text: why },
      { label: "Watch out", text: watch },
    ],
    playsLikeM: playsLike, baseM: Math.round(base), needM: need,
    headwind: head, crosswind: cross, slopeM: slope, tempC: hole.tempC,
    club: pick?.c.name ?? null, carryM: pick ? pick.carry : null, measured: pick?.measured ?? false, reaches,
  };
}
