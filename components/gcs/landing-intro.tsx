"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { FOOTAGE, MISSIONS } from "@/lib/content";
import { useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";
import {
  altitudeAt,
  BLANK_MS,
  BRIEF_MS,
  CAM_FLOOR,
  CEILING,
  COMPLETE_MS,
  DESCENT_MS,
  feedFade,
  FRAME_X,
  FRAME_Y,
  frameGrow,
  handedOff,
  hudFade,
  phaseOf,
} from "@/lib/intro-profile";
import {
  alignTolerance,
  descentTaper,
  drawOrb,
  fitOrbCanvas,
  modelledMatches,
  repeatOffset,
  teachRungFor,
  type Surface,
} from "@/lib/orb-render";

type Phase = "brief" | "descent" | "blank" | "complete";

const MISSION = MISSIONS.find((m) => m.id === FOOTAGE.missionId);

/**
 * ARRIVAL — STAGE TWO
 * ----------------------------------------------------------------------------
 * The teach-and-repeat precision landing, flown by the autopilot. Nothing here
 * is coupled to scroll: altitude is a function of time, and every readout is
 * computed from it with the same functions — and the same flight constants —
 * that section 04 uses, so the numbers mean something even though the descent
 * is on rails. Timing and ramps live in lib/intro-profile.ts.
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
  const matchText = useRef<HTMLSpanElement>(null);
  const errText = useRef<HTMLSpanElement>(null);
  const rungText = useRef<HTMLSpanElement>(null);

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

  /**
   * Push the altitude-driven ramps to the DOM: the window opening up, the HUD
   * fading out, the feed dissolving. Called from the frame loop and once more
   * when the descent ends, so a backgrounded tab (where rAF is paused but
   * timers still fire) still arrives at the correct end state.
   */
  const applyRamps = useCallback((a: number) => {
    const grow = frameGrow(a);
    if (Math.abs(grow - lastGrow.current) > 0.002) {
      lastGrow.current = grow;
      const el = stage.current;
      if (el) {
        el.style.setProperty("--ix", `${(FRAME_X * (1 - grow)).toFixed(3)}%`);
        el.style.setProperty("--iy", `${(FRAME_Y * (1 - grow)).toFixed(3)}%`);
      }
    }

    /* --intro-hud lives on <html> because the skip control is owned by
       <IntroStage>, not by this stage, and fades out with these readouts. */
    const hud = hudFade(a);
    if (Math.abs(hud - lastHud.current) > 0.004) {
      lastHud.current = hud;
      document.documentElement.style.setProperty("--intro-hud", hud.toFixed(3));
    }

    const feed = feedFade(a);
    if (Math.abs(feed - lastFeed.current) > 0.004) {
      lastFeed.current = feed;
      if (canvas.current) canvas.current.style.opacity = feed.toFixed(3);
    }
  }, []);

  /* ── the sequence: one self-driving timer chain ───────────────────────── */
  useEffect(() => {
    let timer = 0;

    timer = window.setTimeout(() => {
      descentAt.current = performance.now();
      setPhase("descent");
      timer = window.setTimeout(() => {
        /* touchdown: settle the end state whether or not rAF was running */
        alt.current = 0;
        applyRamps(0);
        setPhase("blank");
        timer = window.setTimeout(() => {
          setPhase("complete");
          timer = window.setTimeout(() => done.current(), COMPLETE_MS);
        }, BLANK_MS);
      }, DESCENT_MS);
    }, BRIEF_MS);

    return () => window.clearTimeout(timer);
  }, [applyRamps]);

  /* ── size the fullscreen feed once per layout change ──────────────────── */
  useEffect(() => {
    const remeasure = () => {
      surface.current = fitOrbCanvas(canvas.current);
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

  /* ── the descent. Altitude is a function of time. ─────────────────────── */
  useTelemetry(() => {
    if (descentAt.current > 0) {
      alt.current = altitudeAt(performance.now() - descentAt.current);
    }

    const a = alt.current;
    applyRamps(a);

    if (Math.abs(a - lastDrawn.current) < 0.003) return;
    lastDrawn.current = a;

    const s = surface.current;
    if (s) {
      const shown = Math.max(a, CAM_FLOOR);
      drawOrb(s.ctx, {
        mode: "repeat",
        alt: shown,
        teachAlt: teachRungFor(shown),
        err: repeatOffset(a),
        w: s.w,
        h: s.h,
        handedOff: handedOff(a),
      });
    }
  });

  /* ── readouts at 12 Hz: computed from the altitude, not scripted ───────── */
  useTelemetryThrottled(() => {
    const a = alt.current;
    const shown = Math.max(a, CAM_FLOOR);
    const rung = teachRungFor(shown);
    const off = repeatOffset(a);
    const err = Math.hypot(off.x, off.y);
    const cold = handedOff(a);

    if (altText.current) altText.current.textContent = a.toFixed(2);
    if (phaseText.current) phaseText.current.textContent = phaseOf(a);
    if (rungText.current) rungText.current.textContent = rung.toFixed(2);
    if (matchText.current) {
      matchText.current.textContent = cold
        ? "--"
        : String(modelledMatches(rung / shown));
    }
    if (errText.current) {
      errText.current.textContent = (err * 100).toFixed(0);
      /* colour the error against the same cone the flight code applies */
      errText.current.dataset.ok = err <= alignTolerance(a) ? "true" : "false";
      errText.current.title = `descent authority ${descentTaper(err, a).toFixed(2)}`;
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

        {/* corner overlay — every number computed from altitude */}
        <div className="text-micro absolute inset-x-7 top-1 flex justify-between gap-4">
          <span className="text-data tnum">
            AGL <span ref={altText}>7.50</span> m
          </span>
          <span className="text-signal">
            <span ref={phaseText}>REPEAT</span>
          </span>
        </div>
        <div className="text-micro absolute inset-x-7 bottom-1 flex justify-between gap-4">
          <span className="text-dim tnum">
            TEACH RUNG <span ref={rungText}>7.50</span> m ·{" "}
            <span ref={matchText}>0</span> MATCHES
          </span>
          <span className="text-dim tnum">
            XY ERR{" "}
            <span
              ref={errText}
              data-ok="false"
              className="data-[ok=true]:text-nominal data-[ok=false]:text-signal"
            >
              0
            </span>{" "}
            cm
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
              TEACH MAP LOADED · NO MARKER ON THE GROUND
            </p>
            <h2
              className="gcs-boot-line font-display text-h2 text-ink mt-4"
              style={{ animationDelay: "110ms" }}
            >
              {MISSION
                ? `MISSION ${MISSION.id.slice(-2)} — ${MISSION.name}`
                : "MISSION 01 — PRECISION LANDING"}
            </h2>
            <p
              className="gcs-boot-line text-data text-dim mt-3"
              style={{ animationDelay: "220ms" }}
            >
              {MISSION?.subtitle ?? "NO MARKER, NO GPS FIX"}
            </p>
            <p
              className="gcs-boot-line text-label text-signal tracking-label mt-6"
              style={{ animationDelay: "330ms" }}
            >
              MATCHING WHAT THE CAMERA REMEMBERS · STAND BY
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
              ON GROUND · 15 cm FROM THE LAUNCH POINT · NO FIDUCIAL USED
            </p>
            <h2
              className="gcs-boot-line font-display text-h2 text-ink mt-4"
              style={{ animationDelay: "100ms" }}
            >
              LANDED ON WHAT IT REMEMBERED
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
