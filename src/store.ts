import { useSyncExternalStore } from "react";
import type { Dir } from "./geo";

// Everything the app knows is kept on the phone, in its own storage. No server.

export type ClubType = "Driver" | "Wood" | "Hybrid" | "Iron" | "Wedge" | "Putter";
export interface Course { id: string; name: string; location: string; holes: number; par: number; lat: number | null; lon: number | null; wxAt: number }
export interface Hole {
  id: string; courseId: string; number: number; par: number; handicap: number;
  centerM: number; frontM: number; backM: number;
  windKmh: number; windDir: Dir; tempC: number; elevationM: number; bearing: number | null;
}
export interface Club { id: string; name: string; type: ClubType; loft: number; carryM: number; totalM: number }
export interface Round { id: string; courseId: string; date: string; status: "In progress" | "Complete" }
export interface HoleScore { id: string; roundId: string; holeNumber: number; strokes: number; putts: number; fairwayHit: boolean }
export interface Shot { id: string; clubId: string | null; clubName: string | null; carryM: number; direction: "Left" | "Straight" | "Right"; lie: string; holeId: string | null; createdAt: string }
export interface Conversion { id: string; title: string; courseId: string | null; holeNumber: number | null; style: string; createdAt: string; photo: string }
export interface Profile { name: string; handicap: number | null; handedness: "Right" | "Left"; typicalMiss: string; notes: string }
export interface State {
  courses: Course[]; holes: Hole[]; clubs: Club[]; rounds: Round[]; scores: HoleScore[]; shots: Shot[]; conversions: Conversion[]; profile: Profile | null;
}

const KEY = "apex.data.v1";
const PKEY = "apex.photos.v1";
const empty: State = { courses: [], holes: [], clubs: [], rounds: [], scores: [], shots: [], conversions: [], profile: null };

function load(): State {
  try {
    const main = JSON.parse(localStorage.getItem(KEY) || "{}");
    const photos = JSON.parse(localStorage.getItem(PKEY) || "[]");
    return { ...empty, ...main, conversions: Array.isArray(photos) ? photos : [] };
  } catch {
    return empty;
  }
}

let state: State = load();
let savedPhotos = state.conversions;
const subs = new Set<() => void>();

function commit(next: State) {
  state = next;
  try {
    const { conversions, ...rest } = next;
    localStorage.setItem(KEY, JSON.stringify(rest));
    if (conversions !== savedPhotos) {
      localStorage.setItem(PKEY, JSON.stringify(conversions));
      savedPhotos = conversions;
    }
  } catch {
    window.dispatchEvent(new Event("apex-storage-full"));
  }
  subs.forEach((f) => f());
}

const update = (fn: (s: State) => State) => commit(fn(state));
export const getState = () => state;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function useData(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => state,
    () => state,
  );
}

export const actions = {
  addCourse(c: Omit<Course, "id" | "wxAt">, holes: Omit<Hole, "id" | "courseId">[]): string {
    const id = uid();
    update((s) => ({
      ...s,
      courses: [{ ...c, id, wxAt: Date.now() }, ...s.courses],
      holes: [...holes.map((h) => ({ ...h, id: uid(), courseId: id })), ...s.holes],
    }));
    return id;
  },
  deleteCourse(id: string) {
    update((s) => {
      const gone = new Set(s.rounds.filter((r) => r.courseId === id).map((r) => r.id));
      return {
        ...s,
        courses: s.courses.filter((c) => c.id !== id),
        holes: s.holes.filter((h) => h.courseId !== id),
        rounds: s.rounds.filter((r) => r.courseId !== id),
        scores: s.scores.filter((x) => !gone.has(x.roundId)),
        conversions: s.conversions.filter((c) => c.courseId !== id),
      };
    });
  },
  setBearings(courseId: string, byNumber: Record<number, number>) {
    update((s) => ({ ...s, holes: s.holes.map((h) => (h.courseId === courseId && byNumber[h.number] !== undefined ? { ...h, bearing: byNumber[h.number] } : h)) }));
  },
  updateHole(id: string, patch: Partial<Hole>) {
    update((s) => ({ ...s, holes: s.holes.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  },
  setWeather(courseId: string, w: { tempC: number; windKmh: number; windDir: Dir }) {
    update((s) => ({
      ...s,
      courses: s.courses.map((c) => (c.id === courseId ? { ...c, wxAt: Date.now() } : c)),
      holes: s.holes.map((h) => (h.courseId === courseId ? { ...h, ...w } : h)),
    }));
  },
  saveClub(c: Omit<Club, "id"> & { id?: string }) {
    update((s) => ({ ...s, clubs: c.id ? s.clubs.map((k) => (k.id === c.id ? ({ ...c, id: c.id } as Club) : k)) : [...s.clubs, { ...c, id: uid() }] }));
  },
  addClubs(list: Omit<Club, "id">[]) {
    update((s) => ({ ...s, clubs: [...s.clubs, ...list.map((c) => ({ ...c, id: uid() }))] }));
  },
  deleteClub(id: string) {
    update((s) => ({ ...s, clubs: s.clubs.filter((c) => c.id !== id) }));
  },
  startRound(courseId: string, date: string): string {
    const open = state.rounds.find((r) => r.status === "In progress");
    if (open) update((s) => ({ ...s, rounds: s.rounds.map((r) => (r.id === open.id ? { ...r, status: "Complete" as const } : r)) }));
    const id = uid();
    update((s) => ({ ...s, rounds: [{ id, courseId, date, status: "In progress" as const }, ...s.rounds] }));
    return id;
  },
  finishRound(id: string) {
    update((s) => ({ ...s, rounds: s.rounds.map((r) => (r.id === id ? { ...r, status: "Complete" as const } : r)) }));
  },
  deleteRound(id: string) {
    update((s) => ({ ...s, rounds: s.rounds.filter((r) => r.id !== id), scores: s.scores.filter((x) => x.roundId !== id) }));
  },
  saveScore(roundId: string, holeNumber: number, v: { strokes: number; putts: number; fairwayHit: boolean }) {
    update((s) => {
      const have = s.scores.find((x) => x.roundId === roundId && x.holeNumber === holeNumber);
      return {
        ...s,
        scores: have ? s.scores.map((x) => (x === have ? { ...x, ...v } : x)) : [...s.scores, { id: uid(), roundId, holeNumber, ...v }],
      };
    });
  },
  addShot(sh: Omit<Shot, "id" | "createdAt">) {
    update((s) => ({ ...s, shots: [{ ...sh, id: uid(), createdAt: new Date().toISOString() }, ...s.shots].slice(0, 400) }));
  },
  deleteShot(id: string) {
    update((s) => ({ ...s, shots: s.shots.filter((x) => x.id !== id) }));
  },
  addConversion(c: Omit<Conversion, "id" | "createdAt">) {
    update((s) => ({ ...s, conversions: [{ ...c, id: uid(), createdAt: new Date().toISOString() }, ...s.conversions].slice(0, 12) }));
  },
  deleteConversion(id: string) {
    update((s) => ({ ...s, conversions: s.conversions.filter((c) => c.id !== id) }));
  },
  saveProfile(p: Profile) {
    update((s) => ({ ...s, profile: p }));
  },
};

export function roundTotals(r: Round, s: State) {
  const mine = s.scores.filter((x) => x.roundId === r.id);
  const holes = s.holes.filter((h) => h.courseId === r.courseId);
  return {
    played: mine.length,
    strokes: mine.reduce((n, x) => n + x.strokes, 0),
    putts: mine.reduce((n, x) => n + x.putts, 0),
    fairways: mine.filter((x) => x.fairwayHit).length,
    par: mine.reduce((n, x) => n + (holes.find((h) => h.number === x.holeNumber)?.par ?? 0), 0),
  };
}

export const STANDARD_BAG: Omit<Club, "id">[] = [
  { name: "Driver", type: "Driver", loft: 10.5, carryM: 220, totalM: 240 },
  { name: "3 Wood", type: "Wood", loft: 15, carryM: 200, totalM: 215 },
  { name: "5 Wood", type: "Wood", loft: 18, carryM: 185, totalM: 197 },
  { name: "4 Hybrid", type: "Hybrid", loft: 21, carryM: 175, totalM: 186 },
  { name: "5 Iron", type: "Iron", loft: 27, carryM: 160, totalM: 170 },
  { name: "6 Iron", type: "Iron", loft: 30, carryM: 150, totalM: 159 },
  { name: "7 Iron", type: "Iron", loft: 34, carryM: 140, totalM: 148 },
  { name: "8 Iron", type: "Iron", loft: 38, carryM: 130, totalM: 137 },
  { name: "9 Iron", type: "Iron", loft: 42, carryM: 118, totalM: 124 },
  { name: "Pitching Wedge", type: "Wedge", loft: 46, carryM: 105, totalM: 110 },
  { name: "Gap Wedge", type: "Wedge", loft: 50, carryM: 90, totalM: 94 },
  { name: "Sand Wedge", type: "Wedge", loft: 56, carryM: 75, totalM: 78 },
  { name: "Lob Wedge", type: "Wedge", loft: 60, carryM: 60, totalM: 62 },
  { name: "Putter", type: "Putter", loft: 3, carryM: 0, totalM: 0 },
];
