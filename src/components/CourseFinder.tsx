import React, { useState } from "react";
import { Flag, PencilLine, Search } from "lucide-react";
import { addManualCourse, importCourse, searchCourses, type Hit } from "../courses";
import { useUnits } from "../units";
import { Button, Empty, Field, Input, Seg, Select, Sheet } from "../ui";

function ManualForm({ onBack, onDone }: { onBack: () => void; onDone: (id: string) => void }) {
  const u = useUnits();
  const [name, setName] = useState("");
  const [town, setTown] = useState("");
  const [count, setCount] = useState<"9" | "18">("18");
  const [par, setPar] = useState<string[]>(Array(18).fill("4"));
  const [len, setLen] = useState<string[]>(Array(18).fill(""));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const n = Number(count);

  const save = async () => {
    const list = Array.from({ length: n }, (_, i) => ({ number: i + 1, par: Number(par[i]), lengthM: u.fromInput(len[i] || "0") })).filter((h) => h.lengthM > 0);
    setBusy(true);
    setProblem("");
    try {
      onDone(await addManualCourse(name, town, list));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not save the course.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted">For a course the map doesn't cover. Enter the par and length of each hole.</p>
      <Field label="Course name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Town (for today's weather)">
        <Input value={town} onChange={(e) => setTown(e.target.value)} />
      </Field>
      <Seg value={count} label="Holes" onChange={setCount} options={[{ value: "9", label: "9 holes" }, { value: "18", label: "18 holes" }]} />
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row" style={{ padding: "4px 0" }}>
          <b style={{ width: 28 }}>{i + 1}</b>
          <div style={{ width: 70 }}>
            <Select value={par[i]} label={"Par for hole " + (i + 1)} onChange={(v) => setPar((p) => p.map((x, k) => (k === i ? v : x)))} options={["3", "4", "5", "6"]} />
          </div>
          <Input type="number" inputMode="numeric" placeholder={"Length (" + u.unit + ")"} value={len[i]} onChange={(e) => setLen((p) => p.map((x, k) => (k === i ? e.target.value : x)))} />
        </div>
      ))}
      {problem ? <p className="err">{problem}</p> : null}
      <Button variant="primary" className="btn-block" loading={busy} onClick={() => void save()}>
        Save course
      </Button>
      <Button variant="ghost" className="btn-block" onClick={onBack}>
        Back to search
      </Button>
    </>
  );
}

/** Search by name or town, load every hole from the map, or type a course in by hand. */
export function CourseFinder({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: (courseId: string) => void }) {
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const finish = (id: string) => {
    setHits(null);
    setQuery("");
    setMessage("");
    setManual(false);
    onClose();
    onDone?.(id);
  };

  const search = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    setMessage("");
    setFailed(false);
    try {
      setHits(await searchCourses(query));
    } catch {
      setFailed(true);
      setMessage("Search is not available right now. Check your connection.");
    } finally {
      setSearching(false);
    }
  };

  const load = async (hit: Hit) => {
    setBusy(hit.id);
    setFailed(false);
    try {
      finish(await importCourse(hit, setMessage));
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Could not load this course.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={manual ? "Add a course by hand" : "Find a course"}>
      {manual ? (
        <ManualForm onBack={() => setManual(false)} onDone={finish} />
      ) : (
        <>
          <p className="muted">Search by course name or town. Hole lengths, par and green edges come from OpenStreetMap.</p>
          <form
            className="wrap"
            style={{ flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Royal Melbourne Golf Club" aria-label="Course name or town" />
            <Button type="submit" variant="primary" loading={searching}>
              <Search size={16} /> Search
            </Button>
          </form>
          {message ? <p className={failed ? "err" : "muted"}>{message}</p> : null}
          {hits !== null ? (
            hits.length ? (
              <div>
                {hits.map((h) => (
                  <div key={h.id} className="row">
                    <Flag size={18} />
                    <div className="grow">
                      <div className="title">{h.name}</div>
                      <div className="muted">{h.location}</div>
                    </div>
                    <Button size="sm" variant="primary" loading={busy === h.id} disabled={!!busy} onClick={() => void load(h)}>
                      Load
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No golf course found" text="Try the club's full name or a nearby town, or type the course in by hand." />
            )
          ) : null}
          <Button className="btn-block" onClick={() => setManual(true)}>
            <PencilLine size={16} /> Can't find it? Type it in by hand
          </Button>
        </>
      )}
    </Sheet>
  );
}
