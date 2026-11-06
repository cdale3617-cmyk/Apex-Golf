import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flag, Mountain, PanelRight, Pencil, RefreshCw, Search, Thermometer, Wind } from "lucide-react";
import type { Tab } from "../App";
import { advise, clubStats } from "../caddie";
import { redrawCourse, refreshWeather } from "../courses";
import { actions, useData, type Hole, type Round } from "../store";
import { useUnits } from "../units";
import { Button, Empty, Panel, Select, toast } from "../ui";
import { Caddie } from "../components/Caddie";
import { Compass } from "../components/Compass";
import { CourseFinder } from "../components/CourseFinder";
import { HoleArt } from "../components/HoleArt";
import { HoleEditor } from "../components/HoleEditor";
import { ShotLogger } from "../components/ShotLogger";

type Target = "F" | "C" | "B";
type Split = 50 | 60 | 70;

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
function ScoreStep({ round, hole, last, onNext }: { round: Round; hole: Hole; last: boolean; onNext: () => void }) {
  const d = useData();
  const have = d.scores.find((s) => s.roundId === round.id && s.holeNumber === hole.number);
  const [strokes, setStrokes] = useState(have?.strokes ?? hole.par);
  const [putts, setPutts] = useState(have?.putts ?? 2);
  const [fir, setFir] = useState(have?.fairwayHit ?? false);
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
  const d = useData();
  const u = useUnits();
  const active = d.rounds.find((r) => r.status === "In progress");
  const [courseId, setCourseId] = useState<string | null>(null);
  const course = d.courses.find((c) => c.id === courseId) ?? d.courses.find((c) => c.id === active?.courseId) ?? d.courses[0];
  const holes = useMemo(() => d.holes.filter((h) => h.courseId === course?.id).sort((a, b) => a.number - b.number), [d.holes, course?.id]);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Target>("C");
  const [finder, setFinder] = useState(false);
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const swipeX = useRef<number | null>(null);
  const jumped = useRef(false);
  // How wide the hole picture is: 50, 60 or 70 percent. Remembered on this phone.
  const [split, setSplit] = useState<Split>(() => {
    const saved = Number(localStorage.getItem("apex_split"));
    return saved === 50 || saved === 70 ? saved : 60;
  });
  const cycleSplit = () => {
    const next: Split = split === 60 ? 70 : split === 70 ? 50 : 60;
    setSplit(next);
    localStorage.setItem("apex_split", String(next));
  };
  const hole = holes[Math.min(index, Math.max(0, holes.length - 1))];

  // Keep the wind and temperature fresh.
  useEffect(() => {
    if (course) void refreshWeather(course.id);
  }, [course?.id]);

  // Courses saved before holes were drawn get their real hole shapes, once per launch.
  const tried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!course || course.lat === null || tried.current.has(course.id)) return;
    if (holes.length === 0 || holes.every((h) => h.shape)) return;
    tried.current.add(course.id);
    void redrawCourse(course.id).then((ok) => {
      if (ok) toast("Drew the real holes from the map.");
    });
  }, [course?.id, holes.length]);

  // Open on the first hole not scored yet, once, when a round is under way.
  useEffect(() => {
    if (jumped.current || !active || !holes.length || active.courseId !== course?.id) return;
    jumped.current = true;
    const scored = new Set(d.scores.filter((s) => s.roundId === active.id).map((s) => s.holeNumber));
    const next = holes.findIndex((h) => !scored.has(h.number));
    if (next > 0) setIndex(next);
  }, [active, holes, course, d.scores]);

  const finderSheet = <CourseFinder open={finder} onClose={() => setFinder(false)} onDone={(id) => { setCourseId(id); setIndex(0); }} />;

  if (!course || !hole) {
    return (
      <>
        <Empty
          title="Load your course"
          text="Search for a golf course and its holes, distances and today's wind load automatically."
          action={
            <Button variant="primary" onClick={() => setFinder(true)}>
              <Search size={16} /> Find a course
            </Button>
          }
        />
        {finderSheet}
      </>
    );
  }

  const stats = clubStats(d.clubs, d.shots);
  const dist = target === "F" ? hole.frontM : target === "B" ? hole.backM : hole.centerM;
  const call = advise({ hole, target, lie: "Fairway", stance: "Flat", distanceM: null, unit: u.unit, clubs: d.clubs, stats, profile: d.profile });
  const art = d.conversions.find((c) => c.courseId === hole.courseId && c.holeNumber === hole.number)?.photo;
  const targetName = target === "F" ? "front" : target === "B" ? "back" : "center";

  return (
    <div className="play">
      <div className="playrow">
        <div className="name">
          {d.courses.length > 1 ? (
            <Select value={course.id} label="Course" onChange={(v) => { setCourseId(v); setIndex(0); }} options={d.courses.map((c) => ({ value: c.id, label: c.name }))} />
          ) : (
            course.name
          )}
        </div>
        <Button size="sm" onClick={() => setFinder(true)}>
          <Search size={16} /> Find a course
        </Button>
        <Button size="icon" aria-label={"Map width " + split + " percent. Tap to change"} onClick={cycleSplit}>
          <PanelRight size={18} />
        </Button>
      </div>

      <div className={"pgrid s" + split}>
        <section
          className="map"
          onTouchStart={(e) => { swipeX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (swipeX.current === null) return;
            const dx = e.changedTouches[0].clientX - swipeX.current;
            swipeX.current = null;
            if (dx < -60 && index < holes.length - 1) setIndex(index + 1);
            if (dx > 60 && index > 0) setIndex(index - 1);
          }}
        >
          <div className="hud">
            <button type="button" className="hudbtn" aria-label="Previous hole" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <ChevronLeft size={18} />
            </button>
            <span className="pill">
              Hole {hole.number}
              <small>{index + 1} of {holes.length} · Par {hole.par}</small>
            </span>
            <button type="button" className="hudbtn" aria-label="Next hole" disabled={index >= holes.length - 1} onClick={() => setIndex(index + 1)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <HoleArt hole={hole} route={dist / hole.backM} image={art} label={u.d(hole.centerM * 0.9) + " " + u.unit} />
        </section>

        <aside className="aside">
          <Panel>
            <div className="stat"><Wind size={16} /> {hole.windKmh} km/h {hole.windDir}</div>
            <div className="stat"><Thermometer size={16} /> {hole.tempC}°C</div>
            <div className="stat"><Mountain size={16} /> {hole.elevationM > 0 ? "+" : ""}{u.d(hole.elevationM)} {u.unit}</div>
            <Button size="sm" className="btn-block" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit
            </Button>
            {course.lat !== null ? (
              <Button
                size="sm"
                variant="ghost"
                className="btn-block"
                loading={updating}
                onClick={async () => {
                  setUpdating(true);
                  const ok = await refreshWeather(course.id, true);
                  setUpdating(false);
                  toast(ok ? "Wind and temperature updated." : "Couldn't reach the weather service.");
                }}
              >
                <RefreshCw size={14} /> Update wind
              </Button>
            ) : null}
          </Panel>

          <Panel title="From tee">
            <div className="dist">
              <div className="l">Back</div>
              <div className="mid">{u.d(hole.backM)}</div>
              <hr />
              <div className="l">Center</div>
              <div className="big">{u.d(hole.centerM)}</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--info)" }}>{u.unit === "m" ? "METRES" : "YARDS"}</div>
              <div className="l">{u.alt(hole.centerM)}</div>
              <hr />
              <div className="l">Front</div>
              <div className="mid">{u.d(hole.frontM)}</div>
            </div>
          </Panel>

          <Panel title="Target">
            <div className="cols3">
              {(["F", "C", "B"] as Target[]).map((t) => (
                <Button key={t} size="sm" variant={target === t ? "primary" : "secondary"} aria-pressed={target === t} style={{ paddingInline: 0 }} onClick={() => setTarget(t)}>
                  {t}
                </Button>
              ))}
            </div>
          </Panel>

          <Panel>
            <Compass hole={hole} />
          </Panel>

          <Panel title="Club call">
            {call.club ? (
              <>
                <b style={{ fontSize: "1.1rem" }}>{call.club}</b>
                <p className="muted" style={{ fontSize: "0.78rem" }}>
                  carry {u.d(call.carryM ?? 0)} {u.unit}{call.measured ? " (your shots)" : ""} · {u.d(dist)} {u.unit} to {targetName}
                </p>
                <span className={call.reaches ? "badge ok" : "badge warn"}>{call.reaches ? "Good fit" : "Short"}</span>
              </>
            ) : (
              <p className="muted">Add clubs to your bag for a call.</p>
            )}
          </Panel>

          {active && active.courseId === course.id ? (
            <ScoreStep key={active.id + ":" + hole.id} round={active} hole={hole} last={index >= holes.length - 1} onNext={() => setIndex(index + 1)} />
          ) : (
            <Panel title="Score">
              <Button size="sm" className="btn-block" onClick={() => go("score")}>
                Start a round
              </Button>
            </Panel>
          )}

          <Panel>
            <Caddie key={hole.id} hole={hole} target={target} />
          </Panel>
          <Panel>
            <ShotLogger hole={hole} />
          </Panel>
        </aside>
      </div>
      {finderSheet}
      <HoleEditor hole={hole} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
