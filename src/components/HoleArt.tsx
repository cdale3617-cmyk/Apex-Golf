import React, { useRef } from 'react';
import type { Hole, XY } from '../store';
import type { PlayingState } from '../round-state';
import { usableBall } from '../round-state';
import { greenCentre } from '../strategy';

export type MapMode = 'target' | 'ball' | 'water' | 'bunker' | 'remove';
export function HoleArt({ hole, playing, plannedTarget, mode, onPoint }: {
  hole: Hole; playing: PlayingState; plannedTarget: XY | null; mode: MapMode; onPoint: (p: XY) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const shape = hole.shape;
  if (!shape || shape.path.length < 2) return <div className="empty"><h2>Hole map unavailable</h2><p>Use the card distance or enter your remaining distance. No hazards have been invented.</p></div>;
  const ball = usableBall(playing);
  const tee = shape.path[0], green = greenCentre(hole)!;
  const target = playing.target ?? green;
  const all = [...shape.path, ...(shape.green ?? []), ...shape.fairways.flat(), ...shape.water.flat(), ...shape.bunkers.flat()];
  const minX = Math.min(...all.map(p => p[0])) - 25, maxX = Math.max(...all.map(p => p[0])) + 25;
  const minY = Math.min(...all.map(p => p[1])) - 25, maxY = Math.max(...all.map(p => p[1])) + 25;
  const scale = Math.min(270 / (maxX - minX), 470 / (maxY - minY));
  const x = (p: XY) => 160 + (p[0] - (minX + maxX) / 2) * scale;
  const y = (p: XY) => 270 - (p[1] - (minY + maxY) / 2) * scale;
  const pts = (p: XY[]) => p.map(p => `${x(p)},${y(p)}`).join(' ');
  const point = (e: React.PointerEvent<SVGSVGElement>): XY | null => {
    const matrix = ref.current?.getScreenCTM();
    if (!matrix) return null;
    const pos = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const p: XY = [(pos.x - 160) / scale + (minX + maxX) / 2, (270 - pos.y) / scale + (minY + maxY) / 2];
    // Keep dragging inside the displayed hole frame to prevent runaway coordinates.
    return [Math.max(minX, Math.min(maxX, p[0])), Math.max(minY, Math.min(maxY, p[1]))];
  };
  const marker = (p: XY, fill: string, label: string) => <g><circle cx={x(p)} cy={y(p)} r="5" fill={fill} stroke="#fff" strokeWidth="1.5"/><title>{label}</title></g>;
  return <svg ref={ref} viewBox="0 0 320 540" role="img" aria-label={`Hole ${hole.number}. Tee at bottom. Tap or drag to set ${mode}.`}
    style={{ touchAction: 'none' }}
    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const p = point(e); if (p) onPoint(p); }}
    onPointerMove={e => { if (e.buttons && ['ball','target'].includes(mode)) { const p = point(e); if (p) onPoint(p); } }}>
    <rect width="320" height="540" fill="#17391d"/>
    {shape.fairways.map((p,i) => <polygon key={'f'+i} points={pts(p)} fill="#62b83b"/>)}
    {!shape.fairways.length && <polyline points={pts(shape.path)} fill="none" stroke="#658568" strokeDasharray="3 6" strokeWidth="2"/>}
    {shape.water.map((p,i) => <polygon key={'w'+i} points={pts(p)} fill="#168ade" stroke="#80d5ff"/>)}
    {shape.bunkers.map((p,i) => <polygon key={'b'+i} points={pts(p)} fill="#e6ca88" stroke="#fff0b9"/>)}
    {shape.green && <polygon points={pts(shape.green)} fill="#9fe44d" stroke="#d9ff86"/>}
    {ball && <polyline points={pts([ball, target])} fill="none" stroke="#ffdf00" strokeWidth="2" strokeDasharray="6 4"/>}
    {plannedTarget && marker(plannedTarget, '#ffdf00', 'Recommended landing')}
    <circle cx={x(tee)} cy={y(tee)} r="8" fill="#f23937"><title>Mapped tee</title></circle>
    <circle cx={x(green)} cy={y(green)} r="8" fill="#32e76d"><title>Mapped green centre</title></circle>
    {ball && marker(ball, '#ffffff', 'Your ball')}
    {marker(target, '#ffdf00', 'Your target')}
    <text x="10" y="525" fill="#fff" fontSize="11">{shape.fairways.length ? 'Mapped features only · tee at bottom' : 'Fairway outline unavailable · tee at bottom'}</text>
  </svg>;
}
