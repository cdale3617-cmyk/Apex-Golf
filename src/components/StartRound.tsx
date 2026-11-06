import React, { useEffect, useState } from "react";
import { actions, useData } from "../store";
import { Button, Empty, Field, Input, Select, Sheet } from "../ui";

const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

/** Start a round on one of the loaded courses. */
export function StartRound({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted?: () => void }) {
  const { courses } = useData();
  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (open) {
      setCourseId(courses[0]?.id ?? "");
      setDate(today());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Start a round">
      {courses.length === 0 ? (
        <Empty title="Load a course first" text="Find your course on the Play tab, then start a round." />
      ) : (
        <>
          <Field label="Course">
            <Select value={courseId} onChange={setCourseId} label="Course" options={courses.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button
            variant="primary"
            className="btn-block"
            onClick={() => {
              actions.startRound(courseId, date || today());
              onClose();
              onStarted?.();
            }}
          >
            Start round
          </Button>
        </>
      )}
    </Sheet>
  );
}
