import React, { useEffect, useRef, useState } from "react";
import { Compass as CompassIcon } from "lucide-react";
import { COMPASS, dirName } from "../geo";
import type { Hole } from "../store";
import { Button } from "../ui";

type Status = "off" | "starting" | "on" | "none" | "denied";
type Perm = { requestPermission?: () => Promise<string> };
type OrientEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

// Which way the back of the phone points, from the phone's own sensors. Works flat or held upright.
function headingFrom(alpha: number, beta: number, gamma: number) {
  const r = Math.PI / 180;
  const cZ = Math.cos(alpha * r), sZ = Math.sin(alpha * r);
  const sX = Math.sin(beta * r);
  const cY = Math.cos(gamma * r), sY = Math.sin(gamma * r);
  const upright = Math.abs(beta) > 50;
  const vx = upright ? -cZ * sY - sZ * sX * cY : -sZ;
  const vy = upright ? -sZ * sY + cZ * sX * cY : cZ;
  return (Math.atan2(vx, vy) / r + 360) % 360;
}

export function Compass({ hole }: { hole: Hole }) {
  const [status, setStatus] = useState<Status>("off");
  const [heading, setHeading] = useState<number | null>(null);
  const cur = useRef<number | null>(null);
  const got = useRef(false);
  const stop = useRef<(() => void) | null>(null);

  const bearing = typeof hole.bearing === "number" ? hole.bearing : null;
  const idx = COMPASS.indexOf(hole.windDir);
  const windFrom = idx >= 0 && hole.windKmh > 0 ? idx * 45 : null;

  const begin = () => {
    got.current = false;
    cur.current = null;
    const absolute = "ondeviceorientationabsolute" in window;
    const type = absolute ? "deviceorientationabsolute" : "deviceorientation";
    const onEvent = (ev: Event) => {
      const e = ev as OrientEvent;
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
      else if ((absolute || e.absolute) && e.alpha !== null && e.beta !== null && e.gamma !== null) h = headingFrom(e.alpha, e.beta, e.gamma);
      if (h === null || Number.isNaN(h)) return;
      got.current = true;
      // Smooth the needle, taking the short way round 0/360.
      const prev = cur.current;
      const next = prev === null ? h : (prev + (((h - prev + 540) % 360) - 180) * 0.25 + 360) % 360;
      cur.current = next;
      setHeading(Math.round(next));
      setStatus("on");
    };
    window.addEventListener(type, onEvent, true);
    const timer = window.setTimeout(() => {
      if (!got.current) setStatus("none");
    }, 2000);
    stop.current = () => {
      window.removeEventListener(type, onEvent, true);
      window.clearTimeout(timer);
    };
    localStorage.setItem("apex_compass", "on");
  };

  const turnOn = async () => {
    setStatus("starting");
    const D = (window as unknown as { DeviceOrientationEvent?: Perm }).DeviceOrientationEvent;
    if (!D) {
      setStatus("none");
      return;
    }
    if (typeof D.requestPermission === "function") {
      try {
        if ((await D.requestPermission()) !== "granted") {
          setStatus("denied");
          return;
        }
      } catch {
        setStatus("denied");
        return;
      }
    }
    stop.current?.();
    begin();
  };

  const turnOff = () => {
    stop.current?.();
    stop.current = null;
    setHeading(null);
    setStatus("off");
    localStorage.removeItem("apex_compass");
  };

  useEffect(() => {
    const D = (window as unknown as { DeviceOrientationEvent?: Perm }).DeviceOrientationEvent;
    if (localStorage.getItem("apex_compass") === "on" && D && typeof D.requestPermission !== "function") void turnOn();
    return () => stop.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = status === "on" && heading !== null;
  const turn = live ? -(heading as number) : 0;
  const diff = live && bearing !== null ? ((bearing - (heading as number) + 540) % 360) - 180 : null;
  const guide = diff === null ? null : Math.abs(diff) <= 8 ? "On line. Aim here." : "Turn " + (diff > 0 ? "right " : "left ") + Math.abs(Math.round(diff)) + "°";

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="between">
        <h3 className="eyebrow">Compass</h3>
        {live ? <b style={{ fontSize: "0.78rem" }}>{heading}° {dirName(heading as number)}</b> : null}
      </div>
      <div style={{ width: "100%", maxWidth: 144, margin: "0 auto", aspectRatio: "1" }}>
        <svg viewBox="-60 -60 120 120" style={{ width: "100%", height: "100%" }} role="img" aria-label="Compass showing the hole line and the wind">
          <polygon points="0,-58 -4,-51 4,-51" className="rose-fix" />
          <g style={{ transform: "rotate(" + turn + "deg)", transition: "transform 0.15s linear" }}>
            <circle r="46" className="rose-bg" />
            {Array.from({ length: 24 }).map((_, i) => (
              <line key={i} x1="0" y1="-46" x2="0" y2={i % 6 === 0 ? -40 : -43} className="rose-tick" strokeWidth={i % 6 === 0 ? 1.5 : 1} transform={"rotate(" + i * 15 + ")"} />
            ))}
            {(["N", "E", "S", "W"] as const).map((l, i) => (
              <text key={l} x="0" y="-31" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" className={l === "N" ? "rose-n" : "rose-l"} transform={"rotate(" + i * 90 + ")"}>
                {l}
              </text>
            ))}
            {bearing !== null ? (
              <g transform={"rotate(" + bearing + ")"}>
                <line x1="0" y1="8" x2="0" y2="-26" className="rose-gold" strokeWidth="3" strokeLinecap="round" />
                <polygon points="0,-30 -6,-20 6,-20" className="rose-gold" />
              </g>
            ) : null}
            {windFrom !== null ? (
              <g transform={"rotate(" + (windFrom + 180) + ")"}>
                <line x1="0" y1="-14" x2="0" y2="16" className="rose-wind" strokeWidth="2" strokeDasharray="3 2" />
                <polygon points="0,22 -4,13 4,13" className="rose-wind" />
              </g>
            ) : null}
            <circle r="2.5" className="rose-fix" />
          </g>
        </svg>
      </div>
      <div className="muted" style={{ fontSize: "0.78rem", lineHeight: 1.3 }}>
        {bearing !== null ? (
          <p>
            <b style={{ color: "var(--goldink)" }}>Gold</b> = the hole, {Math.round(bearing)}° {dirName(bearing)}
          </p>
        ) : (
          <p>Hole direction not known. Load the course from the map to add it, or set it with Edit.</p>
        )}
        {windFrom !== null ? (
          <p>
            <b style={{ color: "var(--info)" }}>Blue</b> = wind {hole.windKmh} km/h from {hole.windDir}
          </p>
        ) : (
          <p>No wind right now.</p>
        )}
        {guide ? <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--ink)" }}>{guide}</p> : null}
      </div>
      {status === "off" || status === "starting" ? (
        <Button size="sm" className="btn-block" onClick={() => void turnOn()} loading={status === "starting"}>
          <CompassIcon size={16} /> Point with my phone
        </Button>
      ) : status === "on" ? (
        <Button variant="ghost" size="sm" className="btn-block" onClick={turnOff}>
          Turn off
        </Button>
      ) : (
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          {status === "denied" ? "Compass access was refused. Allow motion sensors in the phone settings." : "This phone has no compass sensor, so the dial stays north-up."}
        </p>
      )}
    </div>
  );
}
