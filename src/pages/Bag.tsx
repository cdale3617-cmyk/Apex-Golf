import React, { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { MIN_SHOTS, clubStats, tendency } from "../caddie";
import { STANDARD_BAG, actions, useData, type Club, type ClubType } from "../store";
import { useUnits } from "../units";
import { Button, Empty, Field, Input, Panel, Select, Sheet } from "../ui";

const TYPES: ClubType[] = ["Driver", "Wood", "Hybrid", "Iron", "Wedge", "Putter"];

function ClubSheet({ club, open, onClose }: { club: Club | null; open: boolean; onClose: () => void }) {
  const u = useUnits();
  const [f, setF] = useState({ name: "", type: "Iron", loft: "", carry: "", total: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!open) return;
    setF(club ? { name: club.name, type: club.type, loft: String(club.loft), carry: String(u.d(club.carryM)), total: String(u.d(club.totalM)) } : { name: "", type: "Iron", loft: "", carry: "", total: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, club?.id]);
  const save = () => {
    if (!f.name.trim()) return;
    actions.saveClub({
      id: club?.id, name: f.name.trim(), type: f.type as ClubType, loft: Number(f.loft) || 0,
      carryM: u.fromInput(f.carry), totalM: f.total.trim() ? u.fromInput(f.total) : u.fromInput(f.carry),
    });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={club ? "Edit club" : "Add a club"}>
      <Field label="Name">
        <Input value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder="7 Iron" />
      </Field>
      <div className="cols2">
        <Field label="Type">
          <Select value={f.type} onChange={set("type")} options={TYPES} />
        </Field>
        <Field label="Loft (°)">
          <Input type="number" inputMode="decimal" value={f.loft} onChange={(e) => set("loft")(e.target.value)} />
        </Field>
        <Field label={"Carry (" + u.unit + ")"}>
          <Input type="number" inputMode="numeric" value={f.carry} onChange={(e) => set("carry")(e.target.value)} />
        </Field>
        <Field label={"Total (" + u.unit + ")"}>
          <Input type="number" inputMode="numeric" value={f.total} onChange={(e) => set("total")(e.target.value)} />
        </Field>
      </div>
      <Button variant="primary" className="btn-block" onClick={save}>
        Save club
      </Button>
    </Sheet>
  );
}

export default function Bag() {
  const d = useData();
  const u = useUnits();
  const [sheet, setSheet] = useState<{ club: Club | null } | null>(null);
  const stats = clubStats(d.clubs, d.shots);
  const clubs = [...d.clubs].sort((a, z) => z.carryM - a.carryM);

  return (
    <div className="stack">
      <div className="between">
        <h2 style={{ fontSize: "1.2rem" }}>Your bag</h2>
        <Button variant="primary" size="sm" onClick={() => setSheet({ club: null })}>
          <Plus size={16} /> Add club
        </Button>
      </div>
      {clubs.length === 0 ? (
        <Empty
          title="Fill your bag"
          text="Add your clubs and the carry for each. The caddie uses them, and learns your real distances from the shots you log."
          action={
            <Button variant="primary" onClick={() => actions.addClubs(STANDARD_BAG)}>
              Add a standard set
            </Button>
          }
        />
      ) : (
        <Panel className="plain">
          {clubs.map((c) => {
            const s = stats.find((x) => x.clubId === c.id);
            const measured = !!s && s.n >= MIN_SHOTS;
            return (
              <div key={c.id} className="row">
                <div className="grow">
                  <div className="title">{c.name}</div>
                  <div className="muted">{c.type} · {c.loft}°</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b>{c.type === "Putter" ? "–" : u.d(measured && s ? s.avgCarryM : c.carryM) + " " + u.unit}</b>
                  {measured ? <div className="badge ok">measured</div> : null}
                </div>
                <Button variant="ghost" size="icon" aria-label={"Edit " + c.name} onClick={() => setSheet({ club: c })}>
                  <Pencil size={16} />
                </Button>
                <Button variant="ghost" size="icon" aria-label={"Delete " + c.name} onClick={() => window.confirm("Remove " + c.name + " from your bag?") && actions.deleteClub(c.id)}>
                  <Trash2 size={16} />
                </Button>
              </div>
            );
          })}
        </Panel>
      )}

      {d.clubs.length > 0 ? (
        <Panel title="Real distances" className="plain">
          <p className="muted">Log shots on the Play tab. After {MIN_SHOTS} shots with a club, the caddie uses what you really hit.</p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Club</th>
                <th className="n">Shots</th>
                <th className="n">Average</th>
                <th>Miss</th>
              </tr>
            </thead>
            <tbody>
              {stats.filter((s) => d.clubs.find((c) => c.id === s.clubId)?.type !== "Putter").map((s) => (
                <tr key={s.clubId}>
                  <td>{s.name}</td>
                  <td className="n">{s.n}</td>
                  <td className="n">{s.n ? u.d(s.avgCarryM) + " (" + u.d(s.minM) + "–" + u.d(s.maxM) + ")" : "–"}</td>
                  <td>{s.n ? tendency(s) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      {d.shots.length ? (
        <Panel title="Recent shots" className="plain">
          {d.shots.slice(0, 10).map((s) => (
            <div key={s.id} className="row">
              <div className="grow">
                <div className="title">{s.clubName ?? "Club"}</div>
                <div className="muted">{s.direction} · {s.lie}</div>
              </div>
              <b>{u.d(s.carryM)} {u.unit}</b>
              <Button variant="ghost" size="icon" aria-label="Delete shot" onClick={() => actions.deleteShot(s.id)}>
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </Panel>
      ) : null}
      <ClubSheet club={sheet?.club ?? null} open={!!sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
