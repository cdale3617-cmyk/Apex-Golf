import { advise, carryFor, clubStats, type Advice } from './caddie';
import type { Club, Hole, State, XY } from './store';
import { usableBall, type PlayingState } from './round-state';
import type { Pt } from './geo';

export const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function localPoint(p: Pt, tee: Pt, heading: number): XY {
  const b = heading * Math.PI / 180;
  const x = (p.lon - tee.lon) * Math.cos(tee.lat * Math.PI / 180) * 111320;
  const y = (p.lat - tee.lat) * 110540;
  return [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
}
export function inside(p: XY, polygon: XY[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
export function edgeDistance(p: XY, polygon: XY[]) {
  if (inside(p, polygon)) return 0;
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, distance(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return nearest;
}
export const along = (a: XY, b: XY, m: number): XY => {
  const length = distance(a, b);
  return length ? [a[0] + (b[0] - a[0]) * m / length, a[1] + (b[1] - a[1]) * m / length] : a;
};
export function greenDistances(hole: Hole, ball: XY | null) {
  const path = hole.shape?.path;
  if (!ball || !path?.length) return null;
  const center = path[path.length - 1];
  const ring = hole.shape?.green;
  return { center: distance(ball, center), front: ring?.length ? Math.min(...ring.map(p => distance(ball, p))) : null,
    back: ring?.length ? Math.max(...ring.map(p => distance(ball, p))) : null, point: center };
}
export function mappedLie(hole: Hole, p: XY): string {
  if (hole.shape?.green && inside(p, hole.shape.green)) return 'Green';
  if (hole.shape?.bunkers.some(poly => inside(p, poly))) return distance(p, hole.shape.path[hole.shape.path.length - 1]) < 40 ? 'Greenside bunker' : 'Fairway bunker';
  if (hole.shape?.fairways.some(poly => inside(p, poly))) return 'Fairway';
  return 'Unknown';
}
export interface Hazard { kind: 'Water' | 'Bunker'; nearM: number; farM: number; polygon: XY[] }
/** Scan a buffered shot corridor, including polygon interiors (large crossing hazards too). */
export function hazardsOnLine(hole: Hole, ball: XY, target: XY, buffer = 12): Hazard[] {
  const length = Math.min(2000, distance(ball, target));
  const hazards: Hazard[] = [];
  for (const [kind, polygons] of [['Water', hole.shape?.water ?? []], ['Bunker', hole.shape?.bunkers ?? []]] as const) {
    for (const polygon of polygons) {
      let near = Infinity, far = -Infinity;
      // Two metre intervals; include the target exactly.
      const steps = Math.max(1, Math.ceil(length / 2));
      for (let i = 0; i <= steps; i++) {
        const m = length * i / steps;
        if (edgeDistance(along(ball, target, m), polygon) <= buffer) { near = Math.min(near, m); far = m; }
      }
      if (Number.isFinite(near)) hazards.push({ kind, nearM: near, farM: far, polygon });
    }
  }
  return hazards.sort((a,b) => a.nearM - b.nearM);
}
export interface CaddiePlan {
  advice: Advice | null; warnings: string[]; hazards: Hazard[]; plannedTarget: XY | null;
  distances: ReturnType<typeof greenDistances>; distanceM: number | null; status: string;
}
export function planCaddie(hole: Hole, playing: PlayingState, data: Pick<State, 'clubs' | 'shots' | 'profile'>, unit: 'm' | 'yd', now = Date.now(), target: 'F' | 'C' | 'B' = 'C'): CaddiePlan {
  const ball = usableBall(playing, now);
  const ds = greenDistances(hole, ball);
  const warnings = ['Mapped hazards may be incomplete. Check the hole before playing.'];
  if (playing.lie === 'Unknown') warnings.push('Lie is unconfirmed. Tell the caddie your lie before choosing a shot.');
  if (ball && hole.shape?.water.some(p => inside(ball, p))) warnings.push('Your ball position is inside mapped water. Check the mark and resolve any drop before planning.');
  const fresh = !!hole.weatherAt && now - hole.weatherAt < 45 * 60000;
  if (!fresh) warnings.push('Weather unavailable or old; wind and temperature are excluded.');
  if (!hole.slopeKnown || playing.source !== 'tee') warnings.push('Slope for this shot is unknown; slope is excluded.');
  let destination = playing.target ?? ds?.point ?? null;
  if (!playing.target && ds && hole.shape?.green?.length && target !== 'C') {
    destination = [...hole.shape.green].sort((a,b) => distance(ball!, a) - distance(ball!, b))[target === 'F' ? 0 : hole.shape.green.length - 1];
  }
  const manual = playing.remainingM !== null && Number.isFinite(playing.remainingM) && playing.remainingM > 0;
  const base = manual ? playing.remainingM : ball && destination ? distance(ball, destination) : playing.source === 'tee' ? (target === 'F' ? hole.frontM : target === 'B' ? hole.backM : hole.centerM) : null;
  const status = manual ? 'Manual remaining distance' : playing.source === 'gps' && ball ? `GPS ±${Math.round(playing.accuracyM!)} m` : playing.source === 'map' ? 'Ball set on map' : playing.source === 'tee' ? 'At the mapped tee / card distance' : 'Set your new ball position';
  if (base === null || !Number.isFinite(base)) return { advice: null, warnings, hazards: [], plannedTarget: null, distances: ds, distanceM: null, status };
  if (playing.lie === 'Green') return { advice: null, warnings: [...warnings, 'On the green: read the slope and pace, then use your putter. GPS is not precise enough to read a putt.'], hazards: [], plannedTarget: destination, distances: ds, distanceM: base, status: 'On the green — putter' };
  if (base < 3) return { advice: null, warnings: [...warnings, 'On or beside the target. Read the green and choose your putt or short chip.'], hazards: [], plannedTarget: destination, distances: ds, distanceM: base, status };
  const geo = !!ball && !!destination && !manual;
  if (!geo) warnings.push('Ball geometry is unavailable; hazard clearance and aim cannot be checked.');
  if (!hole.shape?.green?.length) warnings.push('Green edges are unavailable. Front and back card distances are estimates.');
  const heading = geo ? ((hole.mapBearing ?? hole.bearing ?? 0) + Math.atan2(destination![0] - ball![0], destination![1] - ball![1]) * 180 / Math.PI + 360) % 360 : playing.source === 'tee' ? hole.bearing : null;
  const stats = clubStats(data.clubs, data.shots);
  const a = advise({ hole: { ...hole, bearing: heading, windKmh: fresh ? hole.windKmh : 0, tempC: fresh ? hole.tempC : 20, elevationM: hole.slopeKnown && playing.source === 'tee' ? hole.elevationM : 0 },
    target, lie: playing.lie, stance: playing.stance, distanceM: base, unit, clubs: data.clubs, stats, profile: data.profile });
  // A manual distance alone cannot establish the direction from the ball.
  if (!geo) a.lines = a.lines.filter(l => l.label !== 'Aim');
  const hazards = geo ? hazardsOnLine(hole, ball!, destination!, Math.max(12, playing.accuracyM ?? 0)) : [];
  const fmt = (m: number) => Math.round(unit === 'yd' ? m / 0.9144 : m) + ' ' + unit;
  let plannedTarget = geo ? destination : null;
  if (geo && data.clubs.length) {
    const factor = Math.max(0.5, a.needM / base);
    const bag = data.clubs.filter(c => c.type !== 'Putter' && Number.isFinite(c.carryM) && c.carryM > 0);
    const options = bag.map(c => {
      const carry = carryFor(c, stats) / factor;
      const landing = Math.min(carry, base);
      const partial = carry > base * 1.08;
      const low = landing * 0.9;
      const rollout = Math.max(0, c.totalM - c.carryM) / factor;
      const high = landing + rollout + landing * 0.1;
      const landingPoint = along(ball!, destination!, landing);
      const safe = hazards.every(h => {
        // Leave a buffer before a hazard or conservatively carry it; never land/run into it.
        if (high < h.nearM - 8) return true;
        if (low > h.farM + 8 && edgeDistance(landingPoint, h.polygon) > 12) return true;
        return false;
      });
      const fairways = hole.shape!.fairways;
      const inLandingArea = !fairways.length || fairways.some(p => inside(landingPoint, p)) || (!!hole.shape!.green && inside(landingPoint, hole.shape!.green));
      return { c, landing, partial, safe: safe && inLandingArea, carry: carryFor(c, stats) };
    }).filter(o => o.safe).sort((a,b) => Math.abs(base - a.landing) - Math.abs(base - b.landing) || Number(a.partial) - Number(b.partial) || a.carry - b.carry);
    const pick = options[0];
    if (!pick) {
      a.club = null; a.carryM = null; a.reaches = false;
      a.lines = [{ label: 'Plan', text: 'No checked club option on this line. Move the yellow target to a clear landing area or choose a recovery shot.' }];
      plannedTarget = null;
    } else {
      a.club = pick.c.name; a.carryM = pick.carry; a.reaches = pick.landing >= base - 3;
      a.measured = (stats.find(s => s.clubId === pick.c.id)?.n ?? 0) >= 3;
      plannedTarget = along(ball!, destination!, pick.landing);
      a.lines = a.lines.filter(l => !['Club', 'Why', 'Watch out'].includes(l.label));
      a.lines.unshift({ label: 'Plan', text: pick.c.name + (pick.partial ? ', controlled partial shot; judge the swing for ' : ', aim to land about ') + fmt(pick.landing) + (pick.landing < base - 3 ? '. Lay up, then reassess from the ball.' : '.') });
      a.lines.push({ label: 'Why', text: `Your ${pick.c.name} carry is ${fmt(pick.carry)}${a.measured ? ' from logged carries' : ' from your bag'}. The estimate allows 10% carry variation and rollout when checking mapped hazards.` });
    }
  }
  if (hazards.length) a.lines.push({ label: 'Hazards', text: hazards.map(h => `${h.kind}: near ${fmt(h.nearM)}, clear beyond ${fmt(h.farM)}`).join('. ') + '. Includes a lateral margin.' });
  else if (geo) a.lines.push({ label: 'Hazards', text: 'No mapped water or bunker intersects this line. This does not confirm a clear shot.' });
  a.lines.unshift({ label: 'Shot', text: `${playing.shot}${playing.shot === 1 ? ' — tee shot' : ' — ' + playing.lie.toLowerCase()}. ${status}.` });
  return { advice: a, warnings, hazards, plannedTarget, distances: ds, distanceM: base, status };
}
