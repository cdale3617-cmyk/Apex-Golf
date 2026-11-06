import React from "react";
import type { Hole } from "../store";

/** A drawn hole: fairway, hazards, green, and a dotted route to the pin. A converted photo replaces the drawing. */
export function HoleArt({ hole, route, image, label }: { hole: Hole; route: number; image?: string; label: string }) {
  const roll = (n: number) => ((hole.number * 9301 + n * 49297) % 233280) / 233280;
  const trees = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 8 + roll(i) * 84, y: 12 + roll(i + 10) * 70, round: i % 2 === 0 }));
  return (
    <svg viewBox="0 0 300 480" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7d4a" />
          <stop offset="1" stopColor="#1f5f36" />
        </linearGradient>
        <pattern id="stripes" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="20" height="40" fill="rgba(255,255,255,0.05)" />
        </pattern>
      </defs>
      {image ? (
        <image href={image} x="0" y="0" width="300" height="480" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <rect width="300" height="480" fill="#17423a" />
          <path d="M0 0 H300 V480 H0 Z" fill="url(#stripes)" />
          <path d="M150 470 C 110 360, 200 260, 150 140 C 120 60, 170 30, 150 10" stroke="#3f9a5c" strokeWidth="70" fill="none" strokeLinecap="round" />
          <path d="M150 470 C 110 360, 200 260, 150 140 C 120 60, 170 30, 150 10" stroke="url(#fw)" strokeWidth="58" fill="none" strokeLinecap="round" />
          <ellipse cx="220" cy="320" rx="22" ry="14" fill="#d3c48f" />
          <ellipse cx="80" cy="200" rx="18" ry="11" fill="#d3c48f" />
          <path d="M30 380 Q60 350 90 380 T150 400 Q120 430 70 420 Z" fill="#2a7fb8" />
          {trees.map((t, i) => (
            <g key={i}>
              <ellipse cx={t.x + 3} cy={t.y + 10} rx="10" ry="4" fill="rgba(0,0,0,0.35)" />
              {t.round ? <circle cx={t.x} cy={t.y} r="12" fill="#1c5132" /> : <polygon points={t.x + "," + (t.y - 16) + " " + (t.x - 11) + "," + (t.y + 8) + " " + (t.x + 11) + "," + (t.y + 8)} fill="#163f28" />}
            </g>
          ))}
        </>
      )}
      <circle cx="150" cy="40" r="22" fill="#5aa874" stroke="#1d6b3c" strokeWidth="3" />
      <circle cx="150" cy="40" r="5" fill="#d8d6cc" />
      <line x1="150" y1="40" x2="150" y2="30" stroke="#d8d6cc" strokeWidth="1.5" />
      <path d={"M150 462 C 120 360, 190 260, 150 " + (40 + (1 - route) * 60)} stroke="#dcb23c" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <circle cx="150" cy="260" r="5" fill="#dcb23c" />
      <rect x="120" y="222" width="68" height="18" rx="9" fill="#0b1426" stroke="#dcb23c" />
      <text x="154" y="235" textAnchor="middle" fontSize="11" fill="#dcb23c" fontWeight="600">
        {label}
      </text>
      <circle cx="150" cy="462" r="7" fill="#d24c4c" stroke="#d8d6cc" strokeWidth="2" />
    </svg>
  );
}
