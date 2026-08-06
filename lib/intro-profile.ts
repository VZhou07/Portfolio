/* ============================================================================
   ARRIVAL FLIGHT PROFILE
   ----------------------------------------------------------------------------
   The cold-open's timing and its descent, as pure functions. Kept out of the
   components so the pacing is one auditable place and can be tested without a
   DOM — the whole sequence is budgeted, and intro-profile.test.ts fails if an
   edit quietly makes it longer than a visitor will sit through.
   ========================================================================== */

import { clamp } from "@/lib/derive";

/* ── power-on self test (stage one) ─────────────────────────────────────── */
export const POST_STEP_MS = 95; /* one self-test line per tick */
export const POST_HOLD_MS = 320; /* READY held before handover */
export const POST_FADE_MS = 240;

/* ── landing (stage two) ────────────────────────────────────────────────── */
export const BRIEF_MS = 1150; /* mission card, feed already live behind it */
export const DESCENT_MS = 3200; /* ceiling to touchdown */
export const BLANK_MS = 400; /* bare screen after the feed dissolves */
export const COMPLETE_MS = 1250; /* sign-off card, ending in the charge-up */

/** Metres AGL the approach starts from — the same ceiling section 04 uses. */
export const CEILING = 12;

/**
 * Height of the payload camera above the pad at touchdown. The lens cannot get
 * closer than the landing gear allows, so the projection stops closing here
 * instead of diving inside a single tag cell. Real pipelines lose the tag at
 * about this point for exactly this reason.
 */
export const CAM_FLOOR = 0.45;

/** The window the feed opens in, as a % inset, before it fills the screen. */
export const FRAME_X = 11;
export const FRAME_Y = 23;

/** Altitudes the frame grows between. */
const GROW_FROM = 9;
const GROW_TO = 1.2;
/** Altitudes the readouts and the skip chip fade out between. */
const HUD_FROM = 2.4;
const HUD_TO = 0.9;
/** Altitudes the feed dissolves into the deck colour between. */
const FEED_FROM = 0.5;
const FEED_TO = 0.05;

/** 0..1 with eased ends — every ramp below is shaped with this. */
export function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Altitude AGL at a given point in the descent. (1-p)^1.8 falls away fast and
 * slows into the flare, which is the shape of an autoland profile rather than a
 * linear slider.
 */
export function altitudeAt(ms: number): number {
  const p = clamp(ms / DESCENT_MS, 0, 1);
  return CEILING * Math.pow(1 - p, 1.8);
}

/** Same gates section 04 uses, so the phase names mean the same thing. */
export function phaseOf(alt: number): string {
  if (alt > 6) return "TRANSIT";
  if (alt > 2) return "APPROACH";
  if (alt > 0.3) return "FLARE";
  return "TOUCHDOWN";
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
