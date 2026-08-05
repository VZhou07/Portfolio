"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Frame, LinkChip, MicroLabel } from "@/components/gcs/primitives";
import { Section } from "@/components/gcs/section";
import { useOnScreen } from "@/components/gcs/reveal";
import { FOOTAGE, MISSIONS, SECTIONS } from "@/lib/content";
import { clamp } from "@/lib/derive";
import { useFlight, useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";
import {
  approachOffset,
  drawSim,
  drawTrace,
  tagConfidence,
  tagPixels,
  type SimMode,
} from "@/lib/sim-render";

const DEF = SECTIONS[3];
const CEILING = 12; /* metres AGL at the start of the approach */
const FADE_START = 1.9; /* handover begins */
const FADE_END = 0.25; /* real footage fully up */

type Phase = "TRANSIT" | "APPROACH" | "FLARE" | "TOUCHDOWN";
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

function phaseOf(alt: number): Phase {
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

function sizeCanvas(
  canvas: HTMLCanvasElement | null,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  if (!canvas) return null;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;

  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * APPROACH & TOUCHDOWN
 * The sim bay is driven by one altitude value. Scroll flies it by default; the
 * lever and AUTO LAND take manual control. As altitude passes ~1.9 m the
 * simulated payload feed hands over to the real onboard clip, so the descent you
 * scrubbed ends in the landing that actually happened.
 */
export function Approach() {
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

  /* flight state kept out of React: it changes every frame */
  const alt = useRef(CEILING);
  const lastDrawn = useRef(-1);
  const history = useRef<number[]>([]);
  const nextSample = useRef(0);
  const auto = useRef<"OFF" | "LAND" | "ABORT">("OFF");
  const played = useRef(false);
  const glitched = useRef(false);

  const [manual, setManual] = useState(false);
  const [phase, setPhase] = useState<Phase>("TRANSIT");
  const [downlink, setDownlink] = useState<Downlink>("PROBING");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [crop, setCrop] = useState(false);

  const mission = MISSIONS.find((m) => m.id === FOOTAGE.missionId);

  /* ── the descent + every viewport, from one frame callback ─────────────── */
  useTelemetry((t) => {
    /* 1. advance altitude */
    if (auto.current === "LAND") {
      const rate = alt.current > 2 ? 2.3 : 0.7; /* flare slows the descent */
      alt.current = Math.max(0, alt.current - rate * t.dt);
      if (alt.current === 0) auto.current = "OFF";
    } else if (auto.current === "ABORT") {
      alt.current = Math.min(CEILING, alt.current + 3.4 * t.dt);
      if (alt.current === CEILING) auto.current = "OFF";
    } else if (!manual && t.sectionIndex === 3) {
      /* scroll flies it: 0.12..0.9 of the section maps to ceiling..ground */
      const p = clamp((t.sectionProgress - 0.12) / 0.78, 0, 1);
      alt.current = CEILING * (1 - p);
    }

    const a = alt.current;
    const nextPhase = phaseOf(a);
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
        played.current = true;
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

    /* 5. sample the trace at 20 Hz */
    if (t.elapsed > nextSample.current) {
      nextSample.current = t.elapsed + 0.05;
      history.current.push(a);
      if (history.current.length > 170) history.current.shift();
      if (onScreen) {
        const c = sizeCanvas(trace.current);
        if (c) drawTrace(c.ctx, c.w, c.h, history.current, CEILING);
      }
    }

    /* 6. redraw the viewports only when the altitude actually moved */
    if (!onScreen || Math.abs(a - lastDrawn.current) < 0.008) return;
    lastDrawn.current = a;

    const big = sizeCanvas(main.current);
    if (big) drawSim(big.ctx, { mode: "rgb", alt: a, w: big.w, h: big.h });

    for (let i = 0; i < TILES.length; i += 1) {
      const c = sizeCanvas(tiles.current[i]);
      if (c) drawSim(c.ctx, { mode: TILES[i].mode, alt: a, w: c.w, h: c.h });
    }
  });

  /* ── text readouts at 10 Hz ────────────────────────────────────────────── */
  useTelemetryThrottled((t) => {
    const a = alt.current;
    const focal = (main.current?.clientWidth ?? 640) * 0.85;
    const px = tagPixels(a, focal);
    const conf = tagConfidence(a, px);
    const off = approachOffset(a);
    const err = Math.hypot(off.x, off.y);

    if (altText.current) altText.current.textContent = a.toFixed(2);
    if (confText.current) {
      confText.current.textContent = conf > 0 ? conf.toFixed(2) : "--";
    }
    if (errText.current) errText.current.textContent = err.toFixed(2);
    if (vsText.current) {
      const rate =
        auto.current === "LAND" ? (a > 2 ? -2.3 : -0.7) : auto.current === "ABORT" ? 3.4 : -t.vspeed * 0.25;
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
      algn: err < 0.2,
      flare: a <= 2,
      down: a <= 0.3,
    };
    for (const c of CHECKS) {
      const el = checkRefs.current[c.id];
      if (el) el.dataset.ok = state[c.id] ? "true" : "false";
    }
  }, 10);

  /* ── redraw on resize, and whenever the bay comes back on screen ───────── */
  useEffect(() => {
    /* force the next frame to redraw: the guard below compares against this */
    lastDrawn.current = -1;
  }, [onScreen]);

  useEffect(() => {
    const invalidate = () => {
      lastDrawn.current = -1;
    };
    window.addEventListener("resize", invalidate);
    return () => window.removeEventListener("resize", invalidate);
  }, []);

  /* ── probe the clip once ───────────────────────────────────────────────── */
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const ok = () => setDownlink("READY");
    const bad = () => setDownlink("MISSING");
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    v.addEventListener("loadedmetadata", ok);
    v.addEventListener("error", bad);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("loadedmetadata", ok);
      v.removeEventListener("error", bad);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const takeManual = useCallback(() => setManual(true), []);

  const onLever = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    auto.current = "OFF";
    alt.current = Number(e.target.value) / 10;
    setManual(true);
  }, []);

  const autoLand = useCallback(() => {
    auto.current = "LAND";
    setManual(true);
  }, []);

  const abort = useCallback(() => {
    auto.current = "ABORT";
    setManual(true);
  }, []);

  const release = useCallback(() => {
    auto.current = "OFF";
    setManual(false);
  }, []);

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
      subtitle="SIM TO REAL — THE DESCENT HANDS OVER TO ONBOARD FOOTAGE"
      aside={
        <span className="text-micro text-dim">
          {manual ? "MANUAL CONTROL" : "SCROLL IS FLYING"}
        </span>
      }
    >
      <div ref={bay} className="grid gap-4 lg:grid-cols-12">
        {/* ── descent control ─────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:col-span-4">
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
        <div className="grid gap-4 lg:col-span-8">
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
                      ? "LIVE · ONBOARD"
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

              {/* real onboard footage, faded in by altitude */}
              <div
                ref={live}
                className="absolute inset-0 opacity-0"
                style={{ willChange: "opacity" }}
              >
                <video
                  ref={video}
                  src={FOOTAGE.src}
                  poster={FOOTAGE.poster}
                  muted={muted}
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={FOOTAGE.caption}
                  className="block h-full w-full object-cover transition-transform duration-500"
                  style={{ transform: crop ? "scale(1.14)" : "scale(1)" }}
                />
                {downlink === "MISSING" && (
                  <div className="bg-void/95 absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-fault text-label tracking-label">
                      DOWNLINK UNAVAILABLE
                    </p>
                    <p className="text-dim text-micro max-w-sm leading-relaxed">
                      NO CLIP AT{" "}
                      <code className="text-data">public{FOOTAGE.src}</code>. DROP
                      THE LANDING FOOTAGE THERE AND THIS PANEL BECOMES THE REAL
                      FEED — THE SIM HANDOVER ALREADY WORKS.
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

            <p className="text-micro text-dim mt-3 max-w-2xl leading-relaxed">
              RAW ONBOARD CAPTURE · UNSTABILISED · {FOOTAGE.caption}
            </p>
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

          <p className="text-micro text-dim leading-relaxed">
            EVERY PANEL ABOVE IS THE SAME SCENE THROUGH A DIFFERENT PASS, PROJECTED
            WITH <span className="text-data">pixels = metres · f / altitude</span>{" "}
            AND <span className="text-data">depth = h · √(1 + (r/f)²)</span>. THE
            LATERAL ERROR CONVERGES AS YOU DESCEND BECAUSE THAT IS WHAT THE LANDING
            CONTROLLER DOES.
          </p>
        </div>
      </div>
    </Section>
  );
}
