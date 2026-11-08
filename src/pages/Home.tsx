import React, { useEffect, useState } from "react";
import { Flag, Mountain, Search, Thermometer, Wind } from "lucide-react";
import type { Tab } from "../App";
import { refreshWeather } from "../courses";
import { roundTotals, useData } from "../store";
import { Button, Empty, Panel } from "../ui";
import { CourseFinder } from "../components/CourseFinder";
import { StartRound } from "../components/StartRound";
import { useUnits } from "../units";

export const vsPar = (strokes: number, par: number) => (strokes === par ? "E" : (strokes > par ? "+" : "") + (strokes - par));

export default function Home({ go }: { go: (t: Tab) => void }) {
  const d = useData();
  const u = useUnits();
  const [finder, setFinder] = useState(false);
  const [start, setStart] = useState(false);
  const active = d.rounds.find((r) => r.status === "In progress");
  const course = d.courses.find((c) => c.id === active?.courseId) ?? d.courses[0];
  const first = d.holes.filter((h) => h.courseId === course?.id).sort((a, b) => a.number - b.number)[0];
  const recent = d.rounds.filter((r) => r.status === "Complete").slice(0, 3);
  const welcome=<section className="home-hero"><img src="apex-compass.svg" alt="Apex Golf compass emblem"/><p className="eyebrow">APEX GOLF</p><h2>Your caddie. Every shot.</h2><p>Course, clubs and a clear plan.</p></section>;

  useEffect(() => {
    if (course) void refreshWeather(course.id);
  }, [course?.id]);

  if (!course) {
    return (
      <>
        {welcome}
        <Empty
          title="Welcome to APEX Golf"
          text="Load your course and your caddie gets to work: distances, wind, club calls and scoring. Everything is saved on this phone."
          action={
            <Button variant="primary" onClick={() => setFinder(true)}>
              <Search size={16} /> Find a course
            </Button>
          }
        />
        <CourseFinder open={finder} onClose={() => setFinder(false)} onDone={() => go("play")} />
      </>
    );
  }

  const t = active ? roundTotals(active, d) : null;
  const total = d.holes.filter((h) => h.courseId === active?.courseId).length;

  return (
    <div className="stack">
      {welcome}
      {active && t ? (
        <Panel title="Round in progress">
          <b style={{ fontSize: "1.1rem" }}>{course.name}</b>
          <p className="muted">
            {t.played} of {total} holes played{t.played ? " · " + t.strokes + " (" + vsPar(t.strokes, t.par) + ")" : ""}
          </p>
          <div className="cols2">
            <Button variant="primary" onClick={() => go("play")}>
              Continue on Play
            </Button>
            <Button onClick={() => go("score")}>Scorecard</Button>
          </div>
        </Panel>
      ) : (
        <Panel title="Ready to play?">
          <b style={{ fontSize: "1.1rem" }}>{course.name}</b>
          <div className="cols2">
            <Button variant="primary" onClick={() => setStart(true)}>
              Start a round
            </Button>
            <Button onClick={() => go("play")}>Open Play</Button>
          </div>
        </Panel>
      )}

      {first ? (
        <Panel title="Conditions">
          <div className="wrap" style={{ gap: 14 }}>
            <span className="stat"><Wind size={16} /> {first.windKmh} km/h {first.windDir}</span>
            <span className="stat"><Thermometer size={16} /> {first.tempC}°C</span>
            <span className="stat"><Mountain size={16} /> {course.holes} holes · par {course.par}</span>
          </div>
        </Panel>
      ) : null}

      <Panel title="Your caddie">
        <p className="muted">
          {d.clubs.length} clubs in your bag · {d.shots.length} shots logged{d.profile?.handicap != null ? " · handicap " + d.profile.handicap : ""}
        </p>
        <div className="cols2">
          <Button onClick={() => go("bag")}>Bag</Button>
          <Button onClick={() => setFinder(true)}>
            <Flag size={16} /> Add a course
          </Button>
        </div>
      </Panel>

      {recent.length ? (
        <Panel title="Recent rounds" className="plain">
          {recent.map((r) => {
            const tt = roundTotals(r, d);
            return (
              <div key={r.id} className="row">
                <div className="grow">
                  <div className="title">{d.courses.find((c) => c.id === r.courseId)?.name ?? "Course"}</div>
                  <div className="muted">{r.date}</div>
                </div>
                <b>{tt.played ? tt.strokes + " (" + vsPar(tt.strokes, tt.par) + ")" : "No score"}</b>
              </div>
            );
          })}
        </Panel>
      ) : null}
      <p className="muted" style={{ textAlign: "center" }}>Distances in {u.unit === "m" ? "metres" : "yards"}. Change it at the top.</p>
      <StartRound open={start} onClose={() => setStart(false)} onStarted={() => go("play")} />
      <CourseFinder open={finder} onClose={() => setFinder(false)} onDone={() => go("play")} />
    </div>
  );
}
