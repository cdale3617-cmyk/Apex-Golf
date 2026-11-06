import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Tab } from "../App";
import { actions, roundTotals, useData, type Round } from "../store";
import { Button, Empty, Panel } from "../ui";
import { StartRound } from "../components/StartRound";
import { vsPar } from "./Home";

function ScoreTable({ round }: { round: Round }) {
  const d = useData();
  const holes = d.holes.filter((h) => h.courseId === round.courseId).sort((a, b) => a.number - b.number);
  const t = roundTotals(round, d);
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Hole</th>
          <th className="n">Par</th>
          <th className="n">Strokes</th>
          <th className="n">Putts</th>
          <th className="n">FIR</th>
        </tr>
      </thead>
      <tbody>
        {holes.map((h) => {
          const s = d.scores.find((x) => x.roundId === round.id && x.holeNumber === h.number);
          return (
            <tr key={h.id}>
              <td>{h.number}</td>
              <td className="n">{h.par}</td>
              <td className="n">{s ? s.strokes : "–"}</td>
              <td className="n">{s ? s.putts : "–"}</td>
              <td className="n">{s ? (h.par > 3 ? (s.fairwayHit ? "✓" : "✗") : "") : "–"}</td>
            </tr>
          );
        })}
        <tr>
          <td><b>Total</b></td>
          <td className="n"><b>{t.par}</b></td>
          <td className="n"><b>{t.strokes}</b></td>
          <td className="n"><b>{t.putts}</b></td>
          <td className="n"><b>{t.fairways}</b></td>
        </tr>
      </tbody>
    </table>
  );
}

export default function Score({ go }: { go: (t: Tab) => void }) {
  const d = useData();
  const [start, setStart] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const active = d.rounds.find((r) => r.status === "In progress");
  const past = d.rounds.filter((r) => r.status === "Complete");
  const name = (r: Round) => d.courses.find((c) => c.id === r.courseId)?.name ?? "Course";

  return (
    <div className="stack">
      {active ? (
        <Panel title="Round in progress">
          <div className="between">
            <b>{name(active)}</b>
            <span className="muted">{active.date}</span>
          </div>
          <ScoreTable round={active} />
          <div className="cols2">
            <Button variant="primary" onClick={() => go("play")}>
              Score on Play
            </Button>
            <Button onClick={() => actions.finishRound(active.id)}>Finish round</Button>
          </div>
        </Panel>
      ) : (
        <Panel title="Scorecard">
          <p className="muted">No round in progress.</p>
          <Button variant="primary" className="btn-block" onClick={() => setStart(true)}>
            Start a round
          </Button>
        </Panel>
      )}

      <Panel title="Past rounds" className="plain">
        {past.length === 0 ? (
          <Empty title="No finished rounds yet" text="Finish a round and it shows up here." />
        ) : (
          past.map((r) => {
            const t = roundTotals(r, d);
            return (
              <div key={r.id}>
                <div className="row" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <div className="grow">
                    <div className="title">{name(r)}</div>
                    <div className="muted">{r.date} · {t.played} holes</div>
                  </div>
                  <b>{t.played ? t.strokes + " (" + vsPar(t.strokes, t.par) + ")" : "–"}</b>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete round"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("Delete this round and its scores?")) actions.deleteRound(r.id);
                    }}
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
                {open === r.id ? <ScoreTable round={r} /> : null}
              </div>
            );
          })
        )}
      </Panel>
      <StartRound open={start} onClose={() => setStart(false)} onStarted={() => go("play")} />
    </div>
  );
}
