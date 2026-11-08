import type { Hole, XY } from './store';

export interface PlayingState {
  holeId: string;
  roundId: string | null;
  shot: number;
  lie: string;
  stance: string;
  ball: XY | null;
  source: 'tee' | 'map' | 'gps' | 'manual' | 'unknown';
  accuracyM: number | null;
  locatedAt: number;
  remainingM: number | null;
  target: XY | null;
}
export const playingKey = (holeId: string, roundId: string | null) => `${roundId ?? 'practice'}:${holeId}`;
export function startHole(hole: Hole, roundId: string | null): PlayingState {
  return { holeId: hole.id, roundId, shot: 1, lie: 'Tee', stance: 'Flat', ball: hole.teeMarker ?? hole.shape?.path[0] ?? null,
    source: 'tee', accuracyM: null, locatedAt: Date.now(), remainingM: null, target: null };
}
export function nextShot(s: PlayingState): PlayingState {
  return { ...s, shot: s.shot + 1, lie: 'Unknown', stance: 'Flat', ball: null, source: 'unknown', remainingM: null, accuracyM: null, locatedAt: 0 };
}
export const usableBall = (s: PlayingState, now = Date.now()) =>
  s.ball && (s.source !== 'gps' || (now - s.locatedAt < 120000 && s.accuracyM !== null && s.accuracyM <= 25)) ? s.ball : null;
