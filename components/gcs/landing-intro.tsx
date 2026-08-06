"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FOOTAGE, MISSIONS } from "@/lib/content";
import { clamp } from "@/lib/derive";
import { useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";
import {
  approachOffset,
  drawSim,
  fitCanvas,
  tagConfidence,
  tagPixels,
  type Surface,
} from "@/lib/sim-render";

/* ── flight profile ──────────────────────────────────────────────────────── */

/** Metres AGL the approach starts from — the same ceiling section 04 uses. */
const CEILING = 12;
/**
 * Height of the payload camera above the pad at touchdown. The lens cannot get
 * closer than the landing gear allows, so the projection stops closing here
 * instead of diving inside a single tag cell. Real pipelines lose the tag at
 * about this point for exactly this reason.
 */
const CAM_FLOOR = 0.45;

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

/** Same gates section 04 uses, so the phase names mean the same thing. */
function phaseOf(alt: number): string {
  if (alt > 6) return "TRANSIT";
  if (alt > 2) return "APPROACH";
  if (alt > 0.3) return "FLARE";
  return "TOUCHDOWN";
}

/** 0..1 with eased ends — used for every ramp below. */
function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

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
  const altText = useRef<HTMLSpanElement>(null);
  const phaseText = useRef<HTMLSpanElement>(null);
  const confText = useRef<HTMLSpanElement>(null);
  const errText = useRef<HTMLSpanElement>(null);

  /* flight state lives outside React: it changes every frame */
  const alt = useRef(CEILING);
  const surface = useRef<Surface | null>(null);
  const lastDrawn = useRef(-1);
  /** performance.now() at brake release. 0 until the descent starts. */
  const descentAt = useRef(0);
  /* last written ramp values, so we only touch style when something moved */
  const lastGrow = useRef(-1);
  const lastHud = useRef(-1);
  const lastFeed = useRef(-1);

  /* ── the sequence: one self-driving timer chain ───────────────────────── */
  useEffect(() => {
    let timer = 0;

    timer = window.setTimeout(() => {
      descentAt.current = performance.now();
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

  /* ── the descent. Altitude is a function of time, flared into the ground ─ */
  useTelemetry(() => {
    if (descentAt.current > 0) {
      const p = clamp((performance.now() - descentAt.current) / DESCENT_MS, 0, 1);
      /* (1-p)^1.8 falls fast and slows into the flare — the shape of an
         autoland profile, not a linear slider. */
      alt.current = CEILING * Math.pow(1 - p, 1.8);
    }

    const a = alt.current;

    /* The window the feed shows through opens up as the aircraft comes down,
       so the tag grows from both the projection and the frame. By touchdown it
       has taken the whole screen. */
    const grow = smoothstep((9 - a) / (9 - 1.2));
    if (Math.abs(grow - lastGrow.current) > 0.002) {
      lastGrow.current = grow;
      const el = stage.current;
      if (el) {
        el.style.setProperty("--ix", `${(FRAME_X * (1 - grow)).toFixed(3)}%`);
        el.style.setProperty("--iy", `${(FRAME_Y * (1 - grow)).toFixed(3)}%`);
      }
    }

    /* Readouts, brackets and the skip chip all fade out through the flare, so
       touchdown arrives on a bare screen. --intro-hud lives on <html> because
       the skip control is owned by <IntroStage>, not by this stage. */
    const hud = 1 - smoothstep((2.4 - a) / (2.4 - 0.9));
    if (Math.abs(hud - lastHud.current) > 0.004) {
      lastHud.current = hud;
      document.documentElement.style.setProperty("--intro-hud", hud.toFixed(3));
    }

    /* Then the feed itself dissolves into the deck colour. */
    const feed = 1 - smoothstep((0.5 - a) / (0.5 - 0.05));
    if (Math.abs(feed - lastFeed.current) > 0.004) {
      lastFeed.current = feed;
      if (canvas.current) canvas.current.style.opacity = feed.toFixed(3);
    }

    if (Math.abs(a - lastDrawn.current) < 0.004) return;
    lastDrawn.current = a;

    const s = surface.current;
    if (s) {
      drawSim(s.ctx, {
        mode: "rgb",
        alt: Math.max(a, CAM_FLOOR),
        w: s.w,
        h: s.h,
      });
    }
  });

  /* ── readouts at 12 Hz: computed from the altitude, not scripted ───────── */
  useTelemetryThrottled(() => {
    const a = alt.current;
    const shown = Math.max(a, CAM_FLOOR);
    const focal = (surface.current?.w ?? 640) * 0.85;
    const conf = tagConfidence(shown, tagPixels(shown, focal));
    const off = approachOffset(a);

    if (altText.current) altText.current.textContent = a.toFixed(2);
    if (phaseText.current) phaseText.current.textContent = phaseOf(a);
    if (confText.current) {
      confText.current.textContent = conf > 0 ? conf.toFixed(2) : "--";
    }
    if (errText.current) {
      errText.current.textContent = Math.hypot(off.x, off.y).toFixed(2);
    }
  }, 12);

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

        {/* minimal corner overlay — four numbers, all computed from altitude */}
        <div className="text-micro absolute inset-x-7 top-1 flex justify-between">
          <span className="text-data tnum">
            ALT <span ref={altText}>12.00</span> m
          </span>
          <span className="text-signal">
            <span ref={phaseText}>TRANSIT</span>
          </span>
        </div>
        <div className="text-micro absolute inset-x-7 bottom-1 flex justify-between">
          <span className="text-dim tnum">
            TAG CONF <span ref={confText}>--</span>
          </span>
          <span className="text-dim tnum">
            LAT ERR <span ref={errText}>0.00</span> m
          </span>
        </div>
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
      {phase === "complete" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="gcs-charge w-full max-w-2xl text-center">
            <p
              className="gcs-boot-line text-micro text-nominal tnum"
              style={{ animationDelay: "0ms" }}
            >
              TOUCHDOWN CONFIRMED · 0.00 m AGL · LAT ERR 0.00 m
            </p>
            <h2
              className="gcs-boot-line font-display text-h2 text-ink mt-4"
              style={{ animationDelay: "100ms" }}
            >
              MISSION COMPLETE
            </h2>
            <p
              className="gcs-boot-line text-label text-signal tracking-label mt-4"
              style={{ animationDelay: "200ms" }}
            >
              UNSEALING PILOT LOGS · BRINGING THE DECK UP
              <span className="gcs-caret">_</span>
            </p>
            <div className="bg-rule mx-auto mt-5 h-px w-56 max-w-full">
              <div className="gcs-charge-bar bg-signal h-px w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
