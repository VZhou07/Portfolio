import { describe, expect, it } from "vitest";
import {
  altitudeAt,
  CAM_FLOOR,
  CEILING,
  descentRateAt,
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
  WATCHDOG_MS,
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
    expect(DESCENT_MS - ms).toBeGreaterThan(3000);
  });

  /* The pauses are the manoeuvre. A descent that never stops to re-match is a
     zoom with numbers on it, so guard the shape, not just the endpoints. */
  it("holds still several times on the way down", () => {
    const holds: number[] = [];
    let run = 0;
    for (let ms = 0; ms <= DESCENT_MS; ms += 20) {
      if (descentRateAt(ms) < 0.05) {
        run += 20;
      } else {
        if (run > 0) holds.push(run);
        run = 0;
      }
    }
    if (run > 0) holds.push(run);

    /* acquire at the ceiling, two re-matches, and the handoff */
    expect(holds.filter((ms) => ms >= 200).length).toBeGreaterThanOrEqual(4);
  });

  it("stops dead on the handoff height before the autopilot takes it", () => {
    const at = DESCENT_MS * VISION_FRACTION;
    expect(altitudeAt(at)).toBeCloseTo(HANDOFF, 6);
    /* still on it a beat later: that pause is the mode change */
    expect(altitudeAt(at + 300)).toBeCloseTo(HANDOFF, 6);
    expect(descentRateAt(at + 200)).toBeCloseTo(0, 6);
  });

  it("is slow enough to read as a landing rather than a fall", () => {
    /* the payload camera has to have time to close — an average over 0.8 m/s
       is still a drop, whatever the easing does */
    expect((CEILING / DESCENT_MS) * 1000).toBeLessThan(0.8);
  });

  it("flies the last metre as a slow LAND-mode creep", () => {
    let ms = 0;
    while (ms < DESCENT_MS && altitudeAt(ms) > 0.7) ms += 10;
    expect(altitudeAt(ms)).toBeLessThan(HANDOFF);
    expect(descentRateAt(ms)).toBeGreaterThan(0.15);
    expect(descentRateAt(ms)).toBeLessThan(0.45);
  });
});

describe("vertical speed", () => {
  it("is zero before brake release and after touchdown", () => {
    expect(descentRateAt(0)).toBeCloseTo(0, 6);
    expect(descentRateAt(-500)).toBeCloseTo(0, 6);
    expect(descentRateAt(DESCENT_MS + 500)).toBeCloseTo(0, 6);
  });

  it("accounts for the whole descent, holds included", () => {
    let travelled = 0;
    for (let ms = 0; ms < DESCENT_MS; ms += 5) {
      travelled += descentRateAt(ms + 2.5) * 0.005;
    }
    expect(travelled).toBeCloseTo(CEILING, 1);
  });

  it("never reports a climb", () => {
    for (let ms = -200; ms <= DESCENT_MS + 200; ms += 25) {
      expect(descentRateAt(ms)).toBeGreaterThanOrEqual(0);
    }
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
    /* the bezel tracks the whole descent, so it has already moved at 6 m */
    expect(frameGrow(6)).toBeGreaterThan(0);
    expect(frameGrow(6)).toBeLessThan(1);
    expect(frameGrow(3.5)).toBeGreaterThan(0);
    expect(frameGrow(3.5)).toBeLessThan(1);
    expect(frameGrow(1.2)).toBe(1);
    expect(frameGrow(0)).toBe(1);
  });

  it("clears the HUD before touchdown, so the bang lands on a bare screen", () => {
    expect(hudFade(CEILING)).toBe(1);
    expect(hudFade(1.6)).toBe(1);
    expect(hudFade(0.5)).toBe(0);
    expect(hudFade(0)).toBe(0);
    /* the readouts must survive the handoff hold — the mode change is only
       legible if you can still read the phase — and be gone before the feed
       itself starts dissolving */
    expect(hudFade(HANDOFF)).toBe(1);
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
  it("gives the camera time to fly the landing before the shockwave", () => {
    const total = introDuration(POST_LINES);
    expect(total).toBe(16810);
    /* long enough to read as a precision landing, short enough that skip
       is a courtesy rather than a necessity — and it has to clear the
       watchdog in intro-stage.tsx / the inline gate */
    expect(total).toBeGreaterThan(14000);
    expect(total).toBeLessThan(20000);
    expect(WATCHDOG_MS).toBeGreaterThan(total + 4000);
  });

  it("keeps the self test short relative to the landing", () => {
    expect(postDuration(POST_LINES)).toBeLessThan(introDuration(POST_LINES) / 4);
  });
});
