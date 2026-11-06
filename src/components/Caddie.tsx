import React, { useEffect, useRef, useState } from "react";
import { Mic, Sparkles, Square, Volume2 } from "lucide-react";
import { advise, clubStats, parseNote, type Advice } from "../caddie";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "../voice";
import { useData, type Hole } from "../store";
import { useUnits } from "../units";
import { Button, Field, Input, Select } from "../ui";

const LIES = ["Tee", "Fairway", "Light rough", "Heavy rough", "Fairway bunker", "Greenside bunker", "Bare lie / hardpan"];
const STANCES = ["Flat", "Ball above feet", "Ball below feet", "Uphill lie", "Downhill lie"];

/** Ask the caddie what to hit. It answers on the phone, with no connection needed. */
export function Caddie({ hole, target }: { hole: Hole; target: "F" | "C" | "B" }) {
  const d = useData();
  const u = useUnits();
  const [lie, setLie] = useState("Fairway");
  const [stance, setStance] = useState("Flat");
  const [distance, setDistance] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Advice | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speakOn, setSpeakOn] = useState(() => localStorage.getItem("apex_caddie_speak") !== "off");
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stopRef.current?.();
      stopSpeaking();
    },
    [],
  );

  const say = (a: Advice) => {
    if (!canSpeak()) return;
    setSpeaking(true);
    speak(a.lines.map((l) => l.label + ": " + l.text).join(" "), () => setSpeaking(false));
  };

  const ask = (spoken?: string) => {
    const words = (spoken ?? note).trim();
    const p = parseNote(words, u.unit);
    const lieUsed = p.lie ?? lie;
    const stanceUsed = p.stance ?? stance;
    if (p.lie) setLie(p.lie);
    if (p.stance) setStance(p.stance);
    const typed = distance.trim() ? u.fromInput(distance.trim()) : null;
    const advice = advise({
      hole, target, lie: lieUsed, stance: stanceUsed, distanceM: typed ?? p.distanceM ?? null,
      unit: u.unit, clubs: d.clubs, stats: clubStats(d.clubs, d.shots), profile: d.profile,
    });
    stopSpeaking();
    setResult(advice);
    if (speakOn) say(advice);
  };

  const talk = () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    stopSpeaking();
    setSpeaking(false);
    setVoiceError("");
    setHeard("");
    setListening(true);
    let last = "";
    stopRef.current = listen({
      onText: (text) => {
        last = text;
        setHeard(text);
      },
      onError: (m) => setVoiceError(m),
      onEnd: () => {
        setListening(false);
        if (last) {
          setNote(last);
          ask(last);
        }
      },
    });
  };

  const wind = result && result.headwind !== null ? (result.headwind >= 0 ? result.headwind + " km/h into you" : Math.abs(result.headwind) + " km/h behind you") : null;
  const cross = result && result.crosswind !== null && Math.abs(result.crosswind) >= 2 ? Math.abs(result.crosswind) + " km/h from your " + (result.crosswind > 0 ? "right" : "left") : null;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3 className="eyebrow">Ask your caddie</h3>
      <Field label="Lie">
        <Select value={lie} onChange={setLie} options={LIES} label="Lie" />
      </Field>
      <Field label="Stance">
        <Select value={stance} onChange={setStance} options={STANCES} label="Stance" />
      </Field>
      <Field label={"To pin (" + u.unit + ")"}>
        <Input type="number" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="auto" />
      </Field>
      <Field label="Anything else?">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="150 out, in the rough…" />
      </Field>
      {canListen() ? (
        <Button variant={listening ? "secondary" : "primary"} className="btn-block" onClick={talk}>
          {listening ? (
            <>
              <Square size={16} /> Listening… tap to send
            </>
          ) : (
            <>
              <Mic size={16} /> Talk to your caddie
            </>
          )}
        </Button>
      ) : null}
      {listening && heard ? <p className="muted">“{heard}”</p> : null}
      {voiceError ? <p className="err">{voiceError}</p> : null}
      <Button variant={canListen() ? "secondary" : "primary"} className="btn-block" onClick={() => ask()}>
        <Sparkles size={16} /> What do I hit?
      </Button>
      {canSpeak() ? (
        <div className="between">
          <label className="check">
            <input
              type="checkbox"
              checked={speakOn}
              onChange={(e) => {
                setSpeakOn(e.target.checked);
                localStorage.setItem("apex_caddie_speak", e.target.checked ? "on" : "off");
                if (!e.target.checked) {
                  stopSpeaking();
                  setSpeaking(false);
                }
              }}
            />
            Read answers aloud
          </label>
          {speaking ? (
            <Button variant="ghost" size="sm" onClick={() => { stopSpeaking(); setSpeaking(false); }}>
              <Square size={14} /> Stop
            </Button>
          ) : result ? (
            <Button variant="ghost" size="sm" onClick={() => say(result)}>
              <Volume2 size={14} /> Again
            </Button>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="wrap">
            <span className="badge info">
              Wind, slope and heat: {u.d(result.playsLikeM)} {u.unit}
            </span>
            {wind ? <span className="badge">{wind}</span> : null}
            {cross ? <span className="badge">{cross}</span> : null}
            <span className="badge">{result.slopeM > 0 ? u.d(result.slopeM) + " " + u.unit + " uphill" : result.slopeM < 0 ? u.d(Math.abs(result.slopeM)) + " " + u.unit + " downhill" : "Flat"}</span>
            <span className="badge">{result.tempC}°C</span>
          </div>
          <div className="advice">
            {result.lines.map((l) => (
              <p key={l.label}>
                <b>{l.label}:</b> {l.text}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
