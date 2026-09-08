import { describe, expect, it } from "vitest";
import {
  altitudeAt,
  CAM_FLOOR,
  CEILING,
  DESCENT_MS,
  feedFade,
  frameGrow,
  handedOff,
  HANDOFF,
  hudFade,
  introDuration,
  phaseOf,
  postDuration,
  smoothstep,
  VISION_FRACTION,
} from "./intro-profile";
import { LAND_HANDOFF_M, TEACH_TOP_M } from "./orb-render";

/** Number of lines probe() reports in the power-on self test. */
const POST_LINES = 9;

describe("descent profile", () => {
  it("flies between the two heights the flight software actually uses", () => {
    expect(CEILING).toBe(TEACH_TOP_M);
    expect(HANDOFF).toBe(LAND_HANDOFF_M);
  });

  it("starts at the ceiling and reaches the ground exactly on time", () => {
    expect(altitudeAt(0)).toBe(CEILING);
    expect(altitudeAt(DESCENT_MS)).toBeCloseTo(0, 6);
    expect(altitudeAt(DESCENT_MS * 2)).toBeCloseTo(0, 6);
  });

  it("never climbs", () => {
    let prev = Infinity;
    for (let i = 0; i <= 120; i += 1) {
      const a = altitudeAt((DESCENT_MS * i) / 120);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it("hands over to the autopilot at exactly the handoff height", () => {
    expect(altitudeAt(DESCENT_MS * VISION_FRACTION)).toBeCloseTo(HANDOFF, 6);
    /* just above the handoff vision still owns it; just below it does not */
    expect(handedOff(altitudeAt(DESCENT_MS * (VISION_FRACTION - 0.02)))).toBe(false);
    expect(handedOff(altitudeAt(DESCENT_MS * (VISION_FRACTION + 0.02)))).toBe(true);
  });

  it("gives vision most of the descent and the autopilot the last metre", () => {
    /* vision covers ceiling -> handoff, which is the bulk of the height */
    const visionDrop = CEILING - HANDOFF;
    expect(visionDrop).toBeGreaterThan(HANDOFF * 4);
    expect(VISION_FRACTION).toBeGreaterThan(0.6);
    expect(VISION_FRACTION).toBeLessThan(0.9);
  });

  it("eases out of the ceiling rather than dropping like a stone", () => {
    const sixth = DESCENT_MS / 6;
    const first = altitudeAt(0) - altitudeAt(sixth);
    const middle = altitudeAt(sixth * 2) - altitudeAt(sixth * 3);
    expect(first).toBeLessThan(middle);
  });

  it("spends real time below the handoff, so touchdown reads as a landing", () => {
    let ms = 0;
    while (ms < DESCENT_MS && altitudeAt(ms) > HANDOFF) ms += 10;
    expect(DESCENT_MS - ms).toBeGreaterThan(400);
  });
});

describe("phase gates", () => {
  it("names the states the flight software moves through", () => {
    expect(phaseOf(CEILING)).toBe("REPEAT");
    expect(phaseOf(4.01)).toBe("REPEAT");
    expect(phaseOf(4)).toBe("ALIGN");
    expect(phaseOf(HANDOFF + 0.01)).toBe("ALIGN");
    expect(phaseOf(HANDOFF)).toBe("LAND MODE");
    expect(phaseOf(0.06)).toBe("LAND MODE");
    expect(phaseOf(0.05)).toBe("ON GROUND");
    expect(phaseOf(0)).toBe("ON GROUND");
  });

  it("agrees with handedOff about who is flying", () => {
    expect(handedOff(HANDOFF + 0.01)).toBe(false);
    expect(handedOff(HANDOFF)).toBe(true);
    expect(handedOff(0)).toBe(true);
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
    expect(frameGrow(6)).toBe(0);
    expect(frameGrow(3.5)).toBeGreaterThan(0);
    expect(frameGrow(3.5)).toBeLessThan(1);
    expect(frameGrow(1.2)).toBe(1);
    expect(frameGrow(0)).toBe(1);
  });

  it("clears the HUD before touchdown, so the bang lands on a bare screen", () => {
    expect(hudFade(CEILING)).toBe(1);
    expect(hudFade(1.6)).toBe(1);
    expect(hudFade(0.6)).toBe(0);
    expect(hudFade(0)).toBe(0);
    /* the readouts must be gone before the feed itself starts dissolving */
    expect(hudFade(0.45)).toBe(0);
  });

  it("dissolves the feed only at the very end", () => {
    expect(feedFade(CEILING)).toBe(1);
    expect(feedFade(0.45)).toBe(1);
    expect(feedFade(0.05)).toBe(0);
    expect(feedFade(0)).toBe(0);
  });

  it("keeps the camera above the gear without freezing the image early", () => {
    /* the camera floor must be below the altitudes the fade covers, or the
       image would freeze before it filled the screen */
    expect(CAM_FLOOR).toBeLessThan(0.45);
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
