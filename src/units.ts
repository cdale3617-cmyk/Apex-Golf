import { useSyncExternalStore } from "react";

// Distances are stored in metres. The golfer chooses whether to see and type metres or yards.
export type Unit = "m" | "yd";

const KEY = "apex_units";
const YARDS_PER_METRE = 1.0936133;
const listeners = new Set<() => void>();

export function getUnit(): Unit {
  try {
    return localStorage.getItem(KEY) === "yd" ? "yd" : "m";
  } catch {
    return "m";
  }
}

export function setUnit(next: Unit) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // The choice just lasts until the app closes.
  }
  listeners.forEach((l) => l());
}

export const toYards = (metres: number) => metres * YARDS_PER_METRE;
export const toMetres = (value: number, unit: Unit) => (unit === "yd" ? value / YARDS_PER_METRE : value);

export function useUnits() {
  const unit = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getUnit,
    () => "m" as Unit,
  );
  const other: Unit = unit === "m" ? "yd" : "m";
  /** A distance given in metres, as a whole number in the chosen unit. */
  const d = (metres: number) => Math.round(unit === "yd" ? toYards(metres) : metres);
  /** The same distance in the other unit, as text such as "431 yd". */
  const alt = (metres: number) => Math.round(other === "yd" ? toYards(metres) : metres) + " " + other;
  /** Text typed by the golfer in the chosen unit, back to metres. */
  const fromInput = (text: string) => Math.round(toMetres(Number(text) || 0, unit));
  return { unit, other, setUnit, d, alt, fromInput };
}
