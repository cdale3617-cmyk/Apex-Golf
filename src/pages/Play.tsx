import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Tab } from '../App';
import { redrawCourse, refreshWeather, repairCapricorn } from '../courses';
import { actions, getState, useData, type Hole, type Round, type XY } from '../store';
import { useUnits } from '../units';
import { Button, Empty, Field, Input, Panel, Select, Sheet, toast } from '../ui';
import { Caddie } from '../components/Caddie';
import { CourseFinder } from '../components/CourseFinder';
import { HoleArt, type MapMode } from '../components/HoleArt';
import { HoleEditor } from '../components/HoleEditor';
import { ShotLogger } from '../components/ShotLogger';
import { playingKey, startHole, type PlayingState } from '../round-state';
import { distance, edgeDistance, greenCentre, localPoint, mappedLie, planCaddie } from '../strategy';
import { getFix } from '../location';
import { Compass } from '../components/Compass';
import { usableBall } from '../round-state';
function Step({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span className="muted" style={{ fontSize: "0.8rem" }}>{label}</span>
      <div className="wrap" style={{ gap: 2, flexWrap: "nowrap" }}>
        <Button size="icon" aria-label={"Less " + label.toLowerCase()} disabled={value <= min} onClick={() => onChange(value - 1)}>−</Button>
        <b>{value}</b>
        <Button size="icon" aria-label={"More " + label.toLowerCase()} onClick={() => onChange(value + 1)}>+</Button>
      </div>
    </div>
  );
}

/** Strokes, putts and fairway for this hole of the round in progress. */
function ScoreStep({ round, hole, last, onNext, suggestedStrokes }: { round: Round; hole: Hole; suggestedStrokes: number; last: boolean; onNext: () => void }) {
  const d = useData();
  const have = d.scores.find((s) => s.roundId === round.id && s.holeNumber === hole.number);
  const [strokes, setStrokes] = useState(have?.strokes ?? Math.max(1, suggestedStrokes));
  const [putts, setPutts] = useState(have?.putts ?? 2);
  const [fir, setFir] = useState(have?.fairwayHit ?? false);
  useEffect(() => { if (!have) setStrokes(Math.max(1, suggestedStrokes)); }, [suggestedStrokes, have]);
  return (
    <Panel title={"Score, hole " + hole.number}>
      <Step label="Strokes" value={strokes} min={1} onChange={setStrokes} />
      <Step label="Putts" value={putts} min={0} onChange={setPutts} />
      {hole.par > 3 ? (
        <label className="check">
          <input type="checkbox" checked={fir} onChange={(e) => setFir(e.target.checked)} />
          Fairway hit
        </label>
      ) : null}
      <Button
        variant="primary"
        size="sm"
        className="btn-block"
        onClick={() => {
          if (putts > strokes) return toast("Putts cannot exceed strokes.");
          actions.saveScore(round.id, hole.number, { strokes, putts, fairwayHit: hole.par > 3 && fir });
          toast("Hole " + hole.number + ": " + strokes + ". Saved.");
          if (!last) onNext();
        }}
      >
        {last ? "Save hole" : "Save & next hole"}
      </Button>
    </Panel>
  );
}

export default function Play({ go }: { go: (t: Tab) => void }) {
  const d = useData(), u = useUnits();
  const active = d.rounds.find(r => r.status === 'In progress');
  const [courseId, setCourseId] = useState<string | null>(null);
  const course = d.courses.find(c => c.id === courseId) ?? d.courses.find(c => c.id === active?.courseId) ?? d.courses[0];
  const holes = useMemo(() => d.holes.filter(h => h.courseId === course?.id).sort((a,b) => a.number - b.number), [d.holes, course?.id]);
  const [index, setIndex] = useState(0);
  const hole = holes[Math.min(index, Math.max(0, holes.length - 1))];
  const round = active?.courseId === course?.id ? active : undefined;
  const key = hole ? playingKey(hole.id, round?.id ?? null) : '';
  const initial = useMemo(() => hole ? startHole(hole, round?.id ?? null) : null, [hole?.id, hole?.teeMarker, hole?.shape, round?.id]);
  const playing = d.playing[key] ?? initial;
  const [finder, setFinder] = useState(false), [editing, setEditing] = useState(false), [logging, setLogging] = useState(false);
  const [locating, setLocating] = useState(false), [problem, setProblem] = useState('');
  const [mode, setMode] = useState<MapMode>('target');
  const [targetLocked,setTargetLocked] = useState(false);
  const [selectedMarker,setSelectedMarker] = useState<'tee'|'green'>('tee');
  const [markerDraft, setMarkerDraft] = useState<{holeId:string; tee:XY; green:XY} | null>(null);
  const [target, setTarget] = useState<'F' | 'C' | 'B'>('C');
  const [manual, setManual] = useState(''), [showArt, setShowArt] = useState(false);
  const [satellite,setSatellite]=useState(()=>localStorage.getItem('apex-map-view')!=='map');
  const [clock, setClock] = useState(Date.now());
  const currentKey = useRef(key); currentKey.current = key;
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => () => { currentKey.current = ''; }, []);
  useEffect(() => { setManual(''); setProblem(''); setMode('target'); setShowArt(false); setLogging(false); setLocating(false); setTarget('C'); setMarkerDraft(null);setTargetLocked(false);setSelectedMarker('tee'); }, [key]);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!course) return;
    if(repairCapricorn(course.id))toast('Championship mapping repaired. Old marker positions backed up; clubs and scores kept.');
    void refreshWeather(course.id);
    if (!tried.current.has(course.id) && holes.some(h => !h.shape || !h.tee)) {
      tried.current.add(course.id); void redrawCourse(course.id);
    }
  }, [course?.id, holes.length]);
  const plan = useMemo(() => hole && playing ? planCaddie(hole, playing, d, u.unit, clock, target) : null, [hole, playing, d.clubs, d.shots, d.profile, u.unit, clock, target]);
  const chooseCourse = (id: string) => { setCourseId(id); setIndex(0); };
  const finderSheet = <CourseFinder open={finder} onClose={() => setFinder(false)} onDone={chooseCourse}/>;
  if (!hole || !course || !playing || !plan) return <><Empty title="Choose your course" text="Load a course, then your caddie will guide each shot." action={<Button variant="primary" onClick={() => setFinder(true)}>Find a course</Button>}/>{finderSheet}</>;
  const change = (patch: Partial<PlayingState>) => {
    const latest = getState().playing[key] ?? playing;
    actions.setPlaying({ ...latest, ...patch });
  };
  const draft = markerDraft?.holeId === hole.id ? markerDraft : null;
  const previewHole = draft ? { ...hole, teeMarker: draft.tee, greenMarker: draft.green } : hole;
  const beginMarkers = (kind:'tee'|'green') => {
    setTargetLocked(true);setSelectedMarker(kind);setShowArt(false);setMode('target');
    setMarkerDraft(current=>current?.holeId===hole.id?current:{holeId:hole.id,tee:hole.teeMarker??hole.shape!.path[0],green:greenCentre(hole)!});
  };
  const saveMarkers = () => {
    if (!draft) return;
    const patch: Pick<Hole,'teeMarker'|'greenMarker'> = {};
    if (distance(draft.tee,hole.teeMarker ?? hole.shape!.path[0]) > 0.01) patch.teeMarker = draft.tee;
    if (distance(draft.green,greenCentre(hole)!) > 0.01) patch.greenMarker = draft.green;
    if (!actions.saveMarkers(hole.id,patch)) return toast('Positions could not be saved. Try again.');
    setMarkerDraft(null); toast('Tee and green positions saved.');
  };
  const art = d.conversions.find(c => c.courseId === hole.courseId && c.holeNumber === hole.number)?.photo;
  const gps = async () => {
    const requestKey = key;
    setLocating(true); setProblem('');
    try {
      if (!hole.tee || hole.mapBearing === undefined) throw new Error('This saved hole has no GPS reference yet. Refresh its map or set the ball manually.');
      const fix = await getFix();
      if (currentKey.current !== requestKey) return;
      const latest = getState().playing[requestKey] ?? playing;
      if (latest.shot !== playing.shot || latest.locatedAt !== playing.locatedAt || latest.source !== playing.source || latest.remainingM !== playing.remainingM) return;
      const ball = localPoint(fix, hole.tee, hole.mapBearing);
      if (distance(ball, hole.shape?.path[0] ?? [0,0]) > Math.max(1000, hole.centerM + 300)) throw new Error('You are too far from this hole. Check the selected course, or set the ball on the map for practice.');
      change({ ball, lie: mappedLie(hole,ball), source: 'gps', locatedAt: fix.timestamp, accuracyM: fix.accuracy, remainingM: null });
      setClock(Date.now());
    } catch (e) { if (currentKey.current === requestKey) setProblem(e instanceof Error ? e.message : 'GPS could not start.'); }
    finally { if (currentKey.current === requestKey) setLocating(false); }
  };
  const onPoint = (p: XY) => {
    if (!hole.shape) return;
    if (mode === 'target') change({ target: p, remainingM: null });
    else if (mode === 'ball') change({ ball: p, lie: mappedLie(hole,p), source: 'map', accuracyM: null, locatedAt: Date.now(), remainingM: null });
    else {
      const shape = { ...hole.shape };
      if (mode === 'remove') {
        const choices = [...shape.water.map((poly,i) => ({ kind: 'water' as const, i, d: edgeDistance(p,poly) })), ...shape.bunkers.map((poly,i) => ({ kind: 'bunkers' as const, i, d: edgeDistance(p,poly) }))].sort((a,b) => a.d-b.d);
        if (choices[0]?.d <= 15) { const c = choices[0]; shape[c.kind] = shape[c.kind].filter((_,i) => i !== c.i); }
      } else {
        const ring: XY[] = Array.from({ length: 16 }, (_,i) => [p[0] + 10 * Math.cos(i * Math.PI / 8), p[1] + 10 * Math.sin(i * Math.PI / 8)]);
        const kind = mode === 'water' ? 'water' : 'bunkers'; shape[kind] = [...shape[kind], ring];
      }
      actions.updateHole(hole.id, { shape });
    }
  };
  const number = (m: number | null | undefined) => m === null || m === undefined ? '—' : u.d(m);
  const fromTee = playing.source === 'tee' && !plan.distances;
  const compassBall=usableBall(playing,clock),compassTarget=plan.aimPoint;
  const compassBearing=compassBall&&compassTarget&&hole.mapBearing!==undefined?(hole.mapBearing+Math.atan2(compassTarget[0]-compassBall[0],compassTarget[1]-compassBall[1])*180/Math.PI+360)%360:hole.bearing;
  return <div className="play">
    <div className="playrow"><div className="name">{course.name}</div><Button size="sm" onClick={() => setFinder(true)}>Courses</Button></div>
    <div className="hole-nav"><Button disabled={index === 0} onClick={() => setIndex(index-1)}>Previous</Button><strong>Hole {hole.number} · Par {hole.par}</strong><Button disabled={index >= holes.length-1} onClick={() => setIndex(index+1)}>Next</Button></div>
    <div className="map-view-controls"><Button size="sm" aria-pressed={satellite&&!showArt} onClick={()=>{setSatellite(true);setShowArt(false);setMode('target');localStorage.setItem('apex-map-view','satellite');}}>Satellite</Button><Button size="sm" aria-pressed={!satellite&&!showArt} onClick={()=>{setSatellite(false);setShowArt(false);localStorage.setItem('apex-map-view','map');}}>Map</Button></div>
    <div className="marker-controls">
      <Button size="sm" aria-pressed={targetLocked} disabled={!!draft} onClick={()=>setTargetLocked(!targetLocked)}>{targetLocked?'Unlock yellow target':'Lock yellow target'}</Button>
      {playing.target && !draft && <Button size="sm" onClick={()=>{change({target:null,remainingM:null});setTargetLocked(false);}}>Reset yellow target</Button>}
      {draft ? <><Button size="sm" aria-pressed={selectedMarker==='tee'} onClick={()=>beginMarkers('tee')}>Move red tee</Button><Button size="sm" aria-pressed={selectedMarker==='green'} onClick={()=>beginMarkers('green')}>Move green</Button><Button size="sm" variant="primary" onClick={saveMarkers}>Save positions</Button><Button size="sm" onClick={()=>setMarkerDraft(null)}>Cancel</Button><span>Drag red tee or green dot. Save to lock.</span></> :
        <Button size="sm" disabled={!hole.shape} onClick={()=>beginMarkers('tee')}>Move red / green dots</Button>}
    </div>
    {course.mappingRevision && <p className="muted">Championship layout · mapped distances; white-tee card distances and hazards need confirmation.</p>}
    <div className="pgrid s60">
      <section className="map">
        {showArt && art ? <><img className="reference-art" src={art} alt="Saved hole artwork"/><p className="art-note">Artwork reference only. Use Map for targets and distances.</p></> : <HoleArt key={hole.id} targetLocked={targetLocked} onToggleTargetLock={()=>setTargetLocked(value=>draft?true:!value)} selectedMarker={selectedMarker} onMarkerStart={beginMarkers} hole={previewHole} frameHole={hole} editingMarkers={!!draft} onMarker={(kind,p)=>setMarkerDraft(current=>current?{...current,[kind]:p}:null)} playing={draft&&playing.source==='tee'?{...playing,ball:draft.tee}:playing} plannedTarget={plan.plannedTarget} mode={mode} onPoint={onPoint} satellite={satellite} aimPoint={draft&&!playing.target?draft.green:plan.aimPoint}/>}
        <div className="map-caption">{draft ? `Drag ${selectedMarker==='tee'?'red tee':'green dot'} · Save positions` : showArt ? 'Artwork' : mode === 'target' ? 'Tap or drag: yellow target' : mode === 'ball' ? 'Tap or drag: your ball' : mode === 'remove' ? 'Tap a hazard to delete' : 'Tap to add a 20 m wide hazard'}</div>
      </section>
      <aside className="aside">
        <Caddie key={"caddie:"+key} plan={plan} playing={playing} hasClubs={d.clubs.some(c => c.type !== 'Putter' && c.carryM > 0)} onChange={change}/>
        {!d.clubs.some(c => c.type !== 'Putter' && c.carryM > 0) && <Button variant="primary" onClick={() => go('bag')}>Set up your bag</Button>}
        <details className="compass-panel" open><summary>Caddie compass</summary><Compass hole={{...hole,bearing:compassBearing,windKmh:hole.weatherAt&&clock-hole.weatherAt<45*60000?hole.windKmh:0}}/></details>
        <p className="muted">Mapped hazards may be incomplete. Check before playing.</p>
        <Panel title={plan.status}>
          <div className="dist"><div className="l">Target · {u.unit}</div><div className="big">{number(plan.distanceM)}</div>{plan.advice && <p>Plays like {u.d(plan.advice.playsLikeM)} {u.unit}</p>}</div>
          <div className="green-dist"><span>Front<br/><b>{number(plan.distances?.front ?? (fromTee ? hole.frontM : null))}</b></span><span>Centre<br/><b>{number(plan.distances?.center ?? (fromTee ? hole.centerM : null))}</b></span><span>Back<br/><b>{number(plan.distances?.back ?? (fromTee ? hole.backM : null))}</b></span></div>
          <Select label="Green target" value={target} onChange={v => { setTarget(v as 'F'|'C'|'B'); change({ target: null }); }} options={[{value:'F',label:'Front'},{value:'C',label:'Centre'},{value:'B',label:'Back'}]}/>
          <Button loading={locating} onClick={() => void gps()}>Use my GPS</Button>
          {problem && <p className="err" role="alert">{problem}</p>}
          <Button variant="primary" onClick={() => { actions.recordStroke(playing); setManual(''); }}>Shot played</Button>
          <p className="muted">Shot {playing.shot}. After hitting, set your next ball position.</p>
        </Panel>
        <details><summary>Ball and map tools</summary><div className="stack">
          <Button aria-pressed={mode==='ball'} onClick={() => {setMode('ball');setShowArt(false);}}>Set ball on map</Button>
          <Button aria-pressed={mode==='target'} onClick={() => {setMode('target');setShowArt(false);setTargetLocked(false);}}>Move yellow target</Button>
          <Button onClick={() => { change({ball:hole.teeMarker??hole.shape?.path[0]??null,source:'tee',accuracyM:null,remainingM:null,lie:'Tee',locatedAt:Date.now()}); }}>Ball at tee</Button>
          <Field label={'Remaining distance ('+u.unit+')'}><Input type="number" inputMode="numeric" value={manual} onChange={e => setManual(e.target.value)} placeholder="To your target"/></Field>
          <Button onClick={() => {const m = u.fromInput(manual); if (!(m>=3 && m<=1000)) return toast('Enter 3–1000 metres, or the equivalent in yards.'); change({remainingM:m,source:'manual',ball:null,accuracyM:null});}}>Use distance</Button>
          <Button onClick={() => change({shot:Math.max(1,playing.shot-1)})}>Correct shot count −1</Button>
          {art && <Button onClick={() => setShowArt(!showArt)}>{showArt?'Show map':'View saved artwork'}</Button>}
          <Button onClick={() => setEditing(true)}>Edit hole / conditions</Button>
          <Button onClick={() => void refreshWeather(course.id,true).then(ok=>toast(ok?'Weather updated.':'Weather unavailable.'))}>Refresh weather</Button>
          <details><summary>Mark or remove hazards</summary><p className="muted">Tap the map to add a 10 m radius water or bunker area. These are approximate marks, saved on this phone.</p>
          <Button onClick={() => {setMode('water');setShowArt(false);setSatellite(false);}}>Mark water</Button><Button onClick={() => {setMode('bunker');setShowArt(false);setSatellite(false);}}>Mark bunker</Button><Button onClick={() => {setMode('remove');setShowArt(false);setSatellite(false);}}>Remove hazard</Button></details>
        </div></details>
        <Button onClick={() => setLogging(true)}>Log a measured carry</Button>
        {round ? <ScoreStep key={"score:"+key} suggestedStrokes={playing.shot-1} round={round} hole={hole} last={index>=holes.length-1} onNext={() => setIndex(index+1)}/> : <Button onClick={() => go('score')}>Start a scored round</Button>}
      </aside>
    </div>
    {finderSheet}<HoleEditor hole={hole} open={editing} onClose={() => setEditing(false)}/>
    <Sheet title="Log distance for club learning" open={logging} onClose={() => setLogging(false)}><p>This records distance only. Use “Shot played” once after each stroke to advance the shot count.</p><ShotLogger key={key} hole={hole}/></Sheet>
  </div>;
}
