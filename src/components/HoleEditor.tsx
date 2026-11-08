import React, { useEffect, useState } from "react";
import { COMPASS } from "../geo";
import { actions, type Hole } from "../store";
import { useUnits } from "../units";
import { Button, Field, Input, Select, Sheet, toast } from "../ui";

/** Correct a hole: length, par, wind, heat and slope. */
export function HoleEditor({ hole, open, onClose }: { hole: Hole; open: boolean; onClose: () => void }) {
  const u = useUnits();
  const [f, setF] = useState({ center: "", front: "", back: "", par: "4", wind: "", dir: "N", temp: "", rise: "", bearing: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF({
      center: String(u.d(hole.centerM)), front: String(u.d(hole.frontM)), back: String(u.d(hole.backM)),
      par: String(hole.par), wind: String(hole.windKmh), dir: hole.windDir, temp: String(hole.tempC), rise: String(u.d(hole.elevationM)),
      bearing: hole.bearing === null ? "" : String(Math.round(hole.bearing)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hole.id]);

  const save = () => {
    const centerM = u.fromInput(f.center);
    if (!(centerM >= 20)) return toast("Enter the hole length.");
    actions.updateHole(hole.id, {
      centerM,
      weatherAt: Number(f.wind) !== hole.windKmh || f.dir !== hole.windDir || Number(f.temp) !== hole.tempC ? Date.now() : hole.weatherAt,
      slopeKnown: hole.slopeKnown || u.fromInput(f.rise) !== hole.elevationM,
      edgesEstimated: hole.edgesEstimated && u.fromInput(f.front) === hole.frontM && u.fromInput(f.back) === hole.backM,
      frontM: f.front.trim() ? u.fromInput(f.front) : centerM - 10,
      backM: f.back.trim() ? u.fromInput(f.back) : centerM + 10,
      par: Number(f.par) || 4,
      windKmh: Math.max(0, Number(f.wind) || 0),
      windDir: (COMPASS as readonly string[]).includes(f.dir) ? (f.dir as Hole["windDir"]) : "N",
      tempC: Number(f.temp) || 0,
      elevationM: u.fromInput(f.rise),
      bearing: f.bearing.trim() === "" ? null : ((Number(f.bearing) % 360) + 360) % 360,
    });
    toast("Hole " + hole.number + " updated.");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={"Edit hole " + hole.number}>
      <div className="cols3">
        <Field label={"Back (" + u.unit + ")"}>
          <Input type="number" inputMode="numeric" value={f.back} onChange={(e) => set("back")(e.target.value)} />
        </Field>
        <Field label={"Centre (" + u.unit + ")"}>
          <Input type="number" inputMode="numeric" value={f.center} onChange={(e) => set("center")(e.target.value)} />
        </Field>
        <Field label={"Front (" + u.unit + ")"}>
          <Input type="number" inputMode="numeric" value={f.front} onChange={(e) => set("front")(e.target.value)} />
        </Field>
      </div>
      <div className="cols2">
        <Field label="Par">
          <Select value={f.par} onChange={set("par")} options={["3", "4", "5", "6"]} />
        </Field>
        <Field label={"Green above tee (" + u.unit + ")"}>
          <Input type="number" inputMode="numeric" value={f.rise} onChange={(e) => set("rise")(e.target.value)} />
        </Field>
        <Field label="Wind (km/h)">
          <Input type="number" inputMode="numeric" value={f.wind} onChange={(e) => set("wind")(e.target.value)} />
        </Field>
        <Field label="Wind from">
          <Select value={f.dir} onChange={set("dir")} options={[...COMPASS]} />
        </Field>
        <Field label="Temperature (°C)">
          <Input type="number" inputMode="numeric" value={f.temp} onChange={(e) => set("temp")(e.target.value)} />
        </Field>
        <Field label="Hole points (°, 0 = north)">
          <Input type="number" inputMode="numeric" value={f.bearing} onChange={(e) => set("bearing")(e.target.value)} placeholder="unknown" />
        </Field>
      </div>
      <Button variant="primary" className="btn-block" onClick={save}>
        Save hole
      </Button>
    </Sheet>
  );
}
