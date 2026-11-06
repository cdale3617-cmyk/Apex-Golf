import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "icon"; loading?: boolean };
export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} className={cx("btn", "btn-" + variant, size !== "md" && "btn-" + size, className)}>
      {loading ? <span className="spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx("input", className)} />;
});

export function Select({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; label?: string; className?: string }) {
  return (
    <select className={cx("input", className)} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("panel", className)}>
      {title ? <h3 className="eyebrow">{title}</h3> : null}
      {children}
    </section>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}

let push: ((m: string) => void) | null = null;
export const toast = (m: string) => push?.(m);
export function Toaster() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let t = 0;
    push = (m) => {
      setMsg(m);
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(""), 2600);
    };
    return () => {
      push = null;
    };
  }, []);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}
