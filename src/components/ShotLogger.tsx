import React, { useState } from "react";
import { Crosshair, Flag } from "lucide-react";
import { metres, type Pt } from "../geo";
import { actions, useData, type Hole } from "../store";
import { useUnits } from "../units";
import { Button, Field, Input, Select, toast } from "../ui";

const LIES = ["Tee", "Fairway", "Rough", "Bunker"];
const DIRECTIONS = ["Left", "Straight", "Right"] as const;

const where = (): Promise<Pt> =>
  new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This phone can't find your position."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error("Couldn't get your position. Allow location for APEX Golf, or type the distance.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });

/** Log one shot: which club, how far it went, which way. The caddie learns from these. */
export function ShotLogger({ hole }: { hole: Hole }) {
  const clubs = useData().clubs.filter((c) => c.type !== "Putter");
  const u = useUnits();
  const [clubId, setClubId] = useState("");
  const [distance, setDistance] = useState("");
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>("Straight");
  const [lie, setLie] = useState("Fairway");
  const [start, setStart] = useState<Pt | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState("");

  const locate = async (then: (p: Pt) => void) => {
    setProblem("");
    setLocating(true);
    try {
      then(await where());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't get your position.");
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    const chosen = clubs.find((c) => c.id === clubId);
    const m = u.fromInput(distance);
    if (!chosen) return setProblem("Choose the club you hit.");
    if (!(m >= 3 && m <= 400)) return setProblem("Enter how far it went, or measure it.");
    setProblem("");
    actions.addShot({ clubId: chosen.id, clubName: chosen.name, carryM: m, direction, lie, holeId: hole.id });
    toast(chosen.name + ": " + u.d(m) + " " + u.unit + ", " + direction.toLowerCase() + ". Logged.");
    setDistance("");
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3 className="eyebrow">Log a shot</h3>
      {clubs.length === 0 ? (
        <p className="muted">Add your clubs on the Bag page first.</p>
      ) : (
        <>
          <Field label="Club">
            <Select value={clubId} onChange={setClubId} label="Club" options={[{ value: "", label: "Which club?" }, ...clubs.map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
          <Field label={"Distance (" + u.unit + ")"}>
            <Input type="number" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="How far?" />
          </Field>
          {start ? (
            <Button variant="primary" size="sm" className="btn-block" loading={locating} onClick={() => void locate((p) => { setDistance(String(u.d(metres(start, p)))); setStart(null); })}>
              <Flag size={16} /> I'm at the ball: measure
            </Button>
          ) : (
            <Button size="sm" className="btn-block" loading={locating} onClick={() => void locate(setStart)}>
              <Crosshair size={16} /> Mark my spot before I hit
            </Button>
          )}
          <div className="cols3" role="group" aria-label="Which way did it go">
            {DIRECTIONS.map((x) => (
              <Button key={x} size="sm" variant={direction === x ? "primary" : "secondary"} aria-pressed={direction === x} style={{ paddingInline: 0 }} onClick={() => setDirection(x)}>
                {x}
              </Button>
            ))}
          </div>
          <Select value={lie} onChange={setLie} label="Lie" options={LIES} />
          {problem ? <p className="err">{problem}</p> : null}
          <Button variant="primary" className="btn-block" onClick={save}>
            Log shot
          </Button>
        </>
      )}
    </div>
  );
}
