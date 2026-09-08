"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Frame, LinkChip, MicroLabel } from "@/components/gcs/primitives";
import { Section } from "@/components/gcs/section";
import { useOnScreen } from "@/components/gcs/reveal";
import { APRILTAG_FOOTAGE, MISSIONS, sectionOf, sectionSlot } from "@/lib/content";
import { clamp } from "@/lib/derive";
import { useFlight, useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";
import { DESCENT_MS } from "@/lib/intro-profile";
import {
  drawSim,
  drawTrace,
  fitCanvas,
  tagConfidence,
  tagPixels,
  windOffset,
  type SimMode,
  type Surface,
} from "@/lib/sim-render";

const DEF = sectionOf("baseline");
/** Scroll slot this section occupies — scroll only flies the descent here. */
const SLOT = sectionSlot("baseline");
/** The AprilTag baseline owns this section's footage. */
const FOOTAGE = APRILTAG_FOOTAGE;
const CEILING = 12; /* metres AGL at the start of the approach */
const FADE_START = 1.9; /* handover begins */
const FADE_END = 0.25; /* real footage fully up */
/** Crosswind the injector can dial in, m/s. */
const WIND_MAX = 6;
/** Lateral error the ALIGNED gate accepts, metres. */
const ALIGN_GATE = 0.2;
/** Most recent detector events kept on screen. */
const LOG_DEPTH = 6;

type Phase = "TRANSIT" | "APPROACH" | "FLARE" | "TOUCHDOWN" | "HOVER";
type Downlink = "PROBING" | "READY" | "MISSING";

const TILES: { mode: SimMode; code: string; label: string }[] = [
  { mode: "depth", code: "D", label: "DEPTH" },
  { mode: "mask", code: "M", label: "PAD MASK" },
  { mode: "features", code: "F", label: "FEATURE FLOW" },
];

const CHECKS = [
  { id: "acq", label: "TARGET ACQUIRED" },
  { id: "algn", label: "LATERAL ALIGNED" },
  { id: "flare", label: "FLARE ARMED" },
  { id: "down", label: "TOUCHDOWN" },
] as const;

function phaseOf(alt: number, occluded: boolean): Phase {
  if (occluded) return "HOVER";
  if (alt > 6) return "TRANSIT";
  if (alt > 2) return "APPROACH";
  if (alt > 0.3) return "FLARE";
  return "TOUCHDOWN";
}

/** 0 at FADE_START, 1 at FADE_END, smoothed. */
function handover(alt: number): number {
  const t = clamp((FADE_START - alt) / (FADE_START - FADE_END), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * TAG BASELINE — the fiducial run, made interactive
 * This is the descent that came first. With an AprilTag in the frame the target
 * estimate is effectively ground truth, so anything the aircraft still did wrong
 * belonged to the controller — which is the whole reason for flying it before the
 * marker came out of the picture (section 04).
 *
 * Here you get what a flight test does not give you: the descent lever, a
 * crosswind you can inject, an occluder you can put across the lens, and the
 * detector's event log reacting to both. The occluder holds hover with no
 * target in sight and degrades feature flow. The bay is driven by one altitude
 * value, and as it passes ~1.9 m the simulated payload feed hands over to the
 * real flight-test clip.
 */
export function TagBaseline() {
  const { reducedMotion } = useFlight();

  const bay = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(bay, "220px");

  const main = useRef<HTMLCanvasElement>(null);
  const tiles = useRef<(HTMLCanvasElement | null)[]>([]);
  const trace = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef<HTMLDivElement>(null);
  const simLayer = useRef<HTMLDivElement>(null);
  const glitch = useRef<HTMLDivElement>(null);
  const lever = useRef<HTMLInputElement>(null);
  const altText = useRef<HTMLSpanElement>(null);
  const vsText = useRef<HTMLSpanElement>(null);
  const confText = useRef<HTMLSpanElement>(null);
  const errText = useRef<HTMLSpanElement>(null);
  const tcText = useRef<HTMLSpanElement>(null);
  const tapeFill = useRef<HTMLDivElement>(null);
  const checkRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const logList = useRef<HTMLUListElement>(null);

  /* flight state kept out of React: it changes every frame */
  const alt = useRef(CEILING);
  const lastDrawn = useRef(-1);
  const history = useRef<number[]>([]);
  const nextSample = useRef(0);
  const auto = useRef<"OFF" | "LAND" | "ABORT">("OFF");
  const glitched = useRef(false);
  /** Frames drawn — the detector log stamps events with it. */
  const frameNo = useRef(0);
  /* last known gate states, so the log only records real transitions */
  const wasAcquired = useRef(false);
  const wasAligned = useRef(false);
  const wasDown = useRef(false);
  /* cached drawing surfaces, refreshed on resize / visibility, not per frame */
  const surfaces = useRef<{
    big: Surface | null;
    tiles: (Surface | null)[];
    trace: Surface | null;
  }>({ big: null, tiles: [], trace: null });

  const [manual, setManual] = useState(false);
  const [phase, setPhase] = useState<Phase>("TRANSIT");
  const [downlink, setDownlink] = useState<Downlink>("PROBING");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [crop, setCrop] = useState(false);
  /** Injected crosswind in m/s. Positive is from the left. */
  const [wind, setWind] = useState(0);
  /** Something across the lens: hold hover, drop the tag, degrade feature flow. */
  const [occluded, setOccluded] = useState(false);
  const occludedRef = useRef(false);
  /** Flash when AUTO LAND is rejected because the lens is occluded. */
  const [landDeny, setLandDeny] = useState<string | null>(null);
  const landDenyTimer = useRef<number | null>(null);

  const mission = MISSIONS.find((m) => m.id === FOOTAGE.missionId);

  /**
   * Append a detector event. Written straight to the DOM rather than held in
   * state: these fire from the frame loop, and a re-render per event would
   * defeat the point of the loop.
   */
  const emit = useCallback(
    (code: string, text: string, tone: "ok" | "warn" | "info") => {
      const ul = logList.current;
      if (!ul) return;

      const li = document.createElement("li");
      li.className = "gcs-boot-line flex items-baseline gap-2 sm:gap-3";

      const stamp = document.createElement("span");
      stamp.className = "text-dim tnum shrink-0";
      stamp.textContent = `F${frameNo.current.toString().padStart(5, "0")}`;

      const tag = document.createElement("span");
      tag.className =
        tone === "ok"
          ? "text-nominal shrink-0"
          : tone === "warn"
            ? "text-fault shrink-0"
            : "text-data shrink-0";
      tag.textContent = code;

      const body = document.createElement("span");
      body.className = "text-mid";
      body.textContent = text;

      li.append(stamp, tag, body);
      ul.prepend(li);
      while (ul.childElementCount > LOG_DEPTH) ul.lastElementChild?.remove();
    },
    [],
  );

  /* ── the descent + every viewport, from one frame callback ─────────────── */
  useTelemetry((t) => {
    const blocked = occludedRef.current;

    /* 1. advance altitude — occluded holds hover (no further descent).
       ABORT still climbs clear so you can get out of a bad approach. */
    if (auto.current === "ABORT") {
      alt.current = Math.min(CEILING, alt.current + 3.4 * t.dt);
      if (alt.current === CEILING) auto.current = "OFF";
    } else if (blocked) {
      if (auto.current === "LAND") auto.current = "OFF";
    } else if (auto.current === "LAND") {
      const rate = alt.current > 2 ? 2.3 : 0.7; /* flare slows the descent */
      alt.current = Math.max(0, alt.current - rate * t.dt);
      if (alt.current === 0) auto.current = "OFF";
    } else if (!manual && t.sectionIndex === SLOT) {
      /* scroll flies it: 0.12..0.9 of the section maps to ceiling..ground */
      const p = clamp((t.sectionProgress - 0.12) / 0.78, 0, 1);
      alt.current = CEILING * (1 - p);
    }

    const a = alt.current;
    const nextPhase = phaseOf(a, blocked);
    if (nextPhase !== phase) setPhase(nextPhase);

    /* 2. handover crossfade — both layers share the same HUD overlay */
    const fade = handover(a);
    if (simLayer.current) simLayer.current.style.opacity = (1 - fade).toFixed(3);
    if (live.current) live.current.style.opacity = fade.toFixed(3);

    if (fade > 0.45 && !glitched.current) {
      glitched.current = true;
      glitch.current?.classList.add("gcs-handover");
      window.setTimeout(() => glitch.current?.classList.remove("gcs-handover"), 700);
    } else if (fade < 0.05) {
      glitched.current = false;
    }

    /* 3. real footage playback follows the descent */
    const v = video.current;
    if (v && downlink === "READY" && !reducedMotion) {
      if (fade > 0.1 && v.paused) {
        void v.play().catch(() => undefined);
      } else if (fade === 0 && !v.paused) {
        v.pause();
      }
    }

    /* 4. altitude tape + lever mirror the flight when scroll is flying it */
    if (tapeFill.current) {
      tapeFill.current.style.transform = `scaleY(${(a / CEILING).toFixed(4)})`;
    }
    if (!manual && lever.current && document.activeElement !== lever.current) {
      lever.current.value = (a * 10).toFixed(0);
    }

    if (!onScreen) return;

    /* 5. sample the trace at 20 Hz */
    if (t.elapsed > nextSample.current) {
      nextSample.current = t.elapsed + 0.05;
      history.current.push(a);
      if (history.current.length > 170) history.current.shift();
      const tr = surfaces.current.trace;
      if (tr) drawTrace(tr.ctx, tr.w, tr.h, history.current, CEILING);
    }

    /* 6. redraw the viewports when altitude moved — or every frame while
       occluded so the degraded feature-flow noise keeps updating on hover */
    if (!blocked && Math.abs(a - lastDrawn.current) < 0.008) return;
    lastDrawn.current = a;
    frameNo.current += 1;

    const off = windOffset(a, wind);
    const big = surfaces.current.big;
    if (big) {
      drawSim(big.ctx, {
        mode: "rgb",
        alt: a,
        w: big.w,
        h: big.h,
        offset: off,
        occluded: blocked,
      });
    }

    for (let i = 0; i < TILES.length; i += 1) {
      const c = surfaces.current.tiles[i];
      if (c) {
        drawSim(c.ctx, {
          mode: TILES[i].mode,
          alt: a,
          w: c.w,
          h: c.h,
          offset: off,
          occluded: blocked,
        });
      }
    }
  });

  /* ── text readouts at 10 Hz ────────────────────────────────────────────── */
  useTelemetryThrottled((t) => {
    const a = alt.current;
    const blocked = occludedRef.current;
    const focal = (surfaces.current.big?.w ?? 640) * 0.85;
    const px = tagPixels(a, focal);
    const conf = blocked ? 0 : tagConfidence(a, px);
    const off = windOffset(a, wind);
    const err = Math.hypot(off.x, off.y);

    if (altText.current) altText.current.textContent = a.toFixed(2);
    if (confText.current) {
      confText.current.textContent = conf > 0 ? conf.toFixed(2) : "--";
    }
    if (errText.current) errText.current.textContent = err.toFixed(2);
    if (vsText.current) {
      const rate = blocked
        ? 0
        : auto.current === "LAND"
          ? a > 2
            ? -2.3
            : -0.7
          : auto.current === "ABORT"
            ? 3.4
            : -t.vspeed * 0.25;
      vsText.current.textContent = `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}`;
    }
    if (tcText.current) {
      const v = video.current;
      tcText.current.textContent =
        v && !v.paused
          ? `REC ${v.currentTime.toFixed(1)}s`
          : `SIM F${Math.floor(t.elapsed * 30) % 100000}`;
    }

    /* checklist gates are real conditions, not a timeline */
    const state: Record<string, boolean> = {
      acq: conf > 0,
      algn: !blocked && err < ALIGN_GATE,
      flare: !blocked && a <= 2,
      down: !blocked && a <= 0.3,
    };
    for (const c of CHECKS) {
      const el = checkRefs.current[c.id];
      if (el) el.dataset.ok = state[c.id] ? "true" : "false";
    }

    /* detector events, logged only when a gate actually changes */
    if (state.acq !== wasAcquired.current) {
      wasAcquired.current = state.acq;
      if (state.acq) {
        emit("ACQ", `TAG 0 ACQUIRED · CONF ${conf.toFixed(2)}`, "ok");
      } else {
        emit(
          "LOST",
          blocked ? "NO TARGET IN SIGHT · HOLDING HOVER" : "TARGET LOST · SEARCHING",
          "warn",
        );
      }
    }
    if (state.algn !== wasAligned.current) {
      wasAligned.current = state.algn;
      if (state.algn) {
        emit("LOCK", `LATERAL LOCK · ERR ${err.toFixed(2)} m`, "ok");
      } else {
        emit("DRIFT", `OUTSIDE GATE · ERR ${err.toFixed(2)} m`, "warn");
      }
    }
    if (state.down !== wasDown.current) {
      wasDown.current = state.down;
      if (state.down) {
        emit(
          "DOWN",
          `TOUCHDOWN · ERR ${err.toFixed(2)} m${wind ? ` · WIND ${wind.toFixed(1)}` : ""}`,
          "ok",
        );
      }
    }
  }, 10);

  /* ── size the canvases once per layout change, then forget about it ────── */
  useEffect(() => {
    const remeasure = () => {
      surfaces.current = {
        big: fitCanvas(main.current),
        tiles: TILES.map((_, i) => fitCanvas(tiles.current[i])),
        trace: fitCanvas(trace.current),
      };
      /* force the next frame to redraw into the fresh surfaces */
      lastDrawn.current = -1;
    };

    remeasure();

    const host = bay.current;
    const ro = host ? new ResizeObserver(remeasure) : null;
    if (host && ro) ro.observe(host);
    window.addEventListener("resize", remeasure);
    if ("fonts" in document) void document.fonts.ready.then(remeasure);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [onScreen]);

  /* ── probe the clip once ───────────────────────────────────────────────── */
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const ok = () => setDownlink("READY");
    const bad = () => setDownlink("MISSING");
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    v.addEventListener("loadedmetadata", ok);
    v.addEventListener("canplay", ok);
    v.addEventListener("error", bad);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);

    /* Cached loads often fire loadedmetadata before this effect attaches.
       readyState >= HAVE_METADATA (1) means the clip is already good. */
    if (v.error) bad();
    else if (v.readyState >= 1) ok();
    else v.load();

    return () => {
      v.removeEventListener("loadedmetadata", ok);
      v.removeEventListener("canplay", ok);
      v.removeEventListener("error", bad);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(
    () => () => {
      if (landDenyTimer.current) window.clearTimeout(landDenyTimer.current);
    },
    [],
  );

  const takeManual = useCallback(() => setManual(true), []);

  const onLever = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    auto.current = "OFF";
    alt.current = Number(e.target.value) / 10;
    setManual(true);
  }, []);

  const flashLandDeny = useCallback(
    (msg: string) => {
      setLandDeny(msg);
      if (landDenyTimer.current) window.clearTimeout(landDenyTimer.current);
      landDenyTimer.current = window.setTimeout(() => setLandDeny(null), 4200);
      /* Short descending caution chirp — text is the real feedback if audio is blocked. */
      try {
        const AC =
          window.AudioContext ||
          (
            window as unknown as {
              webkitAudioContext: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const t0 = ctx.currentTime;
        for (const [i, freq] of [
          [0, 920],
          [1, 460],
        ] as const) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.value = freq;
          const start = t0 + i * 0.11;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.07, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.095);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.11);
        }
        window.setTimeout(() => void ctx.close(), 450);
      } catch {
        /* autoplay policy / unsupported — the text banner still fires */
      }
    },
    [],
  );

  const autoLand = useCallback(() => {
    if (occludedRef.current) {
      emit("DENY", "AUTO LAND REJECTED · NO TARGET IN SIGHT", "warn");
      flashLandDeny(
        "AUTO LAND REJECTED — NO TARGET IN SIGHT · HOLDING HOVER",
      );
      return;
    }
    auto.current = "LAND";
    setManual(true);
    setLandDeny(null);
    emit("AUTO", "AUTO LAND ARMED", "ok");
  }, [emit, flashLandDeny]);

  const abort = useCallback(() => {
    auto.current = "ABORT";
    setManual(true);
    setLandDeny(null);
  }, []);

  const release = useCallback(() => {
    auto.current = "OFF";
    setManual(false);
  }, []);

  const onWind = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value) / 10;
      setWind(v);
      /* force a redraw: the scene changed without the altitude changing */
      lastDrawn.current = -1;
      emit(
        "WIND",
        v === 0
          ? "CROSSWIND REMOVED"
          : `CROSSWIND ${v > 0 ? "+" : ""}${v.toFixed(1)} m/s INJECTED`,
        "info",
      );
    },
    [emit],
  );

  const toggleOcclude = useCallback(() => {
    const next = !occludedRef.current;
    occludedRef.current = next;
    lastDrawn.current = -1;
    if (next) {
      if (auto.current === "LAND") auto.current = "OFF";
      setManual(true);
      emit("HOLD", "NO TARGET IN SIGHT · HOLDING HOVER", "warn");
    } else {
      emit("OCC", "OCCLUDER WITHDRAWN · DESCENT AUTHORIZED", "info");
    }
    setOccluded(next);
  }, [emit]);

  const toggleVideo = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  return (
    <Section
      def={DEF}
      subtitle="THE FIDUCIAL BASELINE — FLOWN FIRST, ON PURPOSE"
      aside={
        <span className="text-micro text-dim">
          {manual ? "MANUAL CONTROL" : "SCROLL IS FLYING"}
        </span>
      }
    >
      <p className="text-lede text-mid mb-6 max-w-3xl leading-relaxed">
        Before the marker came out of the frame, the same controller was proven
        against an AprilTag. With a fiducial in view the target estimate is
        effectively ground truth, so a bad landing could only be the control
        loop&apos;s fault — which is what made the feature-based work in{" "}
        <a
          href="#teach-repeat"
          className="text-signal underline-offset-2 hover:underline"
        >
          section 04
        </a>{" "}
        debuggable at all. This bay is that descent with the failures I could
        not inject in flight.
      </p>

      {/* lg:items-start stops the two columns stretching to the taller one,
          and content-start stops each column's rows stretching to fill it —
          without both, every panel grows trailing whitespace. */}
      <div ref={bay} className="grid gap-4 lg:grid-cols-12 lg:items-start">
        {/* ── descent control ─────────────────────────────────────────────── */}
        <div className="grid content-start gap-4 lg:col-span-4">
          <Frame
            code="DSC"
            title="DESCENT CONTROL"
            tone="signal"
            aside={
              <span
                className={`text-micro ${manual ? "text-signal" : "text-data"}`}
              >
                {manual ? "MANUAL" : "SCROLL"}
              </span>
            }
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <MicroLabel>ALTITUDE AGL</MicroLabel>
                <p className="font-display text-readout text-data tnum">
                  <span ref={altText}>12.00</span>
                  <span className="text-label text-dim ml-1">m</span>
                </p>
              </div>
              <div className="text-right">
                <MicroLabel>PHASE</MicroLabel>
                <p
                  className={`font-display text-h3 tnum ${
                    phase === "TOUCHDOWN"
                      ? "text-nominal"
                      : phase === "HOVER"
                        ? "text-caution"
                        : phase === "FLARE"
                          ? "text-signal"
                          : "text-mid"
                  }`}
                >
                  {phase}
                </p>
              </div>
            </div>

            <dl className="text-micro border-rule mt-4 grid grid-cols-3 gap-2 border-t pt-3">
              <div>
                <dt className="text-dim">V/S m/s</dt>
                <dd className="tnum text-mid">
                  <span ref={vsText}>+0.0</span>
                </dd>
              </div>
              <div>
                <dt className="text-dim">TAG CONF</dt>
                <dd className="tnum text-mid">
                  <span ref={confText}>--</span>
                </dd>
              </div>
              <div>
                <dt className="text-dim">LAT ERR m</dt>
                <dd className="tnum text-mid">
                  <span ref={errText}>0.00</span>
                </dd>
              </div>
            </dl>

            {/* descent lever — a real range input, keyboard and touch usable */}
            <div className="mt-5">
              <label htmlFor="descent" className="text-micro text-dim mb-2 block">
                DESCENT LEVER · DRAG OR USE ARROW KEYS
              </label>
              <input
                ref={lever}
                id="descent"
                type="range"
                min={0}
                max={CEILING * 10}
                step={1}
                defaultValue={CEILING * 10}
                onChange={onLever}
                onPointerDown={takeManual}
                aria-label="Altitude above ground in tenths of a metre"
                className="gcs-lever"
              />
              <div className="text-micro text-dim mt-1 flex justify-between">
                <span>GROUND</span>
                <span>{CEILING} m</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={autoLand}
                aria-describedby={landDeny ? "auto-land-deny" : undefined}
                className="border-signal bg-signal text-void text-micro hover:bg-caution border px-3 py-2 font-semibold transition-colors"
              >
                AUTO LAND
              </button>
              <button
                type="button"
                onClick={abort}
                className="border-fault/60 text-fault text-micro hover:bg-fault hover:text-void border px-3 py-2 font-semibold transition-colors"
              >
                ABORT / CLIMB
              </button>
              {manual && (
                <button
                  type="button"
                  onClick={release}
                  className="border-rule text-mid text-micro hover:border-data hover:text-data border px-3 py-2 transition-colors"
                >
                  RETURN TO SCROLL
                </button>
              )}
            </div>

            <p
              id="auto-land-deny"
              role="status"
              aria-live="assertive"
              className={`text-micro mt-2 min-h-5 leading-relaxed ${
                landDeny ? "text-caution" : "sr-only"
              }`}
            >
              {landDeny ?? ""}
            </p>

            {/* fault injection — the part the arrival sequence never showed */}
            <div className="border-rule mt-5 border-t pt-4">
              <div className="mb-3 flex items-baseline justify-between">
                <MicroLabel>FAULT INJECTION</MicroLabel>
                <span
                  className={`text-micro ${
                    wind || occluded ? "text-caution" : "text-dim"
                  }`}
                >
                  {wind || occluded ? "DEGRADED" : "CLEAN AIR"}
                </span>
              </div>

              <label htmlFor="wind" className="text-micro text-dim mb-2 block">
                CROSSWIND ·{" "}
                <span className="text-data tnum">
                  {wind > 0 ? "+" : ""}
                  {wind.toFixed(1)} m/s
                </span>
              </label>
              <input
                id="wind"
                type="range"
                min={-WIND_MAX * 10}
                max={WIND_MAX * 10}
                step={5}
                value={wind * 10}
                onChange={onWind}
                aria-label="Injected crosswind in tenths of a metre per second"
                className="gcs-lever"
              />
              <div className="text-micro text-dim mt-1 flex justify-between">
                <span>-{WIND_MAX}</span>
                <span>CALM</span>
                <span>+{WIND_MAX}</span>
              </div>

              <button
                type="button"
                onClick={toggleOcclude}
                aria-pressed={occluded}
                className={`text-micro mt-3 w-full border px-3 py-2 font-semibold transition-colors ${
                  occluded
                    ? "border-fault bg-fault text-void"
                    : "border-rule text-mid hover:border-fault hover:text-fault"
                }`}
              >
                {occluded ? "WITHDRAW OCCLUDER" : "OCCLUDE THE LENS"}
              </button>

              <p className="text-micro text-dim mt-2 leading-relaxed">
                WIND LEAVES A REAL TOUCHDOWN ERROR · PAST{" "}
                <span className="text-caution tnum">4 m/s</span> THE ALIGNED GATE
                FAILS. THE OCCLUDER HOLDS HOVER — NO TARGET, FEATURE FLOW
                DEGRADES.
              </p>
            </div>

            {/* gates, evaluated from the live numbers above */}
            <ul className="text-micro border-rule mt-5 space-y-1.5 border-t pt-3">
              {CHECKS.map((c) => (
                <li
                  key={c.id}
                  ref={(el) => {
                    checkRefs.current[c.id] = el;
                  }}
                  data-ok="false"
                  className="group flex items-center gap-2 [&[data-ok='true']]:text-nominal text-dim"
                >
                  <span
                    aria-hidden="true"
                    className="bg-rule-hi h-1.5 w-1.5 group-data-[ok=true]:bg-nominal"
                  />
                  <span>{c.label}</span>
                  <span
                    aria-hidden="true"
                    className="border-rule min-w-3 flex-1 translate-y-[-3px] border-b border-dotted"
                  />
                  <span className="tnum">
                    <span className="group-data-[ok=true]:hidden">—</span>
                    <span className="hidden group-data-[ok=true]:inline">PASS</span>
                  </span>
                </li>
              ))}
            </ul>
          </Frame>

          <Frame
            code="TRC"
            title="ALTITUDE TRACE"
            tone="data"
            aside={<span className="text-micro text-dim">LAST 8.5 s</span>}
          >
            <canvas
              ref={trace}
              aria-hidden="true"
              className="block h-20 w-full"
            />
            <p className="text-micro text-dim mt-2">
              PLOTTED FROM THE ALTITUDE YOU ACTUALLY FLEW
            </p>
          </Frame>
        </div>

        {/* ── downlink + sim bay ──────────────────────────────────────────── */}
        <div className="grid content-start gap-4 lg:col-span-8">
          <Frame
            code="DL1"
            title="PAYLOAD DOWNLINK"
            tone="data"
            bodyClassName="p-3 sm:p-4"
            aside={
              <span className="text-micro flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 ${
                    downlink === "MISSING"
                      ? "bg-fault"
                      : playing
                        ? "bg-fault gcs-rec"
                        : "bg-data"
                  }`}
                />
                <span
                  className={downlink === "MISSING" ? "text-fault" : "text-data"}
                >
                  {downlink === "MISSING"
                    ? "NO SIGNAL"
                    : playing
                      ? "LIVE · FLIGHT TEST"
                      : "SIM · SITL"}
                </span>
              </span>
            }
          >
            <div className="bg-void relative aspect-video w-full overflow-hidden">
              {/* simulated payload camera */}
              <div ref={simLayer} className="absolute inset-0">
                <canvas
                  ref={main}
                  role="img"
                  aria-label="Simulated downward payload camera: landing pad and fiducial target scaling up as altitude decreases, with detection overlay."
                  className="block h-full w-full"
                />
              </div>

              {/* real flight-test footage, faded in by altitude */}
              <div
                ref={live}
                className="pointer-events-none absolute inset-0 opacity-0"
                style={{ willChange: "opacity" }}
              >
                <video
                  ref={video}
                  poster={FOOTAGE.poster}
                  muted={muted}
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={FOOTAGE.caption}
                  className="block h-full w-full object-cover transition-transform duration-500"
                  style={{ transform: crop ? "scale(1.14)" : "scale(1)" }}
                >
                  <source src={FOOTAGE.webm} type="video/webm" />
                  <source src={FOOTAGE.src} type="video/mp4" />
                </video>
                {downlink === "MISSING" && (
                  <div className="bg-void/95 absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-fault text-label tracking-label">
                      DOWNLINK UNAVAILABLE
                    </p>
                    <p className="text-dim text-data max-w-sm leading-relaxed">
                      No clip at{" "}
                      <code className="text-data">public{FOOTAGE.src}</code>. Drop
                      the landing footage there and this panel becomes the real
                      feed — the sim handover already works.
                    </p>
                  </div>
                )}
              </div>

              {/* handover artefact, fired once as the feeds swap */}
              <div
                ref={glitch}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0"
                style={{
                  background:
                    "repeating-linear-gradient(to bottom, rgba(86,220,255,0.14) 0 2px, transparent 2px 5px)",
                }}
              />

              {/* HUD overlay — sits over BOTH feeds, so the swap reads as one shot */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <span className="border-signal/70 absolute top-2 left-2 h-4 w-4 border-t border-l" />
                <span className="border-signal/70 absolute top-2 right-2 h-4 w-4 border-t border-r" />
                <span className="border-signal/70 absolute bottom-2 left-2 h-4 w-4 border-b border-l" />
                <span className="border-signal/70 absolute right-2 bottom-2 h-4 w-4 border-b border-r" />

                {/* centre reticle */}
                <span className="bg-signal/70 absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2" />
                <span className="bg-signal/70 absolute top-1/2 left-1/2 h-6 w-px -translate-y-1/2" />

                {/* altitude tape */}
                <div className="border-rule-hi/70 absolute top-1/2 left-3 h-24 w-1.5 -translate-y-1/2 border">
                  <div
                    ref={tapeFill}
                    className="bg-data/70 h-full w-full origin-bottom"
                  />
                </div>
                <span className="text-micro text-data/80 absolute top-1/2 left-6 -translate-y-1/2">
                  AGL
                </span>

                <span className="text-micro text-mid tnum absolute right-3 bottom-2">
                  <span ref={tcText}>SIM F0</span>
                </span>
                <span className="text-micro text-mid absolute bottom-2 left-3">
                  CAM · DOWN · 1280×720
                </span>
              </div>
            </div>

            {/* clip controls + honesty about the footage */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleVideo}
                disabled={downlink !== "READY"}
                className="border-rule text-micro text-mid hover:border-data hover:text-data disabled:text-dim/70 border px-3 py-1.5 transition-colors disabled:cursor-not-allowed"
              >
                {playing ? "PAUSE CLIP" : "PLAY CLIP"}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                disabled={downlink !== "READY"}
                className="border-rule text-micro text-mid hover:border-data hover:text-data disabled:text-dim/70 border px-3 py-1.5 transition-colors disabled:cursor-not-allowed"
              >
                {muted ? "UNMUTE" : "MUTE"}
              </button>
              <button
                type="button"
                onClick={() => setCrop((c) => !c)}
                aria-pressed={crop}
                title="Digital crop only — it hides edge wobble, it does not stabilise the footage"
                className={`text-micro border px-3 py-1.5 transition-colors ${
                  crop
                    ? "border-signal bg-signal text-void"
                    : "border-rule text-mid hover:border-data hover:text-data"
                }`}
              >
                CROP 1.14×
              </button>
              {mission && (
                <LinkChip
                  label={mission.links[0].label}
                  href={mission.links[0].href}
                />
              )}
            </div>

            <p className="text-data text-dim mt-3 max-w-2xl leading-relaxed">
              <span className="text-micro text-mid block">
                GROUND OBSERVER · UNSTABILISED · {FOOTAGE.shot}
              </span>
              {FOOTAGE.caption}
            </p>

            {downlink === "MISSING" && (
              <p className="border-caution/40 text-caution text-data mt-3 max-w-2xl border border-dashed p-3 leading-relaxed">
                No clip found at{" "}
                <code className="text-data">public{FOOTAGE.src}</code>. The
                sim-to-real handover above still runs — it just fades to a missing
                media notice instead of video. Drop the file in and it becomes the
                real feed; see{" "}
                <code className="text-data">public/media/README.md</code>.
              </p>
            )}
          </Frame>

          {/* sim bay tiles — same scene, different pass */}
          <div className="grid gap-3 sm:grid-cols-3">
            {TILES.map((tile, i) => (
              <Frame
                key={tile.mode}
                code={tile.code}
                title={tile.label}
                tone="dim"
                bodyClassName="p-2"
              >
                <canvas
                  ref={(el) => {
                    tiles.current[i] = el;
                  }}
                  aria-hidden="true"
                  className="block aspect-[4/3] w-full"
                />
              </Frame>
            ))}
          </div>

          <p className="text-data text-dim leading-relaxed">
            Every panel above is the same scene through a different pass,
            projected with{" "}
            <span className="text-data">pixels = metres · f / altitude</span> and{" "}
            <span className="text-data">depth = h · √(1 + (r/f)²)</span>. The
            lateral error converges as you descend because that is what the
            landing controller does — inject a crosswind and watch how much of it
            the controller gets back before the gear touches.
          </p>
        </div>

        {/* ── detector event log ──────────────────────────────────────────── */}
        <div className="lg:col-span-12">
          <Frame
            code="DET"
            title="DETECTOR EVENT LOG"
            tone="data"
            aside={
              <span className="text-micro text-dim tnum">
                LAST {LOG_DEPTH} EVENTS · THE COLD OPEN FLEW ITS DESCENT IN{" "}
                {(DESCENT_MS / 1000).toFixed(1)} s
              </span>
            }
          >
            <ul ref={logList} className="text-micro space-y-1.5">
              <li className="flex items-baseline gap-2 sm:gap-3">
                <span className="text-dim tnum shrink-0">F00000</span>
                <span className="text-data shrink-0">IDLE</span>
                <span className="text-mid">
                  DETECTOR ARMED · WAITING FOR THE DESCENT
                </span>
              </li>
            </ul>
            <p className="text-micro text-dim mt-3 leading-relaxed">
              EVERY LINE IS A GATE THAT ACTUALLY CHANGED — ACQUISITION, LATERAL
              LOCK, LOSS OF TARGET, TOUCHDOWN. NOTHING HERE IS ON A TIMER.
            </p>
          </Frame>
        </div>
      </div>
    </Section>
  );
}
