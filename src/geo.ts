export type Pt = { lat: number; lon: number };
export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Dir = (typeof COMPASS)[number];

const rad = Math.PI / 180;

export const metres = (a: Pt, b: Pt) => {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Compass direction from a to b in degrees (0 = north). */
export const bearing = (a: Pt, b: Pt) => {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return Math.round(((Math.atan2(y, x) / rad + 360) % 360) * 10) / 10;
};

export const dirName = (deg: number): Dir => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
