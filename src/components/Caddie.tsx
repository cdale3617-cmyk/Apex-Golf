import React, { useEffect, useRef, useState } from 'react';
import { parseNote } from '../caddie';
import { canListen, canSpeak, listen, speak, stopSpeaking } from '../voice';
import type { CaddiePlan } from '../strategy';
import type { PlayingState } from '../round-state';
import { useUnits } from '../units';
import { Button, Field, Input, Select } from '../ui';

export function Caddie({ plan, playing, onChange }: { plan: CaddiePlan; playing: PlayingState; onChange: (patch: Partial<PlayingState>) => void }) {
  const u = useUnits();
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const stop = useRef<(() => void) | null>(null);
  const [readNext, setReadNext] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current?.(); stopSpeaking(); }; }, []);
  // Speak the same freshly computed plan that is on screen, after shared state updates.
  useEffect(() => {
    stopSpeaking();
    if (readNext && plan.advice) speak(plan.advice.lines.map(l => `${l.label}: ${l.text}`).join(' ') + ' ' + plan.warnings.join(' '));
    setReadNext(false);
  }, [plan]);
  const apply = (words: string) => {
    const p = parseNote(words, u.unit);
    onChange({ ...(p.lie ? { lie: p.lie } : {}), ...(p.stance ? { stance: p.stance } : {}),
      ...(p.distanceM ? { remainingM: p.distanceM, source: 'manual', ball: null, accuracyM: null } : {}) });
    setReadNext(true);
  };
  const talk = () => {
    if (listening) return stop.current?.();
    stopSpeaking(); setError(''); setListening(true);
    let words = '';
    stop.current = listen({ onText: text => { if (alive.current) { words = text; setNote(text); } },
      onError: m => { if (alive.current) setError(m); }, onEnd: () => { if (alive.current) { setListening(false); if (words) apply(words); } } });
  };
  return <div className="stack">
    <div className="caddie-call" aria-live="polite"><span className="eyebrow">Your caddie · shot {playing.shot}</span>
      <h2>{plan.advice?.club ?? (playing.lie === 'Green' ? 'Putter' : plan.distanceM === null ? 'Where is your ball?' : 'Choose a clear target')}</h2>
      <p>{plan.advice?.lines.find(l => l.label === 'Plan' || l.label === 'Club')?.text ?? 'Set the ball on the map, use GPS, or enter your remaining distance.'}</p>
    </div>
    {canListen() && <Button variant="primary" onClick={talk}>{listening ? 'Listening… tap to send' : 'Talk to your caddie'}</Button>}
    {error && <p className="err">{error}</p>}
    <details><summary>Tell the caddie more</summary><div className="stack">
      <Field label="Lie"><Select label="Lie" value={playing.lie} onChange={lie => onChange({ lie })} options={['Unknown','Tee','Green','Fairway','Light rough','Heavy rough','Fairway bunker','Greenside bunker','Bare lie / hardpan']}/></Field>
      <Field label="Stance"><Select label="Stance" value={playing.stance} onChange={stance => onChange({ stance })} options={['Flat','Ball above feet','Ball below feet','Uphill lie','Downhill lie']}/></Field>
      <Field label="Tell me distance, lie or stance"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="150 metres, heavy rough"/></Field>
      <Button onClick={() => apply(note)}>Update advice</Button>
    </div></details>
    {canSpeak() && plan.advice && <Button onClick={() => { stopSpeaking(); speak(plan.advice!.lines.map(l => `${l.label}: ${l.text}`).join(' ') + ' ' + plan.warnings.join(' ')); }}>Read advice aloud</Button>}
    {plan.advice && <details><summary>Shot plan and reasons</summary><div className="advice">{plan.advice.lines.map(l => <p key={l.label}><b>{l.label}:</b> {l.text}</p>)}</div></details>}
    <details><summary>What the caddie knows</summary>{plan.warnings.map(w => <p className="muted" key={w}>{w}</p>)}</details>
  </div>;
}
