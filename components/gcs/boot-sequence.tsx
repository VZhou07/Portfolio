"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MISSIONS, PROFILE, SKILL_GROUPS, WAYPOINTS } from "@/lib/content";

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
const STEP_MS = 95;
const HOLD_MS = 320;
const FADE_MS = 240;

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

/**
 * Power-on self test — stage one of the arrival sequence. Hidden from assistive
 * tech (it is chrome, not content). Whether it runs at all is decided by
 * <IntroStage>, which also owns the single skip handler.
 */
export function BootSequence({ onDone }: { onDone: () => void }) {
  const plan = useMemo(() => probe(), []);
  const [revealed, setRevealed] = useState<Revealed[]>([]);
  const [closing, setClosing] = useState(false);

  /* Keep the latest callback without restarting the sequence. */
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  /* One self-driving timer chain: reveal a line per tick, stamping the true
     elapsed time of each, then hold and hand over. */
  useEffect(() => {
    const started = performance.now();
    let i = 0;
    let timer = 0;

    const step = () => {
      if (i < plan.length) {
        const at = (performance.now() - started) / 1000;
        const line = plan[i];
        i += 1;
        setRevealed((prev) => [...prev, { ...line, at }]);
        timer = window.setTimeout(step, STEP_MS);
        return;
      }
      timer = window.setTimeout(() => {
        setClosing(true);
        timer = window.setTimeout(() => done.current(), FADE_MS);
      }, HOLD_MS);
    };

    timer = window.setTimeout(step, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [plan]);

  const complete = revealed.length >= plan.length;

  return (
    <div
      aria-hidden="true"
      className={`bg-void absolute inset-0 flex items-center justify-center px-5 transition-opacity duration-200 ${
        closing ? "opacity-0" : "opacity-100"
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
