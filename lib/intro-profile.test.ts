import { describe, expect, it } from "vitest";
import {
  altitudeAt,
  CAM_FLOOR,
  CEILING,
  DESCENT_MS,
  feedFade,
  frameGrow,
  hudFade,
  introDuration,
  phaseOf,
  postDuration,
  smoothstep,
} from "./intro-profile";

/** Number of lines probe() reports in the power-on self test. */
const POST_LINES = 9;

describe("descent profile", () => {
  it("starts at the ceiling and reaches the ground exactly on time", () => {
    expect(altitudeAt(0)).toBe(CEILING);
    expect(altitudeAt(DESCENT_MS)).toBeCloseTo(0, 6);
    expect(altitudeAt(DESCENT_MS * 2)).toBeCloseTo(0, 6);
  });

  it("never climbs", () => {
    let prev = Infinity;
    for (let i = 0; i <= 60; i += 1) {
      const a = altitudeAt((DESCENT_MS * i) / 60);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it("flares: the last third descends slower than the first third", () => {
    const third = DESCENT_MS / 3;
    const early = altitudeAt(0) - altitudeAt(third);
    const late = altitudeAt(third * 2) - altitudeAt(DESCENT_MS);
    expect(late).toBeLessThan(early);
  });

  it("spends real time close to the ground, where the tag fills the frame", () => {
    /* the tag exceeds the frame width below ~0.5 m; that moment should last
       long enough to read as a landing, not a cut */
    let ms = 0;
    while (ms < DESCENT_MS && altitudeAt(ms) > 0.5) ms += 10;
    expect(DESCENT_MS - ms).toBeGreaterThan(400);
  });
});

describe("phase gates", () => {
  it("names the phases at the same altitudes section 04 does", () => {
    expect(phaseOf(CEILING)).toBe("TRANSIT");
    expect(phaseOf(6.01)).toBe("TRANSIT");
    expect(phaseOf(6)).toBe("APPROACH");
    expect(phaseOf(2.01)).toBe("APPROACH");
    expect(phaseOf(2)).toBe("FLARE");
    expect(phaseOf(0.31)).toBe("FLARE");
    expect(phaseOf(0.3)).toBe("TOUCHDOWN");
    expect(phaseOf(0)).toBe("TOUCHDOWN");
  });
});

describe("ramps", () => {
  it("smoothstep is clamped and eased", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
  });

  it("opens the window from framed to fullscreen as it descends", () => {
    expect(frameGrow(CEILING)).toBe(0);
    expect(frameGrow(9)).toBe(0);
    expect(frameGrow(5)).toBeGreaterThan(0);
    expect(frameGrow(5)).toBeLessThan(1);
    expect(frameGrow(1.2)).toBe(1);
    expect(frameGrow(0)).toBe(1);
  });

  it("clears the HUD before touchdown, so the bang lands on a bare screen", () => {
    expect(hudFade(CEILING)).toBe(1);
    expect(hudFade(2.4)).toBe(1);
    expect(hudFade(0.9)).toBe(0);
    expect(hudFade(0)).toBe(0);
    /* the readouts must be gone before the feed itself starts dissolving */
    expect(hudFade(0.5)).toBe(0);
  });

  it("dissolves the feed only at the very end", () => {
    expect(feedFade(CEILING)).toBe(1);
    expect(feedFade(0.5)).toBe(1);
    expect(feedFade(0.05)).toBe(0);
    expect(feedFade(0)).toBe(0);
  });

  it("still shows the tag when the feed dissolves", () => {
    /* the camera floor must be below the altitudes the fade covers, or the
       image would freeze before it filled the screen */
    expect(CAM_FLOOR).toBeLessThan(0.5);
    expect(frameGrow(CAM_FLOOR)).toBe(1);
  });
});

describe("pacing budget", () => {
  it("reaches the shockwave in about 7.5 s", () => {
    const total = introDuration(POST_LINES);
    expect(total).toBe(7510);
    expect(total).toBeGreaterThan(7000);
    expect(total).toBeLessThan(8000);
  });

  it("keeps the self test short relative to the landing", () => {
    expect(postDuration(POST_LINES)).toBeLessThan(introDuration(POST_LINES) / 4);
  });
});
