import React from "react";
import type { Hole, XY } from "../store";

type P = [number, number];
const roll = (seed: number, n: number) => ((seed * 9301 + n * 49297) % 233280) / 233280;
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pt = (p: P) => p[0].toFixed(1) + "," + p[1].toFixed(1);
function bez(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}
function firstPart(p0: P, p1: P, p2: P, p3: P, t: number): [P, P, P, P] {
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
  const d = lerp(a, b, t), e = lerp(b, c, t);
  return [p0, a, d, lerp(d, e, t)];
}

function Pin({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} r="4" fill="#d8d6cc" />
      <line x1={x} y1={y} x2={x} y2={y - 11} stroke="#d8d6cc" strokeWidth="1.5" />
      <path d={"M" + x + " " + (y - 11) + " l9 3 l-9 3 z"} fill="#d24c4c" />
    </>
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  const lx = Math.min(266, Math.max(34, x));
  const ly = Math.max(72, y - 26);
  return (
    <>
      <circle cx={x} cy={y} r="5" fill="#dcb23c" />
      <rect x={lx - 34} y={ly - 9} width="68" height="18" rx="9" fill="#0b1426" stroke="#dcb23c" />
      <text x={lx} y={ly + 4} textAnchor="middle" fontSize="11" fill="#dcb23c" fontWeight="600">
        {text}
      </text>
    </>
  );
}

/** The real hole, from the map: the line from tee to green, fairway, bunkers, water and green. */
function Real({ hole, route, label }: { hole: Hole; route: number; label: string }) {
  const shape = hole.shape!;
  const all = [...shape.path, ...(shape.green ?? [])];
  const us = all.map((p) => p[0]);
  const vs = all.map((p) => p[1]);
  const minU = Math.min(...us), maxU = Math.max(...us);
  const minV = Math.min(...vs, 0), maxV = Math.max(...vs, 60);
  const midU = (minU + maxU) / 2;
  const scale = Math.min(400 / (maxV - minV + 30), 135 / ((maxU - minU) / 2 + 30));
  const X = (p: XY) => Math.round((150 + (p[0] - midU) * scale) * 10) / 10;
  const Y = (p: XY) => Math.round((452 - (p[1] - minV) * scale) * 10) / 10;
  const pts = (a: XY[]) => a.map((p) => X(p) + "," + Y(p)).join(" ");
  const line = shape.path.map((p): P => [X(p), Y(p)]);

  // The dotted route follows the hole from the tee to the chosen target.
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  let want = Math.min(1, Math.max(0.08, route)) * total;
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
  const pin = line[line.length - 1];
  const gc: P = shape.green ? [shape.green.reduce((s, p) => s + X(p), 0) / shape.green.length, shape.green.reduce((s, p) => s + Y(p), 0) / shape.green.length] : pin;
  const rough = Math.max(26, Math.min(120, 64 * scale));
  const fair = Math.max(14, Math.min(80, 34 * scale));

  return (
    <svg viewBox="0 0 300 480" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="-600" y="-600" width="1500" height="1700" fill="#17423a" />
      <polyline points={line.map(pt).join(" ")} fill="none" stroke="#24654a" strokeWidth={rough} strokeLinecap="round" strokeLinejoin="round" />
      {shape.fairways.map((f, i) => (
        <polygon key={"f" + i} points={pts(f)} fill="#3f9a5c" stroke="#3f9a5c" strokeWidth="2" strokeLinejoin="round" />
      ))}
      {shape.fairways.length === 0 ? <polyline points={line.map(pt).join(" ")} fill="none" stroke="#2f7d4a" strokeWidth={fair} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {shape.water.map((w, i) => (
        <polygon key={"w" + i} points={pts(w)} fill="#2a7fb8" stroke="#1f6a9c" strokeWidth="1.5" strokeLinejoin="round" />
      ))}
      {shape.bunkers.map((b, i) => (
        <polygon key={"b" + i} points={pts(b)} fill="#d3c48f" stroke="#b9aa75" strokeWidth="1" strokeLinejoin="round" />
      ))}
      {shape.green ? (
        <polygon points={pts(shape.green)} fill="#5aa874" stroke="#1d6b3c" strokeWidth="2" strokeLinejoin="round" />
      ) : (
        <circle cx={pin[0]} cy={pin[1]} r="14" fill="#5aa874" stroke="#1d6b3c" strokeWidth="2" />
      )}
      <Pin x={Math.round(gc[0])} y={Math.round(gc[1])} />
      <polyline points={run.map(pt).join(" ")} fill="none" stroke="#dcb23c" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={tee[0]} cy={tee[1]} r="7" fill="#d24c4c" stroke="#d8d6cc" strokeWidth="2" />
      <Label x={end[0]} y={end[1]} text={label} />
    </svg>
  );
}

/** When the map has no outline for a hole: a drawn hole that still differs from hole to hole. */
function Generic({ hole, route, image, label }: { hole: Hole; route: number; image?: string; label: string }) {
  const s = hole.number;
  const bend = (roll(s, 1) - 0.5) * 120;
  const gx = 150 + (roll(s, 2) - 0.5) * 100;
  const p0: P = [150, 462], p1: P = [150 + bend, 320], p2: P = [gx - bend * 0.8, 170], p3: P = [gx, 40];
  const curve = "M" + pt(p0) + " C" + pt(p1) + " " + pt(p2) + " " + pt(p3);
  const t = Math.min(1, Math.max(0.12, route));
  const part = firstPart(p0, p1, p2, p3, t);
  const run = "M" + pt(part[0]) + " C" + pt(part[1]) + " " + pt(part[2]) + " " + pt(part[3]);
  const e = part[3];
  const side = roll(s, 4) > 0.5 ? 1 : -1;
  const b1 = bez(p0, p1, p2, p3, 0.35), b2 = bez(p0, p1, p2, p3, 0.7), wp = bez(p0, p1, p2, p3, 0.5);
  const trees = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: i % 2 ? 15 + roll(s, i + 10) * 60 : 225 + roll(s, i + 10) * 60, y: 20 + roll(s, i + 20) * 420, round: i % 3 !== 0 }));
  return (
    <svg viewBox="0 0 300 480" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {image ? (
        <image href={image} x="0" y="0" width="300" height="480" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <rect width="300" height="480" fill="#17423a" />
          <path d={curve} stroke="#3f9a5c" strokeWidth="74" fill="none" strokeLinecap="round" />
          <path d={curve} stroke="#2f7d4a" strokeWidth="58" fill="none" strokeLinecap="round" />
          {roll(s, 3) > 0.5 ? <ellipse cx={wp[0] - side * 78} cy={wp[1]} rx="30" ry="22" fill="#2a7fb8" /> : null}
          <ellipse cx={b1[0] + side * 44} cy={b1[1]} rx="18" ry="11" fill="#d3c48f" />
          <ellipse cx={b2[0] - side * 40} cy={b2[1]} rx="16" ry="10" fill="#d3c48f" />
          {trees.map((t2, i) => (
            <g key={i}>
              <ellipse cx={t2.x + 3} cy={t2.y + 10} rx="10" ry="4" fill="rgba(0,0,0,0.35)" />
              {t2.round ? <circle cx={t2.x} cy={t2.y} r="12" fill="#1c5132" /> : <polygon points={t2.x + "," + (t2.y - 16) + " " + (t2.x - 11) + "," + (t2.y + 8) + " " + (t2.x + 11) + "," + (t2.y + 8)} fill="#163f28" />}
            </g>
          ))}
        </>
      )}
      <circle cx={gx} cy="40" r="22" fill="#5aa874" stroke="#1d6b3c" strokeWidth="3" />
      <Pin x={Math.round(gx)} y={40} />
      <path d={run} stroke="#dcb23c" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <circle cx="150" cy="462" r="7" fill="#d24c4c" stroke="#d8d6cc" strokeWidth="2" />
      <Label x={e[0]} y={e[1]} text={label} />
    </svg>
  );
}

export function HoleArt({ hole, route, image, label }: { hole: Hole; route: number; image?: string; label: string }) {
  if (!image && hole.shape && hole.shape.path.length >= 2) return <Real hole={hole} route={route} label={label} />;
  return <Generic hole={hole} route={route} image={image} label={label} />;
}
