/* ============================================================================
   ARRIVAL FLIGHT PROFILE
   ----------------------------------------------------------------------------
   The cold-open's timing and its descent, as pure functions. Kept out of the
   components so the pacing is one auditable place and can be tested without a
   DOM — the whole sequence is budgeted, and intro-profile.test.ts fails if an
   edit quietly makes it longer than a visitor will sit through.

   The descent flown here is the teach-and-repeat landing: vision guides the
   aircraft from the top of the teach ladder down to the LAND-mode handoff, and
   the autopilot owns the last metre. Both of those heights are the real
   constants from the flight software — see lib/orb-render.ts.

   It is flown as legs, not as one curve. The pauses between them — acquire,
   re-match, the handoff — are what make it read as a landing.
   ========================================================================== */

import { clamp } from "@/lib/derive";
import { LAND_HANDOFF_M, TEACH_TOP_M } from "@/lib/orb-render";

/* ── power-on self test (stage one) ─────────────────────────────────────── */
export const POST_STEP_MS = 95; /* one self-test line per tick */
export const POST_HOLD_MS = 320; /* READY held before handover */
export const POST_FADE_MS = 240;

/* ── landing (stage two) ────────────────────────────────────────────────── */
export const BRIEF_MS = 1600; /* lower-third over a live hover, then brakes off */
export const BLANK_MS = 400; /* bare screen after the feed dissolves */
export const COMPLETE_MS = 1150; /* sign-off card, ending in the charge-up */

/**
 * Failsafe for the overlay and the inline gate in app/layout.tsx. Must clear
 * introDuration by a few seconds so a slow tab still finishes the landing
 * before anything yanks the visitor out.
 */
export const WATCHDOG_MS = 24000;

/** Metres AGL the approach starts from — the top of the teach ladder. */
export const CEILING = TEACH_TOP_M;

/** Height the autopilot's LAND mode takes over at. */
export const HANDOFF = LAND_HANDOFF_M;

/**
 * Height of the payload camera above the ground at touchdown. The lens cannot
 * get closer than the landing gear allows, so the projection stops closing
 * here instead of diving inside a single grain of aggregate.
 */
export const CAM_FLOOR = 0.3;

/** Bezel around the payload feed, as a % inset, before it fills the screen.
 *  Kept tight so the first frame already reads as a camera, not a letterbox. */
export const FRAME_X = 5;
export const FRAME_Y = 8;

/** Altitudes the frame grows between. Opens with the whole descent so the
 *  bezel never punches in faster than the lens itself is closing. */
const GROW_FROM = CEILING;
const GROW_TO = 1.2;
/** Altitudes the readouts and the skip chip fade out between. The HUD has to
    survive the handoff hold — that beat is only legible if you can read the
    mode change — so it clears well below it, and above the feed's own fade. */
const HUD_FROM = 0.95;
const HUD_TO = 0.5;
/** Altitudes the feed dissolves into the deck colour between. */
const FEED_FROM = 0.45;
const FEED_TO = 0.05;

/** 0..1 with eased ends — every ramp below is shaped with this. */
export function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/* ── the approach, leg by leg ───────────────────────────────────────────── */

/**
 * How a leg gets from one height to the next.
 *
 *   hold     station-keeping. The altitude does not change at all.
 *   creep    a slow constant bleed — a commanded vertical speed, held.
 *   fall     eased both ends: the controller opening up and then arresting.
 *   settle   eased out only — arriving on a height and stopping on it.
 *   contact  eased in — the last centimetres, gear taking the weight.
 */
type Ease = "hold" | "creep" | "fall" | "settle" | "contact";

function shape(ease: Ease, t: number): number {
  switch (ease) {
    case "hold":
      return 0;
    case "creep":
      return t;
    case "fall":
      return smoothstep(t);
    case "settle":
      return 1 - (1 - t) * (1 - t);
    case "contact":
      return t * t;
  }
}

/**
 * The approach as the flight software flies it, rather than as one long fall.
 * A vision-guided descent is not continuous: it steps down the teach ladder,
 * stops on each new keyframe to re-match and pull the correction back inside
 * the alignment cone, and only opens the descent up again once it is there.
 * Those pauses are the whole character of the manoeuvre — without them it
 * reads as a zoom rather than as a landing.
 */
const APPROACH: readonly { ms: number; to: number; ease: Ease }[] = [
  { ms: 1000, to: CEILING, ease: "hold" } /* acquire — watch the hover breathe */,
  { ms: 1800, to: 5.4, ease: "fall" },
  { ms: 700, to: 5.4, ease: "hold" } /* re-match, close the cone */,
  { ms: 1800, to: 3.1, ease: "fall" },
  { ms: 700, to: 3.1, ease: "hold" },
  { ms: 1500, to: 1.55, ease: "fall" },
  { ms: 900, to: HANDOFF, ease: "settle" } /* arrive on the handoff height */,
  { ms: 650, to: HANDOFF, ease: "hold" } /* vision cold, LAND taking it */,
  { ms: 2200, to: 0.34, ease: "creep" } /* LAND mode, a slow commanded VZ */,
  { ms: 900, to: 0, ease: "contact" },
];

interface Leg {
  at: number;
  ms: number;
  from: number;
  to: number;
  ease: Ease;
}

const LEGS: Leg[] = (() => {
  const out: Leg[] = [];
  let at = 0;
  let from = CEILING;
  for (const leg of APPROACH) {
    out.push({ at, ms: leg.ms, from, to: leg.to, ease: leg.ease });
    at += leg.ms;
    from = leg.to;
  }
  return out;
})();

/** Top of the teach ladder to touchdown. The sum of the legs above. */
export const DESCENT_MS = LEGS.reduce((n, leg) => n + leg.ms, 0);

/**
 * Fraction of the descent that vision owns, derived rather than declared.
 * Above the handoff the correction is computed from matched features; below it
 * ArduPilot's LAND mode is flying and the vision overlay goes cold, which is
 * exactly what the real pipeline does.
 */
export const VISION_FRACTION = (() => {
  const leg = LEGS.find((l) => l.to <= HANDOFF);
  return leg ? (leg.at + leg.ms) / DESCENT_MS : 1;
})();

/** Altitude AGL at a given point in the descent. */
export function altitudeAt(ms: number): number {
  if (!(ms > 0)) return CEILING;
  if (ms >= DESCENT_MS) return 0;
  for (const leg of LEGS) {
    if (ms >= leg.at + leg.ms) continue;
    const t = (ms - leg.at) / leg.ms;
    return leg.from + (leg.to - leg.from) * shape(leg.ease, t);
  }
  return 0;
}

/**
 * Vertical speed at a point in the descent, m/s, positive downwards — the VS
 * the ground station would be showing. Sampled as a central difference so the
 * readout eases across a leg boundary instead of snapping to the new rate.
 */
export function descentRateAt(ms: number): number {
  const h = 40;
  return Math.max(0, ((altitudeAt(ms - h) - altitudeAt(ms + h)) * 500) / h);
}

/** True once the autopilot, not the vision pipeline, owns the descent. */
export function handedOff(alt: number): boolean {
  return alt <= HANDOFF;
}

/**
 * Phase names, matching the states the flight software actually moves through:
 * matching against the upper teach rungs, closing the alignment cone, then the
 * handoff to the autopilot and ground confirmation.
 */
export function phaseOf(alt: number): string {
  if (alt > 4) return "REPEAT";
  if (alt > HANDOFF) return "ALIGN";
  if (alt > 0.05) return "LAND MODE";
  return "ON GROUND";
}

/** 0 = the feed sits in its window, 1 = it has taken the whole screen. */
export function frameGrow(alt: number): number {
  return smoothstep((GROW_FROM - alt) / (GROW_FROM - GROW_TO));
}

/** 1 = readouts and skip chip visible, 0 = faded out for touchdown. */
export function hudFade(alt: number): number {
  return 1 - smoothstep((HUD_FROM - alt) / (HUD_FROM - HUD_TO));
}

/** 1 = feed at full opacity, 0 = dissolved into the deck colour. */
export function feedFade(alt: number): number {
  return 1 - smoothstep((FEED_FROM - alt) / (FEED_FROM - FEED_TO));
}

/**
 * Self-test duration for a given number of probed lines. The chain waits one
 * tick before the first line, so a nine-line test is ten ticks long.
 */
export function postDuration(lines: number): number {
  return (lines + 1) * POST_STEP_MS + POST_HOLD_MS + POST_FADE_MS;
}

/** Power-on to shockwave, in ms. The number the pacing is budgeted against. */
export function introDuration(lines: number): number {
  return postDuration(lines) + BRIEF_MS + DESCENT_MS + BLANK_MS + COMPLETE_MS;
}
