import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Hole, Shape, XY } from "../store";

type P = [number, number];
const H = 480;
const roll = (seed: number, n: number) => ((Math.abs(seed) * 9301 + n * 49297) % 233280) / 233280;
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pt = (p: P) => p[0].toFixed(1) + "," + p[1].toFixed(1);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const segDist = (p: P, a: P, b: P) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
function inPoly(x: number, y: number, poly: P[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (poly[i][1] > y !== poly[j][1] > y && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside;
  }
  return inside;
}
function nearPoly(x: number, y: number, poly: P[], m: number) {
  if (inPoly(x, y, poly)) return true;
  for (const p of poly) if (Math.hypot(p[0] - x, p[1] - y) < m) return true;
  return false;
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 12): XY[] =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)] as XY);

/** A believable hole for when the map has no outline: it still differs from hole to hole. */
function synthetic(hole: Hole, straight: boolean): Shape {
  const s = hole.number * 7 + Math.round(hole.centerM);
  const L = Math.max(80, hole.centerM);
  const dir = roll(s, 1) > 0.5 ? 1 : -1;
  const amp = straight ? 0 : L * (0.04 + roll(s, 2) * 0.14) * dir;
  const k = 0.6 + roll(s, 5) * 0.8;
  const path: XY[] = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    return [amp * Math.sin(Math.PI * Math.pow(t, k)), L * t] as XY;
  });
  const at = (t: number) => path[Math.round(t * 13)];
  const a = at(0.3), b = at(0.72), e = at(1);
  const side = roll(s, 4) > 0.5 ? 1 : -1;
  return {
    path,
    green: ellipse(e[0], e[1] + 4, 15, 12),
    fairways: [],
    bunkers: straight ? [] : [ellipse(a[0] + side * 24, a[1], 8, 5), ellipse(b[0] - side * 22, b[1], 7, 4.5), ellipse(e[0] - 19, e[1] - 6, 6, 4), ellipse(e[0] + 19, e[1] + 2, 6, 4)],
    water: !straight && roll(s, 3) > 0.55 ? [ellipse(at(0.5)[0] - side * 48, at(0.5)[1], 26, 17)] : [],
  };
}

type Tr = { x: number; y: number; r: number; pine: boolean; tone: number };

function Tree({ t }: { t: Tr }) {
  const { x, y, r } = t;
  if (t.pine) {
    const w = r * 1.5, h = r * 2.4;
    return (
      <g>
        {[0, 1, 2].map((i) => {
          const top = y - h * 0.55 + i * h * 0.24;
          const half = w * (0.3 + i * 0.2);
          return <polygon key={i} points={x + "," + top + " " + (x - half) + "," + (top + h * 0.42) + " " + (x + half) + "," + (top + h * 0.42)} fill="url(#pine)" />;
        })}
      </g>
    );
  }
  const g = t.tone < 0.34 ? "url(#tg0)" : t.tone < 0.67 ? "url(#tg1)" : "url(#tg2)";
  return (
    <g>
      <circle cx={x - r * 0.3} cy={y + r * 0.2} r={r * 0.7} fill="url(#tg1)" />
      <circle cx={x + r * 0.32} cy={y + r * 0.12} r={r * 0.7} fill="url(#tg2)" />
      <circle cx={x} cy={y - r * 0.22} r={r * 0.82} fill={g} />
    </g>
  );
}

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 220, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** The hole, drawn to fill the whole box: striped fairway, shaded bunkers and water, a green with a fringe, and trees all round. */
export function HoleArt({ hole, route, image, label }: { hole: Hole; route: number; image?: string; label: string }) {
  const [ref, box] = useBox();
  const W = clamp((H * box.w) / box.h, 140, 520);
  const hasReal = !image && !!hole.shape && hole.shape.path.length >= 2;
  const shape = useMemo(() => (hasReal ? (hole.shape as Shape) : synthetic(hole, !!image)), [hole.id, hole.shape, hole.centerM, hasReal, image]);

  const g = useMemo(() => {
    const all = [...shape.path, ...(shape.green ?? [])];
    const us = all.map((p) => p[0]);
    const vs = all.map((p) => p[1]);
    const minU = Math.min(...us), maxU = Math.max(...us);
    const minV = Math.min(...vs, 0), maxV = Math.max(...vs, 60);
    const midU = (minU + maxU) / 2;
    const scale = Math.min(4, 360 / (maxV - minV + 10), (W / 2 - 22) / ((maxU - minU) / 2 + 22));
    const X = (p: XY) => W / 2 + (p[0] - midU) * scale;
    const Y = (p: XY) => 440 - (p[1] - minV) * scale;
    const sc = (a: XY[]): P[] => a.map((p) => [X(p), Y(p)] as P);
    const line = sc(shape.path);
    const fair = clamp(34 * scale, 16, 72);
    const rough = clamp(80 * scale, 36, 150);
    const polys = { fairways: shape.fairways.map(sc), bunkers: shape.bunkers.map(sc), water: shape.water.map(sc), green: shape.green ? sc(shape.green) : null };

    // Trees fill everything except the hole itself.
    const seed = hole.number * 7 + Math.round(hole.centerM);
    const r0 = Math.max(9, W * 0.055);
    const step = r0 * 1.5;
    const keep = [...polys.fairways, ...polys.bunkers, ...polys.water, ...(polys.green ? [polys.green] : [])];
    const trees: Tr[] = [];
    let k = 0;
    for (let gy = -6; gy < H + 12; gy += step) {
      for (let gx = -6; gx < W + 12; gx += step) {
        k++;
        if (roll(seed, k + 21000) < 0.1) continue;
        const x = gx + (roll(seed, k) - 0.5) * step * 0.9;
        const y = gy + (roll(seed, k + 5000) - 0.5) * step * 0.9;
        let d = Infinity;
        for (let i = 1; i < line.length; i++) d = Math.min(d, segDist([x, y], line[i - 1], line[i]));
        if (d < fair / 2 + 9) continue;
        if (keep.some((p) => nearPoly(x, y, p, 12))) continue;
        trees.push({ x, y, r: r0 * (0.8 + roll(seed, k + 9000) * 0.5), pine: roll(seed, k + 13000) < 0.28, tone: roll(seed, k + 17000) });
      }
    }
    trees.sort((a, b) => a.y - b.y);
    return { line, fair, rough, polys, trees, scale };
  }, [shape, W, hole.id]);

  // The dotted route follows the hole from the tee to the chosen target.
  const { line } = g;
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  let want = clamp(route, 0.08, 1) * total;
  const run: P[] = [line[0]];
  for (let i = 1; i < line.length && want > 0; i++) {
    const seg = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (seg <= want) {
      run.push(line[i]);
      want -= seg;
    } else {
      run.push(lerp(line[i - 1], line[i], want / seg));
      want = 0;
    }
  }
  const end = run[run.length - 1];
  const tee = line[0];
  const gp = g.polys.green;
  const pin: P = gp ? [gp.reduce((s, p) => s + p[0], 0) / gp.length, gp.reduce((s, p) => s + p[1], 0) / gp.length] : line[line.length - 1];
  const route2 = run.map(pt).join(" ");
  const pts = (a: P[]) => a.map(pt).join(" ");
  const pillW = 96;
  const pillX = end[0] + 16 + pillW < W - 4 ? end[0] + 16 : end[0] - 16 - pillW;
  const pillY = clamp(end[1], 78, H - 30);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <radialGradient id="tg0" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#b6d94a" /><stop offset="0.55" stopColor="#5fa83a" /><stop offset="1" stopColor="#2f6e27" /></radialGradient>
          <radialGradient id="tg1" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#8cc84a" /><stop offset="0.55" stopColor="#4a9a32" /><stop offset="1" stopColor="#245c24" /></radialGradient>
          <radialGradient id="tg2" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#6fba44" /><stop offset="0.55" stopColor="#3a8a30" /><stop offset="1" stopColor="#1d5222" /></radialGradient>
          <linearGradient id="pine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4f9a42" /><stop offset="0.5" stopColor="#2f7430" /><stop offset="1" stopColor="#1a4a24" /></linearGradient>
          <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a9a34" /><stop offset="1" stopColor="#3f7e2a" /></linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5cbcef" /><stop offset="1" stopColor="#2a86c4" /></linearGradient>
          <radialGradient id="sand" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor="#f2e0a6" /><stop offset="1" stopColor="#d2b46a" /></radialGradient>
          <radialGradient id="putt" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor="#b2ea6a" /><stop offset="1" stopColor="#82c94a" /></radialGradient>
          <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stopColor="rgba(0,0,0,0)" /><stop offset="1" stopColor="rgba(8,24,8,0.4)" /></radialGradient>
          <clipPath id="fwclip">{g.polys.fairways.map((f, i) => <polygon key={i} points={pts(f)} />)}</clipPath>
        </defs>

        {image ? (
          <image href={image} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <>
            <rect x="-50" y="-50" width={W + 100} height={H + 100} fill="url(#ground)" />
            <polyline points={line.map(pt).join(" ")} fill="none" stroke="#6bb23c" strokeWidth={g.rough} strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
            {g.polys.fairways.length ? (
              <>
                {g.polys.fairways.map((f, i) => (
                  <polygon key={i} points={pts(f)} fill="#8fd24c" stroke="#8fd24c" strokeWidth="3" strokeLinejoin="round" />
                ))}
                <polyline clipPath="url(#fwclip)" points={line.map(pt).join(" ")} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={g.fair * 3} strokeDasharray="12 12" />
              </>
            ) : (
              <>
                <polyline points={line.map(pt).join(" ")} fill="none" stroke="#8fd24c" strokeWidth={g.fair} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={line.map(pt).join(" ")} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={g.fair} strokeDasharray="11 11" strokeLinejoin="round" />
              </>
            )}
            {g.polys.water.map((w, i) => (
              <g key={"w" + i}>
                <polygon points={pts(w)} fill="url(#water)" stroke="#1f6a9c" strokeWidth="2" strokeLinejoin="round" />
                <polygon points={pts(w)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinejoin="round" transform="translate(-1 -1)" />
              </g>
            ))}
            {g.polys.bunkers.map((b, i) => (
              <g key={"b" + i}>
                <polygon points={pts(b)} fill="rgba(0,0,0,0.25)" transform="translate(1.5 2)" />
                <polygon points={pts(b)} fill="url(#sand)" stroke="#b79a58" strokeWidth="1.5" strokeLinejoin="round" />
              </g>
            ))}
            {gp ? (
              <>
                <polygon points={pts(gp)} fill="#6cb53a" stroke="#6cb53a" strokeWidth="9" strokeLinejoin="round" />
                <polygon points={pts(gp)} fill="url(#putt)" stroke="#5aa02c" strokeWidth="1.5" strokeLinejoin="round" />
              </>
            ) : (
              <circle cx={pin[0]} cy={pin[1]} r="16" fill="url(#putt)" stroke="#5aa02c" strokeWidth="3" />
            )}
            {g.trees.map((t, i) => (
              <ellipse key={"s" + i} cx={t.x + t.r * 0.55} cy={t.y + t.r * 0.62} rx={t.r * 1.0} ry={t.r * 0.5} fill="rgba(6,30,8,0.38)" />
            ))}
            {g.trees.map((t, i) => (
              <Tree key={"t" + i} t={t} />
            ))}
            <rect x="0" y="0" width={W} height={H} fill="url(#vig)" />
          </>
        )}

        <polyline points={route2} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={route2} fill="none" stroke="#f7d21e" strokeWidth="7" strokeDasharray="10 1.6" strokeLinejoin="round" />
        <circle cx={pin[0]} cy={pin[1]} r="11" fill="#2fc94a" stroke="#f4f2e8" strokeWidth="3" />
        <circle cx={end[0]} cy={end[1]} r="10" fill="#f7d21e" stroke="#f4f2e8" strokeWidth="3" />
        <circle cx={tee[0]} cy={tee[1]} r="11" fill="#e23a3a" stroke="#f4f2e8" strokeWidth="3" />
        <rect x={pillX} y={pillY - 16} width={pillW} height="32" rx="16" fill="#12161d" stroke="#e0b040" strokeWidth="2.5" />
        <text x={pillX + pillW / 2} y={pillY + 6} textAnchor="middle" fontSize="17" fill="#f4f2e8" fontWeight="700">
          {label}
        </text>
      </svg>
    </div>
  );
}
