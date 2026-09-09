"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frame, LinkChip, MicroLabel } from "@/components/gcs/primitives";
import { useOnScreen } from "@/components/gcs/reveal";
import { Section } from "@/components/gcs/section";
import { FOOTAGE, MISSIONS, sectionOf } from "@/lib/content";
import { useFlight, useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";
import {
  altitudeAt,
  CAM_FLOOR,
  DESCENT_MS,
  handedOff,
  phaseOf,
} from "@/lib/intro-profile";
import {
  ALIGN_FLOOR_M,
  ALIGN_RATIO,
  descentTaper,
  DESCENT_VZ,
  drawOrb,
  fitOrbCanvas,
  LAND_HANDOFF_M,
  LOWE_RATIO,
  MIN_INLIER_RATIO,
  MIN_TEACH_KEYPOINTS,
  modelledMatches,
  repeatOffset,
  TEACH_RUNG_M,
  TEACH_TOP_M,
  teachRungFor,
  type Surface,
} from "@/lib/orb-render";
import { FRAMES, framePath, TEACH_REPEAT } from "@/lib/teach-repeat";

const DEF = sectionOf("teach-repeat");
const MISSION = MISSIONS.find((m) => m.id === FOOTAGE.missionId);
/** ms per frame when the ladder is playing itself. */
const PLAY_MS = 1400;

/** Principal point, as a fraction of the frame. The arrow is aimed from here. */
const PP = TEACH_REPEAT.principal;

/** In-section jump targets, in document order. The section is long; this makes
    it walkable, and on a phone the chips match the order you scroll through. */
const JUMPS: { id: string; label: string }[] = [
  { id: "tr-sim", label: "HOW IT WORKS" },
  { id: "tr-frames", label: "REAL FRAMES" },
  { id: "tr-video", label: "FLIGHT VIDEO" },
  { id: "tr-ladder", label: "LADDER" },
  { id: "tr-orb", label: "WHERE ORB FAILS" },
  { id: "tr-pipeline", label: "PIPELINE" },
];

type Half = "teach" | "repeat";

/* -------------------------------------------------------------------------- */
/* THE PIPELINE, AS THE FLIGHT SOFTWARE ORDERS IT                             */
/* -------------------------------------------------------------------------- */

const STAGES: { code: string; title: string; body: string; note: string }[] = [
  {
    code: "T1",
    title: "TEACH — CLIMB OUT",
    body: `Every ${TEACH_RUNG_M} m of altitude gained on the way up, the downward camera is undistorted, ORB-described, and filed in a map keyed by height above ground from the rangefinder. The ladder tops out at ${TEACH_TOP_M} m.`,
    note: `A frame with fewer than ${MIN_TEACH_KEYPOINTS} keypoints is rejected rather than stored — a dead keyframe is worse than a missing one, because the descent would select it and then stall.`,
  },
  {
    code: "R1",
    title: "REPEAT — SELECT THE RUNG",
    body: "On descent the map is bisected by current altitude and the keyframe immediately below the aircraft is chosen. That keeps the scale gap between the two frames as small as the ladder allows.",
    note: "Choosing the nearest rung is not cosmetic: the wider the altitude gap, the fewer matches ORB survives. The frames below measure exactly that.",
  },
  {
    code: "R2",
    title: "MATCH — RATIO TEST",
    body: `kNN match live descriptors against the keyframe, then keep only correspondences whose best candidate beats its runner-up by ${LOWE_RATIO}. Asphalt, grass and concrete aggregate all produce near-identical descriptors, so a small Hamming distance alone proves nothing.`,
    note: "Runs on a CUDA brute-force matcher on the Jetson, with a CPU matcher as fallback, inside a 10 Hz loop.",
  },
  {
    code: "R3",
    title: "BACK-PROJECT — TO METRES",
    body: "Both keypoint sets are back-projected onto the ground plane using the calibrated intrinsics, each frame's own altitude, and its own roll and pitch. After this step the problem is no longer in pixels: it is two sets of metric ground points.",
    note: "Roll and pitch compensation matters because the two frames were shot at different attitudes — the correction would otherwise absorb the tilt.",
  },
  {
    code: "R4",
    title: "SOLVE — RANSAC AFFINE",
    body: `A partial-affine fit under RANSAC gives translation, rotation and scale between teach and repeat. Translation is the lateral correction, straight out in metres. Fits below ${MIN_INLIER_RATIO * 100}% inliers, or with a degenerate scale, are thrown away instead of flown.`,
    note: "Yaw is cross-checked against the IMU delta, so a rotation the features claim but the gyro does not is caught.",
  },
  {
    code: "C1",
    title: "CONTROL — TAPERED AUTHORITY",
    body: `A PI velocity controller drives the correction to zero while the descent rate is scaled by alignment quality inside a cone that tightens with altitude. Vision-guided descent runs at ${DESCENT_VZ} m/s — deliberately slow.`,
    note: "Full authority inside the 1× cone, zero at 2×, linear between. A marginal fix slows the descent instead of stopping it dead.",
  },
  {
    code: "C2",
    title: "RECOVER — STALE VISION",
    body: "If vision has been unavailable for two seconds, holding position cannot help: the view never changes. If the last good fix was inside the cone the aircraft commits on the rangefinder; if it was not, it climbs to widen the camera footprint and re-acquire.",
    note: "Climbing to re-acquire is the counter-intuitive one, and the one that turned a hover-until-battery-dies failure into a recoverable state.",
  },
  {
    code: "C3",
    title: "TOUCHDOWN — HAND IT OVER",
    body: `Below ${LAND_HANDOFF_M} m AGL the aircraft is handed to ArduPilot's LAND mode, which owns touchdown detection and disarm. Ground contact is confirmed over three consecutive samples before the landing is called complete.`,
    note: "Streaming downward velocity setpoints into a loaded gear leg is how you break an airframe. LAND mode already solves this; use it.",
  },
];

/* -------------------------------------------------------------------------- */
/* FRAME VIEWER                                                               */
/* -------------------------------------------------------------------------- */

/** Frame aspect: 719 / 1279, the calibration's undistorted crop. */
const AR = 719 / 1279;

/**
 * One recovered pair, annotated. The two halves are drawn flush, exactly as the
 * flight software concatenated them, so a single overlay can span both and the
 * correspondences can be drawn as lines across the seam.
 *
 * The images are untouched Jetson output. Everything drawn on top is a real
 * measurement from lib/teach-repeat.ts: the ORB matches that survived the ratio
 * test and RANSAC, and the correction vector decoded from the arrow the flight
 * software itself burned into the right half.
 */
function PairViewer({
  index,
  showMatches,
  showVector,
}: {
  index: number;
  showMatches: boolean;
  showVector: boolean;
}) {
  const f = FRAMES[index];

  /* The arrow the flight code drew, as a fraction of the frame. */
  const tipX = PP.x + f.arrow.dx;
  const tipY = PP.y + f.arrow.dy;

  /* Reticle arms, reused for both halves. */
  const reticle = (ox: number) => (
    <g key={ox} stroke="#ffb44a" strokeWidth={0.0022} opacity={0.9}>
      <line x1={ox + PP.x - 0.014} y1={PP.y * AR} x2={ox + PP.x - 0.004} y2={PP.y * AR} />
      <line x1={ox + PP.x + 0.004} y1={PP.y * AR} x2={ox + PP.x + 0.014} y2={PP.y * AR} />
      <line x1={ox + PP.x} y1={PP.y * AR - 0.014} x2={ox + PP.x} y2={PP.y * AR - 0.004} />
      <line x1={ox + PP.x} y1={PP.y * AR + 0.004} x2={ox + PP.x} y2={PP.y * AR + 0.014} />
    </g>
  );

  return (
    <figure>
      <div className="bg-void relative">
        <div className="grid grid-cols-2">
          {(["teach", "repeat"] as Half[]).map((half) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={half}
              src={framePath(f.id, half)}
              alt={
                half === "teach"
                  ? `Teach keyframe ${f.id}: the downward camera's view of the taped launch mark on asphalt, recorded during the climb.`
                  : `Repeat frame ${f.id}: the same ground seen on descent, with the correction vector the flight software drew on it.`
              }
              width={760}
              height={427}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              className="block w-full"
              style={{ aspectRatio: "1279 / 719" }}
            />
          ))}
        </div>

        {/* one overlay across both halves: teach spans x 0..1, repeat 1..2 */}
        <svg
          aria-hidden="true"
          viewBox={`0 0 2 ${AR}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {showMatches && (
            <g>
              {/* correspondence lines across the seam */}
              {f.matches.map((m, i) => (
                <line
                  key={`l${i}`}
                  x1={m[0]}
                  y1={m[1] * AR}
                  x2={1 + m[2]}
                  y2={m[3] * AR}
                  stroke="#ffb44a"
                  strokeWidth={0.0016}
                  opacity={0.5}
                />
              ))}
              {/* and the keypoints at each end */}
              {f.matches.map((m, i) => (
                <g key={`p${i}`} fill="none" stroke="#56dcff" strokeWidth={0.0022}>
                  <circle cx={m[0]} cy={m[1] * AR} r={0.0055} />
                  <circle cx={1 + m[2]} cy={m[3] * AR} r={0.0055} />
                </g>
              ))}
            </g>
          )}

          {reticle(0)}
          {reticle(1)}

          {showVector && (
            <g>
              <line
                x1={1 + PP.x}
                y1={PP.y * AR}
                x2={1 + tipX}
                y2={tipY * AR}
                stroke={f.clamped ? "#ff6363" : "#8ef2a0"}
                strokeWidth={0.0035}
              />
              <circle
                cx={1 + tipX}
                cy={tipY * AR}
                r={0.007}
                fill={f.clamped ? "#ff6363" : "#8ef2a0"}
              />
            </g>
          )}

          {/* the seam the flight software concatenated on */}
          <line x1={1} y1={0} x2={1} y2={AR} stroke="#1c2f36" strokeWidth={0.003} />
        </svg>

        {/* viewport ticks */}
        <span className="border-signal/60 pointer-events-none absolute top-1 left-1 h-3 w-3 border-t border-l" />
        <span className="border-signal/60 pointer-events-none absolute right-1 bottom-1 h-3 w-3 border-r border-b" />
      </div>

      <figcaption className="text-micro mt-1.5 grid grid-cols-2 gap-2">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-data">TEACH KEYFRAME</span>
          <span className="text-dim tnum">{f.relTeachAlt.toFixed(2)}× ALT</span>
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-signal">REPEAT FRAME · LIVE</span>
          <span className="text-dim tnum">{f.relAlt.toFixed(2)}× ALT</span>
        </span>
      </figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* SIMULATED DESCENT — the idea, before the evidence                          */
/* -------------------------------------------------------------------------- */

/** How long the looping demo takes to fly the whole descent. */
const SIM_MS = 9000;
/** Beat held on the ground before it climbs back and runs again. */
const SIM_HOLD_MS = 900;

/**
 * A looping teach-and-repeat descent, laid out as the same TEACH | REPEAT pair
 * the recovered frames below use, so the concept and the evidence read as one
 * thing. Altitude follows the identical profile the cold open flies, stretched
 * out to be legible; the keypoint count, the alignment cone and the correction
 * vector are all computed from it with the flight software's own constants.
 */
function SimDescent() {
  const { reducedMotion } = useFlight();
  const host = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(host, "120px");

  const teachCanvas = useRef<HTMLCanvasElement>(null);
  const repeatCanvas = useRef<HTMLCanvasElement>(null);
  const altText = useRef<HTMLSpanElement>(null);
  const rungText = useRef<HTMLSpanElement>(null);
  const matchText = useRef<HTMLSpanElement>(null);
  const errText = useRef<HTMLSpanElement>(null);
  const taperText = useRef<HTMLSpanElement>(null);
  const phaseText = useRef<HTMLSpanElement>(null);

  const surfaces = useRef<{ teach: Surface | null; repeat: Surface | null }>({
    teach: null,
    repeat: null,
  });
  /** Position in the loop, in ms. Held outside React: it moves every frame. */
  const clock = useRef(0);
  const lastAlt = useRef(-1);

  const [running, setRunning] = useState(true);

  useEffect(() => {
    const remeasure = () => {
      surfaces.current = {
        teach: fitOrbCanvas(teachCanvas.current),
        repeat: fitOrbCanvas(repeatCanvas.current),
      };
      lastAlt.current = -1;
    };
    remeasure();
    const el = host.current;
    const ro = el ? new ResizeObserver(remeasure) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", remeasure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  useTelemetry((t) => {
    if (!onScreen) return;

    /* Reduced motion gets one readable frame mid-approach, not a loop. */
    if (reducedMotion) {
      if (lastAlt.current >= 0) return;
      clock.current = SIM_MS * 0.45;
    } else if (running) {
      clock.current = (clock.current + t.dt * 1000) % (SIM_MS + SIM_HOLD_MS);
    }

    /* Map loop position onto the cold open's profile so the shape matches. */
    const p = Math.min(1, clock.current / SIM_MS);
    const alt = altitudeAt(p * DESCENT_MS);
    if (Math.abs(alt - lastAlt.current) < 0.002) return;
    lastAlt.current = alt;

    const shown = Math.max(alt, CAM_FLOOR);
    const rung = teachRungFor(shown);
    const err = repeatOffset(alt);
    const cold = handedOff(alt);

    const s = surfaces.current;
    if (s.repeat) {
      drawOrb(s.repeat.ctx, {
        mode: "repeat",
        alt: shown,
        teachAlt: rung,
        err,
        w: s.repeat.w,
        h: s.repeat.h,
        handedOff: cold,
      });
    }
    if (s.teach) {
      drawOrb(s.teach.ctx, {
        mode: "teach",
        alt: shown,
        teachAlt: rung,
        err: { x: 0, y: 0 },
        w: s.teach.w,
        h: s.teach.h,
      });
    }
  });

  useTelemetryThrottled(() => {
    if (!onScreen) return;
    const alt = lastAlt.current < 0 ? TEACH_TOP_M : lastAlt.current;
    const shown = Math.max(alt, CAM_FLOOR);
    const rung = teachRungFor(shown);
    const err = Math.hypot(repeatOffset(alt).x, repeatOffset(alt).y);
    const cold = handedOff(alt);
    const taper = descentTaper(err, alt);

    if (altText.current) altText.current.textContent = alt.toFixed(2);
    if (rungText.current) rungText.current.textContent = rung.toFixed(2);
    if (matchText.current) {
      matchText.current.textContent = cold
        ? "--"
        : String(modelledMatches(rung / shown));
    }
    if (errText.current) errText.current.textContent = (err * 100).toFixed(0);
    if (taperText.current) {
      taperText.current.textContent = cold ? "--" : taper.toFixed(2);
    }
    if (phaseText.current) phaseText.current.textContent = phaseOf(alt);
  }, 10);

  return (
    <div ref={host}>
      <div className="grid grid-cols-2">
        <canvas
          ref={teachCanvas}
          role="img"
          aria-label="Simulated teach keyframe: the downward camera's stored view of the launch point, with the ORB keypoints filed alongside it."
          className="border-rule block w-full border-r"
          style={{ aspectRatio: "1279 / 719" }}
        />
        <canvas
          ref={repeatCanvas}
          role="img"
          aria-label="Simulated repeat frame: the same ground on descent, with the alignment cone and the correction vector the controller is being given."
          className="block w-full"
          style={{ aspectRatio: "1279 / 719" }}
        />
      </div>

      <div className="text-micro mt-1.5 grid grid-cols-2 gap-2">
        <span className="text-data">TEACH KEYFRAME · STORED</span>
        <span className="text-signal">REPEAT FRAME · LIVE</span>
      </div>

      <dl className="text-micro border-rule mt-3 grid grid-cols-3 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-6">
        {[
          { k: "AGL m", r: altText, d: TEACH_TOP_M.toFixed(2) },
          { k: "RUNG m", r: rungText, d: TEACH_TOP_M.toFixed(2) },
          { k: "MATCHES", r: matchText, d: "0" },
          { k: "XY ERR cm", r: errText, d: "0" },
          { k: "AUTHORITY", r: taperText, d: "0.00" },
          { k: "PHASE", r: phaseText, d: "REPEAT" },
        ].map((f) => (
          <div key={f.k}>
            <dt className="text-dim">{f.k}</dt>
            <dd className="text-mid tnum">
              <span ref={f.r}>{f.d}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          aria-pressed={running}
          disabled={reducedMotion}
          className={`text-micro border px-3 py-1.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            running
              ? "border-signal bg-signal text-void"
              : "border-rule text-mid hover:border-signal hover:text-signal"
          }`}
        >
          {running ? "PAUSE LOOP" : "RUN LOOP"}
        </button>
        <span className="text-micro text-dim leading-relaxed">
          {reducedMotion
            ? "HELD MID-APPROACH · REDUCED MOTION"
            : `LOOPS ${TEACH_TOP_M} m → TOUCHDOWN IN ${(SIM_MS / 1000).toFixed(0)} s`}
        </span>
      </div>

      <p className="text-data text-dim mt-3 max-w-3xl leading-relaxed">
        Cyan crosses are keypoints. The green ring is the alignment cone —{" "}
        <span className="text-mid">
          max({ALIGN_FLOOR_M} m, {ALIGN_RATIO} × AGL)
        </span>
        , which works out to a constant pixel radius for most of the descent, and
        the dashed ring at twice that is where descent authority reaches zero. The
        vector from the amber reticle is the correction. Watch the match count
        fall as the aircraft climbs away from its keyframe, and watch the whole
        overlay go cold at{" "}
        <span className="text-mid tnum">{LAND_HANDOFF_M.toFixed(1)} m</span> when
        the autopilot takes over.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SCALE-GAP CHART — the measurement that motivates the CNN work              */
/* -------------------------------------------------------------------------- */

function ScaleGapChart({
  active,
  onPick,
}: {
  active: number;
  onPick: (i: number) => void;
}) {
  const peak = useMemo(
    () => Math.max(...FRAMES.map((f) => f.orb.matches)),
    [],
  );

  return (
    <div>
      <ul className="space-y-1.5">
        {FRAMES.map((f, i) => {
          const wide = f.sigma < 0.7;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-pressed={i === active}
                className={`group flex w-full items-center gap-2 text-left ${
                  i === active ? "text-ink" : "text-dim hover:text-mid"
                }`}
              >
                <span className="text-micro tnum w-8 shrink-0">{f.id}</span>
                <span
                  className={`text-micro tnum w-11 shrink-0 ${
                    wide ? "text-fault" : "text-nominal"
                  }`}
                >
                  {f.sigma.toFixed(2)}
                </span>
                <span className="bg-void border-rule relative h-2 flex-1 border">
                  <span
                    className={`absolute inset-y-0 left-0 ${
                      wide ? "bg-fault/70" : "bg-data/70"
                    } ${i === active ? "opacity-100" : "opacity-70"}`}
                    style={{ width: `${(f.orb.matches / peak) * 100}%` }}
                  />
                </span>
                <span className="text-micro tnum w-10 shrink-0 text-right">
                  {f.orb.matches}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-micro text-dim mt-3 leading-relaxed">
        LEFT COLUMN IS σ — TEACH ALTITUDE ÷ REPEAT ALTITUDE. RIGHT IS SURVIVING
        MATCHES. <span className="text-fault">RED</span> PAIRS ARE THE WIDE-GAP
        ONES, AND THEY ARE THE ONES THAT STARVE.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SECTION                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * TEACH & REPEAT — the flight-verified landing, taken apart.
 *
 * This section is built on the actual flight frames. The flight card was
 * corrupted and carved back: 855 files came off it, of which only 12 are
 * distinct images. Those 12 are here, ordered by a measured altitude ladder,
 * with the lateral error decoded out of the arrow the flight software drew.
 */
export function TeachRepeat() {
  const { reducedMotion } = useFlight();
  const bay = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(bay, "200px");

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showMatches, setShowMatches] = useState(true);
  const [showVector, setShowVector] = useState(true);
  const [stage, setStage] = useState(0);

  const frame = FRAMES[index];

  /* auto-advance down the ladder; pauses off-screen and for reduced motion */
  useEffect(() => {
    if (!playing || !onScreen || reducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % FRAMES.length);
    }, PLAY_MS);
    return () => window.clearInterval(id);
  }, [playing, onScreen, reducedMotion]);

  const step = useCallback((delta: number) => {
    setPlaying(false);
    setIndex((i) => (i + delta + FRAMES.length) % FRAMES.length);
  }, []);

  const onLadderKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    },
    [step],
  );

  /* In-section jump. Scrolls the panel into view without touching the URL —
     these are sub-panels, not addressable sections. */
  const jumpTo = useCallback(
    (id: string) => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [reducedMotion],
  );

  /* Measured convergence: mean decoded error over the upper half of the
     recovered ladder versus the lower half. Computed, not asserted. */
  const measurable = FRAMES.filter((f) => f.errCm !== null);
  const mid = FRAMES[Math.floor(FRAMES.length / 2)].relAlt;
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const highErr = mean(
    measurable.filter((f) => f.relAlt >= mid).map((f) => f.errCm as number),
  );
  const lowErr = mean(
    measurable.filter((f) => f.relAlt < mid).map((f) => f.errCm as number),
  );

  /* The widest exposure gap the matcher had to bridge, in luma levels. */
  const exposureGap = Math.max(
    ...FRAMES.map((f) => Math.abs(f.exposure.repeat - f.exposure.teach)),
  );

  return (
    <Section
      def={DEF}
      subtitle="THE FLIGHT THAT WORKED, RECOVERED OFF A CORRUPTED CARD"
      aside={
        <span className="text-micro text-dim tnum">
          {TEACH_REPEAT.recovery.uniqueFrames} FRAMES SURVIVED OF{" "}
          {TEACH_REPEAT.recovery.filesCarved} CARVED
        </span>
      }
    >
      {/* ── the claim, up front ────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="text-lede text-mid max-w-2xl leading-relaxed">
            No marker on the ground and no GPS precision to lean on. On the way
            up the aircraft memorises what the ground looks like at every rung of
            an altitude ladder. On the way down it matches what it sees against
            what it remembers, and flies the difference to zero.
          </p>
          <p className="text-data text-dim mt-3 max-w-2xl leading-relaxed">
            It landed <span className="text-nominal">inside 15 cm</span> on the
            airframe and <span className="text-nominal">2 cm</span> in
            simulation. Everything below this line is measured from the flight
            itself, not reconstructed — including the part where the classical
            feature descriptor starts to run out of road.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 lg:col-span-5 lg:grid-cols-2">
          {[
            { k: "FLIGHT ERROR", v: "15", u: "cm", tone: "text-nominal" },
            { k: "SIM ERROR", v: "2", u: "cm", tone: "text-nominal" },
            { k: "CONTROL LOOP", v: "10", u: "Hz", tone: "text-data" },
            { k: "DESCENT RATE", v: "0.1", u: "m/s", tone: "text-data" },
          ].map((s) => (
            <div key={s.k} className="border-rule bg-panel/60 gcs-notch-sm border p-3">
              <dt className="text-micro text-dim">{s.k}</dt>
              <dd className={`font-display text-h3 tnum mt-1 ${s.tone}`}>
                {s.v}
                <span className="text-label text-dim ml-1">{s.u}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── in-section navigation ──────────────────────────────────────── */}
      <nav aria-label="Jump within this section" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {JUMPS.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => jumpTo(j.id)}
                className="border-rule text-micro text-dim hover:border-signal hover:text-signal border px-2.5 py-1.5 transition-colors"
              >
                {j.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* lg:items-start stops the columns stretching to the taller one, and
          content-start stops each column's rows stretching to fill it — without
          both, every panel grows trailing whitespace. */}
      <div ref={bay} className="grid gap-4 lg:grid-cols-12 lg:items-start">
        {/* ── the pipeline, animated, then the evidence ────────────────── */}
        <div className="grid content-start gap-4 lg:col-span-8">
          <Frame
            id="tr-sim"
            code="SIM"
            title="HOW THE DESCENT WORKS"
            tone="data"
            bodyClassName="p-3 sm:p-4"
            aside={
              <span className="text-micro text-dim">SIMULATED · REAL CONSTANTS</span>
            }
          >
            <SimDescent />
          </Frame>

          <Frame
            id="tr-frames"
            code="RCV"
            title="RECOVERED FLIGHT FRAMES"
            tone="signal"
            bodyClassName="p-3 sm:p-4"
            aside={
              <span className="text-micro tnum text-dim">
                {frame.id} · {index + 1}/{FRAMES.length}
              </span>
            }
          >
            <PairViewer
              index={index}
              showMatches={showMatches}
              showVector={showVector}
            />

            {/* readouts for the selected pair */}
            <dl className="text-micro border-rule mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
              <div>
                <dt className="text-dim">LATERAL ERROR</dt>
                <dd
                  className={`font-display text-h3 tnum ${
                    frame.errCm === null
                      ? "text-fault"
                      : frame.errCm <= 15
                        ? "text-nominal"
                        : "text-caution"
                  }`}
                >
                  {frame.errCm === null ? "≥40" : frame.errCm.toFixed(1)}
                  <span className="text-label text-dim ml-1">cm</span>
                </dd>
              </div>
              <div>
                <dt className="text-dim">SCALE GAP σ</dt>
                <dd className="text-mid tnum text-h3 font-display">
                  {frame.sigma.toFixed(3)}
                </dd>
              </div>
              <div>
                <dt className="text-dim">MATCHES · INLIERS</dt>
                <dd className="text-mid tnum text-h3 font-display">
                  {frame.orb.matches}
                  <span className="text-label text-dim ml-1">
                    · {frame.orb.inlier_pct.toFixed(0)}%
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-dim">RELATIVE ALTITUDE</dt>
                <dd className="text-mid tnum text-h3 font-display">
                  {frame.relAlt.toFixed(2)}
                  <span className="text-label text-dim ml-1">×</span>
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                className="border-rule text-micro text-mid hover:border-data hover:text-data border px-3 py-1.5 transition-colors"
              >
                ← HIGHER
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="border-rule text-micro text-mid hover:border-data hover:text-data border px-3 py-1.5 transition-colors"
              >
                LOWER →
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-pressed={playing}
                className={`text-micro border px-3 py-1.5 font-semibold transition-colors ${
                  playing
                    ? "border-signal bg-signal text-void"
                    : "border-rule text-mid hover:border-signal hover:text-signal"
                }`}
              >
                {playing ? "PAUSE DESCENT" : "PLAY DESCENT"}
              </button>
              <button
                type="button"
                onClick={() => setShowMatches((v) => !v)}
                aria-pressed={showMatches}
                className={`text-micro border px-3 py-1.5 transition-colors ${
                  showMatches
                    ? "border-data text-data"
                    : "border-rule text-dim hover:text-mid"
                }`}
              >
                ORB INLIERS
              </button>
              <button
                type="button"
                onClick={() => setShowVector((v) => !v)}
                aria-pressed={showVector}
                className={`text-micro border px-3 py-1.5 transition-colors ${
                  showVector
                    ? "border-nominal text-nominal"
                    : "border-rule text-dim hover:text-mid"
                }`}
              >
                DECODED VECTOR
              </button>
            </div>

            <p role="status" aria-live="polite" className="sr-only">
              Frame {frame.id}, {index + 1} of {FRAMES.length}. Lateral error{" "}
              {frame.errCm === null
                ? "beyond the 40 centimetre encoding limit"
                : `${frame.errCm} centimetres`}
              . Scale gap {frame.sigma.toFixed(2)}. {frame.orb.matches} matches
              at {frame.orb.inlier_pct}% inliers.
            </p>

            <p className="text-data text-dim mt-4 max-w-3xl leading-relaxed">
              <span className="text-micro text-mid block">
                WHAT YOU ARE LOOKING AT
              </span>
              Left is the keyframe recorded on the climb; right is the live frame
              on the way down. The blue arrow on the right half was drawn{" "}
              <span className="text-mid">by the flight software, in flight</span>{" "}
              — I did not add it. Because it was drawn at a known 250 pixels per
              metre, it inverts back to the exact lateral correction the
              controller was given, which is where the centimetre figures come
              from. The cyan rings are the real ORB correspondences that survived
              the ratio test and RANSAC. The amber cross is the principal point:
              the flight code aims the correction from there, not from the middle
              of the picture.
            </p>
          </Frame>

          {/* ── the exterior video ─────────────────────────────────────── */}
          <Frame
            id="tr-video"
            code="EXT"
            title="GROUND OBSERVER · THE SAME LANDING"
            tone="data"
            bodyClassName="p-3 sm:p-4"
            aside={<span className="text-micro text-dim tnum">{FOOTAGE.shot}</span>}
          >
            <div className="bg-void relative overflow-hidden">
              <video
                controls
                muted
                loop
                playsInline
                preload="metadata"
                poster={FOOTAGE.poster}
                aria-label={FOOTAGE.caption}
                className="block aspect-video w-full"
              >
                <source src={FOOTAGE.webm} type="video/webm" />
                <source src={FOOTAGE.src} type="video/mp4" />
              </video>
            </div>
            <p className="text-data text-dim mt-3 max-w-3xl leading-relaxed">
              {FOOTAGE.caption} It looks slow because it is:{" "}
              <span className="text-data tnum">{DESCENT_VZ} m/s</span> under
              vision, tapered further whenever match quality drops. The last
              metre is the quick part.
            </p>
          </Frame>
        </div>

        {/* ── ladder + measurement provenance ─────────────────────────── */}
        <div className="grid content-start gap-4 lg:col-span-4">
          <Frame
            id="tr-ladder"
            code="LDR"
            title="ALTITUDE LADDER"
            tone="data"
            aside={
              <span className="text-micro text-dim">
                {reducedMotion ? "STEP MANUALLY" : "HIGH → LOW"}
              </span>
            }
          >
            <ol
              tabIndex={0}
              onKeyDown={onLadderKey}
              aria-label="Recovered frames, highest first. Use arrow keys to step."
              className="focus-visible:outline-signal space-y-1 focus-visible:outline-2"
            >
              {FRAMES.map((f, i) => {
                const active = i === index;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setIndex(i);
                      }}
                      aria-current={active ? "true" : undefined}
                      className={`group flex w-full items-center gap-2 border px-2 py-1 text-left transition-colors ${
                        active
                          ? "border-signal bg-signal/10"
                          : "border-transparent hover:border-rule-hi"
                      }`}
                    >
                      <span
                        className={`text-micro tnum w-7 shrink-0 ${
                          active ? "text-signal" : "text-dim"
                        }`}
                      >
                        {f.id}
                      </span>
                      {/* altitude bar: the measured relative ladder */}
                      <span className="bg-void border-rule relative h-1.5 flex-1 border">
                        <span
                          className={active ? "bg-signal" : "bg-rule-hi"}
                          style={{
                            position: "absolute",
                            inset: 0,
                            right: `${100 - (f.relAlt / FRAMES[0].relAlt) * 100}%`,
                          }}
                        />
                      </span>
                      <span
                        className={`text-micro tnum w-12 shrink-0 text-right ${
                          f.errCm === null
                            ? "text-fault"
                            : f.errCm <= 15
                              ? "text-nominal"
                              : "text-caution"
                        }`}
                      >
                        {f.errCm === null ? "≥40" : f.errCm.toFixed(0)} cm
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="text-micro text-dim mt-3 leading-relaxed">
              BARS ARE RELATIVE ALTITUDE · RIGHT COLUMN IS THE DECODED LATERAL
              ERROR.
            </p>
            <p className="text-data text-dim mt-2 leading-relaxed">
              The correction is{" "}
              <span className="text-mid">converging as it comes down</span>:{" "}
              mean decoded error is{" "}
              <span className="text-caution tnum">{highErr.toFixed(1)} cm</span>{" "}
              across the upper half of the surviving ladder and{" "}
              <span className="text-nominal tnum">{lowErr.toFixed(1)} cm</span>{" "}
              across the lower half, over {measurable.length} measurable frames.
              That is the loop closing, and it is what puts touchdown inside
              15 cm.
            </p>
          </Frame>

          <Frame id="tr-orb" code="SCL" title="WHERE ORB RUNS OUT" tone="signal">
            <ScaleGapChart
              active={index}
              onPick={(i) => {
                setPlaying(false);
                setIndex(i);
              }}
            />

            <dl className="border-rule mt-3 grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <dt className="text-micro text-dim">WIDEST SCALE GAP</dt>
                <dd className="text-fault tnum text-h3 font-display">
                  {Math.min(...FRAMES.map((f) => f.sigma)).toFixed(2)}
                  <span className="text-label text-dim ml-1">σ</span>
                </dd>
              </div>
              <div>
                <dt className="text-micro text-dim">WIDEST EXPOSURE GAP</dt>
                <dd className="text-fault tnum text-h3 font-display">
                  {exposureGap.toFixed(0)}
                  <span className="text-label text-dim ml-1">LUMA</span>
                </dd>
              </div>
            </dl>

            <p className="text-data text-dim mt-3 leading-relaxed">
              This is the argument for{" "}
              <a
                href="#msn-05"
                className="text-signal underline-offset-2 hover:underline"
              >
                MSN-05
              </a>
              . ORB is a binary descriptor on an image pyramid, and it bridges
              neither of the two gaps these frames actually contain: the
              aircraft sitting well above its keyframe, and the sun moving
              between takeoff and landing. The worst pair here has only{" "}
              <span className="text-fault tnum">
                {Math.min(...FRAMES.map((f) => f.orb.matches))} matches
              </span>{" "}
              left. A learned detector–descriptor is aimed at exactly that hole
              — the measurements above are why the project exists rather than a
              guess that it might help.
            </p>
          </Frame>
        </div>

        {/* ── the pipeline ────────────────────────────────────────────── */}
        <div className="lg:col-span-12">
          <Frame
            id="tr-pipeline"
            code="PPL"
            title="THE PIPELINE, IN THE ORDER THE SOFTWARE RUNS IT"
            tone="signal"
            bodyClassName="p-3 sm:p-4"
            aside={
              <span className="text-micro text-dim tnum">
                {stage + 1}/{STAGES.length}
              </span>
            }
          >
            <ol className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {STAGES.map((s, i) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => setStage(i)}
                    aria-current={i === stage ? "step" : undefined}
                    className={`w-full border px-2 py-2 text-left transition-colors ${
                      i === stage
                        ? "border-signal bg-signal/10"
                        : "border-rule hover:border-rule-hi"
                    }`}
                  >
                    <span
                      className={`text-micro tnum block ${
                        i === stage ? "text-signal" : "text-dim"
                      }`}
                    >
                      {s.code}
                    </span>
                    <span
                      className={`text-micro mt-1 block leading-snug ${
                        i === stage ? "text-ink" : "text-dim"
                      }`}
                    >
                      {s.title.split(" — ")[1] ?? s.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="border-rule mt-4 border-t pt-4">
              <MicroLabel className="mb-2">
                {STAGES[stage].code} · {STAGES[stage].title}
              </MicroLabel>
              <p className="text-body text-mid max-w-3xl leading-relaxed">
                {STAGES[stage].body}
              </p>
              <p className="border-signal/40 text-data text-dim mt-3 max-w-3xl border-l-2 pl-3 leading-relaxed">
                {STAGES[stage].note}
              </p>
            </div>
          </Frame>
        </div>

        {/* ── source ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-12">
          <div className="border-rule bg-panel/50 flex flex-wrap items-center gap-3 border p-4">
            <span className="text-micro text-signal">SOURCE</span>
            <span className="text-data text-dim">
              Perception, teach map and landing action server in{" "}
              <code className="text-mid">
                airside/src/nodes/nodes/processor.py
              </code>
              ; the PI velocity controller in{" "}
              <code className="text-mid">controller.py</code>.
            </span>
            {MISSION?.links.map((l) => (
              <LinkChip key={l.href} label={l.label} href={l.href} />
            ))}
            <span className="ml-auto">
              <a
                href="#msn-01"
                className="border-rule text-mid text-micro hover:border-signal hover:text-signal inline-flex items-center gap-2 border px-2.5 py-1.5 transition-colors"
              >
                FULL MISSION LOG · MSN-01
              </a>
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
