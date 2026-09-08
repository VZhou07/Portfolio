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
   ========================================================================== */

import { clamp } from "@/lib/derive";
import { LAND_HANDOFF_M, TEACH_TOP_M } from "@/lib/orb-render";

/* ── power-on self test (stage one) ─────────────────────────────────────── */
export const POST_STEP_MS = 95; /* one self-test line per tick */
export const POST_HOLD_MS = 320; /* READY held before handover */
export const POST_FADE_MS = 240;

/* ── landing (stage two) ────────────────────────────────────────────────── */
export const BRIEF_MS = 1000; /* mission card, feed already live behind it */
export const DESCENT_MS = 3500; /* top of the teach ladder to touchdown */
export const BLANK_MS = 350; /* bare screen after the feed dissolves */
export const COMPLETE_MS = 1150; /* sign-off card, ending in the charge-up */

/** Metres AGL the approach starts from — the top of the teach ladder. */
export const CEILING = TEACH_TOP_M;

/** Height the autopilot's LAND mode takes over at. */
export const HANDOFF = LAND_HANDOFF_M;

/**
 * Fraction of the descent that vision owns. Above the handoff the correction is
 * computed from matched features; below it ArduPilot's LAND mode is flying and
 * the vision overlay goes cold, which is exactly what the real pipeline does.
 */
export const VISION_FRACTION = 0.76;

/**
 * Height of the payload camera above the ground at touchdown. The lens cannot
 * get closer than the landing gear allows, so the projection stops closing
 * here instead of diving inside a single grain of aggregate.
 */
export const CAM_FLOOR = 0.4;

/** The window the feed opens in, as a % inset, before it fills the screen. */
export const FRAME_X = 11;
export const FRAME_Y = 23;

/** Altitudes the frame grows between. */
const GROW_FROM = 6;
const GROW_TO = 1.2;
/** Altitudes the readouts and the skip chip fade out between. */
const HUD_FROM = 1.6;
const HUD_TO = 0.6;
/** Altitudes the feed dissolves into the deck colour between. */
const FEED_FROM = 0.45;
const FEED_TO = 0.05;

/** 0..1 with eased ends — every ramp below is shaped with this. */
export function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Altitude AGL at a given point in the descent. Two segments, because the real
 * descent has two owners: an eased vision-guided fall from the ladder top to
 * the handoff height, then LAND mode taking the last metre at a steady rate.
 */
export function altitudeAt(ms: number): number {
  const p = clamp(ms / DESCENT_MS, 0, 1);
  if (p <= VISION_FRACTION) {
    const q = p / VISION_FRACTION;
    return CEILING - (CEILING - HANDOFF) * smoothstep(q);
  }
  const q = (p - VISION_FRACTION) / (1 - VISION_FRACTION);
  return HANDOFF * (1 - q);
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
