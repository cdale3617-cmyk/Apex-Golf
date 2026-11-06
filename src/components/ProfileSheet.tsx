import React, { useEffect, useState } from "react";
import { actions, useData } from "../store";
import { Button, Field, Input, Select, Sheet, toast } from "../ui";

const MISSES = ["Mostly right", "Mostly left", "Mostly straight", "It varies"];

/** Who the caddie is talking to: handicap, hand and usual miss. */
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useData();
  const [name, setName] = useState("");
  const [hcp, setHcp] = useState("");
  const [hand, setHand] = useState("Right");
  const [miss, setMiss] = useState("It varies");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? "");
    setHcp(profile?.handicap === null || profile?.handicap === undefined ? "" : String(profile.handicap));
    setHand(profile?.handedness ?? "Right");
    setMiss(profile?.typicalMiss || "It varies");
    setNotes(profile?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    actions.saveProfile({ name: name.trim(), handicap: hcp.trim() === "" ? null : Number(hcp), handedness: hand === "Left" ? "Left" : "Right", typicalMiss: miss, notes: notes.trim() });
    toast("Saved. Your caddie knows your game.");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Your game">
      <p className="muted">The caddie uses this when it picks a club and a line.</p>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="cols2">
        <Field label="Handicap">
          <Input type="number" inputMode="decimal" value={hcp} onChange={(e) => setHcp(e.target.value)} placeholder="18" />
        </Field>
        <Field label="Plays">
          <Select value={hand} onChange={setHand} options={[{ value: "Right", label: "Right-handed" }, { value: "Left", label: "Left-handed" }]} />
        </Field>
      </div>
      <Field label="Usual miss">
        <Select value={miss} onChange={setMiss} options={MISSES} />
      </Field>
      <Field label="Notes for the caddie">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Struggle with long irons, strong in wind…" />
      </Field>
      <Button variant="primary" className="btn-block" onClick={save}>
        Save
      </Button>
    </Sheet>
  );
}
