"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FOOTAGE, MISSIONS } from "@/lib/content";
import { useTelemetry } from "@/lib/flight-computer";
import { drawSim, fitCanvas, type Surface } from "@/lib/sim-render";

/* ── flight profile ──────────────────────────────────────────────────────── */

/** Metres AGL the approach starts from — the same ceiling section 04 uses. */
const CEILING = 12;

/* ── pacing (ms) — the whole cold-open is budgeted at 7.5 s with the POST ── */
const BRIEF_MS = 1150;
const DESCENT_MS = 3300;
const BLANK_MS = 400;
const COMPLETE_MS = 1250;

/** The window the feed opens in before it grows to fill the screen. */
const FRAME_X = 11; /* % inset left/right */
const FRAME_Y = 23; /* % inset top/bottom */

type Phase = "brief" | "descent" | "blank" | "complete";

const MISSION = MISSIONS.find((m) => m.id === FOOTAGE.missionId);

/**
 * ARRIVAL — STAGE TWO
 * ----------------------------------------------------------------------------
 * The precision landing, flown by the autopilot. Nothing here is coupled to
 * scroll: altitude is a function of time, and every readout is computed from it
 * with the same functions section 04 uses, so the numbers are real even though
 * the descent is on rails.
 */
export function LandingIntro({ onDone }: { onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const [phase, setPhase] = useState<Phase>("brief");

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  /* flight state lives outside React: it changes every frame */
  const alt = useRef(CEILING);
  const surface = useRef<Surface | null>(null);
  const lastDrawn = useRef(-1);

  /* ── the sequence: one self-driving timer chain ───────────────────────── */
  useEffect(() => {
    let timer = 0;

    timer = window.setTimeout(() => {
      setPhase("descent");
      timer = window.setTimeout(() => {
        setPhase("blank");
        timer = window.setTimeout(() => {
          setPhase("complete");
          timer = window.setTimeout(() => done.current(), COMPLETE_MS);
        }, BLANK_MS);
      }, DESCENT_MS);
    }, BRIEF_MS);

    return () => window.clearTimeout(timer);
  }, []);

  /* ── size the fullscreen feed once per layout change ──────────────────── */
  useEffect(() => {
    const remeasure = () => {
      surface.current = fitCanvas(canvas.current);
      lastDrawn.current = -1;
    };
    remeasure();
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
    };
  }, []);

  /* ── draw the payload camera, redrawing only when the altitude moves ──── */
  useTelemetry(() => {
    const a = alt.current;
    if (Math.abs(a - lastDrawn.current) < 0.004) return;
    lastDrawn.current = a;

    const s = surface.current;
    if (s) drawSim(s.ctx, { mode: "rgb", alt: a, w: s.w, h: s.h });
  });

  const framed: CSSProperties = {
    ["--ix" as string]: `${FRAME_X}%`,
    ["--iy" as string]: `${FRAME_Y}%`,
  };

  return (
    <div
      ref={stage}
      aria-hidden="true"
      style={framed}
      className="bg-void absolute inset-0 overflow-hidden"
    >
      <div className="gcs-grid pointer-events-none absolute inset-0 opacity-25" />

      {/* payload feed. The canvas is always fullscreen; the window it shows
          through is a clip that opens up as the aircraft descends. */}
      <canvas
        ref={canvas}
        className="absolute inset-0 block h-full w-full"
        style={{ clipPath: "inset(var(--iy) var(--ix))" }}
      />

      {/* window chrome, tracking the same clip */}
      <div
        className="pointer-events-none absolute"
        style={{ inset: "var(--iy) var(--ix)", opacity: "var(--intro-hud, 1)" }}
      >
        <span className="border-signal/70 absolute top-0 left-0 h-5 w-5 border-t border-l" />
        <span className="border-signal/70 absolute top-0 right-0 h-5 w-5 border-t border-r" />
        <span className="border-signal/70 absolute bottom-0 left-0 h-5 w-5 border-b border-l" />
        <span className="border-signal/70 absolute right-0 bottom-0 h-5 w-5 border-b border-r" />
        <span className="bg-signal/60 absolute top-1/2 left-1/2 h-px w-7 -translate-x-1/2" />
        <span className="bg-signal/60 absolute top-1/2 left-1/2 h-7 w-px -translate-y-1/2" />
      </div>

      {/* brief scrim — the feed is already live behind the card */}
      <div
        className={`bg-void pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          phase === "brief" ? "opacity-70" : "opacity-0"
        }`}
      />

      {phase === "brief" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="w-full max-w-2xl text-center">
            <p
              className="gcs-boot-line text-micro text-nominal"
              style={{ animationDelay: "0ms" }}
            >
              SELF TEST COMPLETE · ALL SYSTEMS NOMINAL
            </p>
            <h2
              className="gcs-boot-line font-display text-h2 text-ink mt-4"
              style={{ animationDelay: "110ms" }}
            >
              {MISSION ? `MISSION ${MISSION.id.slice(-2)} — ${MISSION.name}` : "MISSION 02"}
            </h2>
            <p
              className="gcs-boot-line text-data text-dim mt-3"
              style={{ animationDelay: "220ms" }}
            >
              {MISSION?.subtitle ?? "OPTIMAL-TARGET TOUCHDOWN"}
            </p>
            <p
              className="gcs-boot-line text-label text-signal tracking-label mt-6"
              style={{ animationDelay: "330ms" }}
            >
              AUTONOMY IN COMMAND · STAND BY
              <span className="gcs-caret">_</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
