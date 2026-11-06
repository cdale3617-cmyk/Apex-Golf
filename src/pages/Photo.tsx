import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { convertImage, type Options, type Report, type Style } from "../convert";
import { actions, useData } from "../store";
import { Button, Empty, Field, Input, Panel, Seg, Select, Sheet, toast } from "../ui";

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <Field label={label + ": " + value}>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

export default function Photo() {
  const d = useData();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState("");
  const [opts, setOpts] = useState<Options>({ style: "Illustrated 3D", density: 60, tilt: 40, brightness: 100, treeBias: 50 });
  const [report, setReport] = useState<Report | null>(null);
  const [original, setOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [holeNo, setHoleNo] = useState("1");
  const set = <K extends keyof Options>(k: K) => (v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const pick = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      setSrc(url);
      setImg(im);
      setOriginal(false);
    };
    im.onerror = () => toast("That picture could not be opened.");
    im.src = url;
  };

  useEffect(() => {
    if (!img || !canvas.current) return;
    setBusy(true);
    const t = window.setTimeout(() => {
      try {
        if (canvas.current) setReport(convertImage(img, canvas.current, opts));
      } finally {
        setBusy(false);
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [img, opts]);

  const courseHoles = d.holes.filter((h) => h.courseId === (courseId || d.courses[0]?.id)).sort((a, b) => a.number - b.number);
  const label = (cId: string | null, n: number | null) => (d.courses.find((c) => c.id === cId)?.name ?? "Any course") + (n ? ", hole " + n : "");

  return (
    <div className="stack">
      <h2 style={{ fontSize: "1.2rem" }}>3D Photo</h2>
      <p className="muted">Take a satellite screenshot or photo of a hole. It turns into a drawn 3D fairway you can attach to that hole.</p>
      <label className="btn btn-primary btn-block" style={{ cursor: "pointer" }}>
        <ImagePlus size={18} /> Choose a picture
        <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </label>

      {img ? (
        <>
          {original ? <img src={src} alt="Original" className="out" style={{ width: "100%", borderRadius: 14 }} /> : null}
          <canvas ref={canvas} className="out" style={{ display: original ? "none" : "block" }} aria-label="Converted picture" />
          <div className="between">
            <Button size="sm" onClick={() => setOriginal(!original)}>
              {original ? "Show 3D" : "Show original"}
            </Button>
            {busy ? <span className="muted">Working…</span> : report ? <span className="muted">Fairway {report.fairway}% · trees {report.trees}% · sand {report.sand}% · water {report.water}%</span> : null}
          </div>
          <Seg<Style> value={opts.style} label="Style" onChange={set("style")} options={[{ value: "Illustrated 3D", label: "Illustrated" }, { value: "Tilted 3D", label: "Tilted" }, { value: "Night", label: "Night" }]} />
          <Panel className="plain">
            <Slider label="Tree density" value={opts.density} min={10} max={100} onChange={set("density")} />
            <Slider label="Trees in the picture" value={opts.treeBias} min={0} max={100} onChange={set("treeBias")} />
            <Slider label="3D tilt" value={opts.tilt} min={0} max={100} onChange={set("tilt")} />
            <Slider label="Brightness" value={opts.brightness} min={60} max={130} onChange={set("brightness")} />
          </Panel>
          <Button variant="primary" className="btn-block" disabled={busy} onClick={() => { setCourseId(d.courses[0]?.id ?? ""); setHoleNo("1"); setSaving(true); }}>
            Save to a hole
          </Button>
        </>
      ) : null}

      <Panel title="Saved pictures" className="plain">
        {d.conversions.length === 0 ? (
          <Empty title="Nothing saved yet" text="A saved picture replaces the drawing on the Play screen for that hole." />
        ) : (
          <div className="thumbs">
            {d.conversions.map((c) => (
              <div key={c.id} className="stack" style={{ gap: 4 }}>
                <img src={c.photo} alt={c.title} />
                <span className="muted" style={{ fontSize: "0.75rem" }}>{label(c.courseId, c.holeNumber)}</span>
                <Button variant="ghost" size="sm" aria-label="Delete picture" onClick={() => actions.deleteConversion(c.id)}>
                  <Trash2 size={14} /> Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Sheet open={saving} onClose={() => setSaving(false)} title="Save to a hole">
        {d.courses.length === 0 ? (
          <Empty title="Load a course first" text="Find your course on the Play tab, then save the picture to one of its holes." />
        ) : (
          <>
            <Field label="Course">
              <Select value={courseId || d.courses[0].id} onChange={(v) => { setCourseId(v); setHoleNo("1"); }} options={d.courses.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Hole">
              <Select value={holeNo} onChange={setHoleNo} options={courseHoles.map((h) => ({ value: String(h.number), label: "Hole " + h.number }))} />
            </Field>
            <Button
              variant="primary"
              className="btn-block"
              onClick={() => {
                if (!canvas.current) return;
                const cid = courseId || d.courses[0].id;
                actions.addConversion({ title: "Hole " + holeNo, courseId: cid, holeNumber: Number(holeNo), style: opts.style, photo: canvas.current.toDataURL("image/jpeg", 0.8) });
                toast("Saved. Play now shows it for hole " + holeNo + ".");
                setSaving(false);
              }}
            >
              Save picture
            </Button>
          </>
        )}
      </Sheet>
    </div>
  );
}
