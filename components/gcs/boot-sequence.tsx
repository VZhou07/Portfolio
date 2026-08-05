"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MISSIONS, PROFILE, SKILL_GROUPS, WAYPOINTS } from "@/lib/content";
import { useFlight } from "@/lib/flight-computer";

interface BootLine {
  tag: string;
  label: string;
  value: string;
  tone?: "ok" | "info";
}

interface Revealed extends BootLine {
  /** Real elapsed seconds since power-on, measured not scripted. */
  at: number;
}

const CHANNELS = SKILL_GROUPS.reduce((n, g) => n + g.skills.length, 0);
const STEP_MS = 105;

/* Hydration-safe "am I on the client" without setState in an effect. */
const NEVER = () => () => {};
const onClient = () => true;
const onServer = () => false;

/* Every value below is read off the actual device. */
function probe(): BootLine[] {
  const dpr = Math.round(window.devicePixelRatio * 100) / 100;
  const pointer = window.matchMedia("(pointer: fine)").matches
    ? "FINE / MOUSE"
    : "COARSE / TOUCH";
  const conn = (
    navigator as Navigator & { connection?: { effectiveType?: string } }
  ).connection;
  const lat = `${Math.abs(PROFILE.homeLat).toFixed(4)}${PROFILE.homeLat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(PROFILE.homeLon).toFixed(4)}${PROFILE.homeLon >= 0 ? "E" : "W"}`;

  return [
    { tag: "PWR", label: "FLIGHT COMPUTER", value: "OK" },
    {
      tag: "DSP",
      label: "VIEWPORT",
      value: `${window.innerWidth}x${window.innerHeight} @${dpr}X`,
      tone: "info",
    },
    { tag: "HID", label: "POINTER CLASS", value: pointer, tone: "info" },
    {
      tag: "NAV",
      label: "EKF3 ORIGIN SET",
      value: `${lat} ${lon}`,
      tone: "info",
    },
    {
      tag: "LNK",
      label: "DOWNLINK",
      value: conn?.effectiveType?.toUpperCase() ?? "DIRECT",
      tone: "info",
    },
    { tag: "MSN", label: "MISSION FILE", value: `${MISSIONS.length} SORTIES` },
    { tag: "RTE", label: "WAYPOINT ROUTE", value: `${WAYPOINTS.length} LEGS` },
    { tag: "INS", label: "INSTRUMENT PANEL", value: `${CHANNELS} CHANNELS` },
    { tag: "SYS", label: "AUTONOMY STACK", value: "ARMED" },
  ];
}

function shouldSkip(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  try {
    return sessionStorage.getItem("gcs.booted") === "1";
  } catch {
    return false;
  }
}

/**
 * Power-on self test. Hidden from assistive tech (it is chrome, not content) and
 * dismissed by any key, click, tap or scroll. Skipped entirely for
 * reduced-motion users and on repeat visits in the same session.
 */
export function BootSequence() {
  const { markBooted } = useFlight();
  const mounted = useSyncExternalStore(NEVER, onClient, onServer);

  const plan = useMemo<BootLine[] | null>(() => {
    if (!mounted || shouldSkip()) return null;
    return probe();
  }, [mounted]);

  const [revealed, setRevealed] = useState<Revealed[]>([]);
  const [closing, setClosing] = useState(false);
  const started = useRef(0);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    try {
      sessionStorage.setItem("gcs.booted", "1");
    } catch {
      /* private mode: the sequence simply replays next visit */
    }
    setClosing(true);
    window.setTimeout(markBooted, 360);
  }, [markBooted]);

  /* Nothing to play (reduced motion / repeat visit): hand control over at once. */
  useEffect(() => {
    if (mounted && plan === null && !done.current) {
      done.current = true;
      markBooted();
    }
  }, [mounted, plan, markBooted]);

  /* Reveal one line per tick, stamping the true elapsed time of each. */
  useEffect(() => {
    if (!plan || done.current) return;

    if (revealed.length >= plan.length) {
      const hold = window.setTimeout(finish, 420);
      return () => window.clearTimeout(hold);
    }

    if (started.current === 0) started.current = performance.now();

    const step = window.setTimeout(() => {
      const at = (performance.now() - started.current) / 1000;
      setRevealed((prev) =>
        prev.length >= plan.length ? prev : [...prev, { ...plan[prev.length], at }],
      );
    }, STEP_MS);

    return () => window.clearTimeout(step);
  }, [plan, revealed.length, finish]);

  /* Any interaction skips ahead. */
  useEffect(() => {
    if (!plan) return;
    const skip = () => finish();
    const opts = { once: true, passive: true } as const;
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, opts);
    window.addEventListener("wheel", skip, opts);
    window.addEventListener("touchstart", skip, opts);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
    };
  }, [plan, finish]);

  if (!plan) return null;

  const complete = revealed.length >= plan.length;

  return (
    <div
      aria-hidden="true"
      onClick={finish}
      className={`bg-void fixed inset-0 z-90 flex items-center justify-center px-5 transition-opacity duration-300 ${
        closing ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="gcs-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative w-full max-w-xl">
        <div className="text-micro mb-4 flex items-baseline justify-between">
          <span className="text-signal">POWER-ON SELF TEST</span>
          <span className="text-dim">{PROFILE.callsign}</span>
        </div>

        <ol className="text-data space-y-1.5">
          {revealed.map((line) => (
            <li
              key={line.tag}
              className="gcs-boot-line flex items-baseline gap-2 sm:gap-3"
            >
              <span className="text-dim tnum hidden shrink-0 sm:inline">
                [{line.at.toFixed(3)}]
              </span>
              <span className="text-signal shrink-0">{line.tag}</span>
              <span className="text-mid shrink-0">{line.label}</span>
              <span
                aria-hidden="true"
                className="border-rule-hi min-w-4 flex-1 translate-y-[-3px] border-b border-dotted"
              />
              <span
                className={`tnum shrink-0 ${line.tone === "info" ? "text-data" : "text-nominal"}`}
              >
                {line.value}
              </span>
            </li>
          ))}
        </ol>

        <div className="text-micro mt-6 flex items-center justify-between">
          <span className="text-ink">
            {complete ? "READY" : `SELF TEST ${revealed.length}/${plan.length}`}
            <span className="gcs-caret text-signal">_</span>
          </span>
          <span className="text-dim">PRESS ANY KEY TO SKIP</span>
        </div>

        <div className="bg-rule mt-3 h-px w-full">
          <div
            className="bg-signal h-px origin-left transition-transform duration-100 ease-linear"
            style={{ transform: `scaleX(${revealed.length / plan.length})` }}
          />
        </div>
      </div>
    </div>
  );
}
