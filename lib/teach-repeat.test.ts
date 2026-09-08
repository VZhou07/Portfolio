import { describe, expect, it } from "vitest";
import {
  alignTolerance,
  ALIGN_FLOOR_M,
  ALIGN_RATIO,
  descentTaper,
  LAND_HANDOFF_M,
  modelledMatches,
  TEACH_RUNG_M,
  TEACH_TOP_M,
  teachRungFor,
} from "./orb-render";
import { FRAMES, framePath, TEACH_REPEAT } from "./teach-repeat";

/**
 * lib/teach-repeat.ts is generated from the recovered flight frames by
 * tmp/export_frames.py. These assertions are the contract the section relies on,
 * so a bad regeneration fails here instead of rendering wrong numbers.
 */
describe("recovered flight frames", () => {
  it("has every frame that survived the carve", () => {
    expect(FRAMES).toHaveLength(TEACH_REPEAT.recovery.uniqueFrames);
    expect(TEACH_REPEAT.recovery.uniqueFrames).toBe(12);
    expect(TEACH_REPEAT.recovery.filesCarved).toBeGreaterThan(
      TEACH_REPEAT.recovery.uniqueFrames,
    );
    expect(FRAMES.map((f) => f.id)).toEqual([
      "f01", "f02", "f03", "f04", "f05", "f06",
      "f07", "f08", "f09", "f10", "f11", "f12",
    ]);
  });

  it("is ordered as a descent, highest frame first", () => {
    for (let i = 1; i < FRAMES.length; i += 1) {
      expect(FRAMES[i].relAlt).toBeLessThanOrEqual(FRAMES[i - 1].relAlt);
    }
    /* the ladder is normalised against the lowest surviving frame */
    expect(FRAMES[FRAMES.length - 1].relAlt).toBeCloseTo(1, 6);
  });

  it("keeps the teach keyframe below the aircraft, as the map lookup does", () => {
    for (const f of FRAMES) {
      expect(f.relTeachAlt).toBeLessThan(f.relAlt);
      expect(f.sigma).toBeCloseTo(f.relTeachAlt / f.relAlt, 3);
      expect(f.sigma).toBeGreaterThan(0);
      expect(f.sigma).toBeLessThan(1);
    }
  });

  it("re-derives the lateral error from the arrow the flight code drew", () => {
    const { width, height } = TEACH_REPEAT.intrinsics;
    for (const f of FRAMES) {
      if (f.clamped) {
        expect(f.errCm).toBeNull();
        continue;
      }
      expect(f.errCm).not.toBeNull();
      /* the overlay was drawn at 250 px per metre */
      const px = Math.hypot(f.arrow.dx * width, f.arrow.dy * height);
      expect((px / 250) * 100).toBeCloseTo(f.errCm as number, 1);
    }
  });

  it("clamps exactly the frames that ran past the 0.40 m encoding limit", () => {
    const clamped = FRAMES.filter((f) => f.clamped);
    expect(clamped).toHaveLength(1);
    /* a clamped arrow pins its long axis at 100 px of the 1279 px frame */
    const f = clamped[0];
    const { width, height } = TEACH_REPEAT.intrinsics;
    const axis = Math.max(Math.abs(f.arrow.dx * width), Math.abs(f.arrow.dy * height));
    expect(axis).toBeGreaterThan(98);
    expect(axis).toBeLessThan(102);
  });

  it("keeps every annotation inside the frame it is drawn on", () => {
    for (const f of FRAMES) {
      const tipX = TEACH_REPEAT.principal.x + f.arrow.dx;
      const tipY = TEACH_REPEAT.principal.y + f.arrow.dy;
      expect(tipX).toBeGreaterThanOrEqual(0);
      expect(tipX).toBeLessThanOrEqual(1);
      expect(tipY).toBeGreaterThanOrEqual(0);
      expect(tipY).toBeLessThanOrEqual(1);

      for (const m of f.matches) {
        expect(m).toHaveLength(4);
        for (const v of m) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("only exports correspondences that actually survived RANSAC", () => {
    for (const f of FRAMES) {
      expect(f.matches.length).toBeGreaterThan(0);
      expect(f.matches.length).toBeLessThanOrEqual(f.orb.inliers);
      expect(f.orb.inliers).toBeLessThanOrEqual(f.orb.matches);
      expect(f.orb.inlier_pct).toBeGreaterThanOrEqual(0);
      expect(f.orb.inlier_pct).toBeLessThanOrEqual(100);
    }
  });

  it("carries the scale-gap finding the CNN work is argued from", () => {
    const wide = FRAMES.filter((f) => f.sigma < 0.7);
    const narrow = FRAMES.filter((f) => f.sigma >= 0.8);
    expect(wide.length).toBeGreaterThan(0);
    expect(narrow.length).toBeGreaterThan(0);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    /* the whole point: a wider scale gap starves the matcher */
    expect(mean(wide.map((f) => f.orb.matches))).toBeLessThan(
      mean(narrow.map((f) => f.orb.matches)),
    );
  });

  it("proves the halves are the calibration's undistorted crop", () => {
    expect(TEACH_REPEAT.intrinsics.width).toBe(1279);
    expect(TEACH_REPEAT.intrinsics.height).toBe(719);
    /* the principal point is off-centre, which is why the reticle is too */
    expect(TEACH_REPEAT.principal.x).not.toBeCloseTo(0.5, 2);
  });

  it("points at assets that exist under a stable path", () => {
    expect(framePath("f01", "teach")).toBe("/media/teach-repeat/f01-teach.webp");
    expect(framePath("f12", "repeat")).toBe("/media/teach-repeat/f12-repeat.webp");
  });
});

describe("flight constants", () => {
  it("mirrors the alignment cone the flight software applies", () => {
    /* tolerance = max(MIN_ALIGN_TOLERANCE_M, ALIGN_TOLERANCE_RATIO * agl) */
    expect(alignTolerance(4)).toBeCloseTo(ALIGN_RATIO * 4, 6);
    expect(alignTolerance(0.1)).toBe(ALIGN_FLOOR_M);
    /* the floor takes over below 1/3 of a metre */
    expect(alignTolerance(ALIGN_FLOOR_M / ALIGN_RATIO)).toBeCloseTo(ALIGN_FLOOR_M, 6);
  });

  it("tapers descent authority instead of hard-gating it", () => {
    const agl = 4;
    const tol = alignTolerance(agl);
    expect(descentTaper(0, agl)).toBe(1);
    expect(descentTaper(tol, agl)).toBe(1);
    expect(descentTaper(tol * 1.5, agl)).toBeCloseTo(0.5, 6);
    expect(descentTaper(tol * 2, agl)).toBe(0);
    expect(descentTaper(tol * 5, agl)).toBe(0);
  });

  it("selects the teach rung at or below the aircraft", () => {
    expect(teachRungFor(3.1)).toBeCloseTo(3.0, 6);
    expect(teachRungFor(3.0)).toBeCloseTo(3.0, 6);
    expect(teachRungFor(2.99)).toBeCloseTo(2.75, 6);
    /* never above the top of the ladder, never below its first rung */
    expect(teachRungFor(99)).toBe(TEACH_TOP_M);
    expect(teachRungFor(0.01)).toBe(TEACH_RUNG_M);
    for (const agl of [1.2, 2.6, 4.4, 7.4]) {
      expect(teachRungFor(agl)).toBeLessThanOrEqual(agl);
    }
  });

  it("models match count falling away with the scale gap", () => {
    expect(modelledMatches(0.9)).toBeGreaterThan(modelledMatches(0.6));
    expect(modelledMatches(0.6)).toBeGreaterThan(modelledMatches(0.45));
    expect(modelledMatches(0.35)).toBe(0);
    expect(modelledMatches(0.1)).toBe(0);
  });

  it("hands over above the ground, not at it", () => {
    expect(LAND_HANDOFF_M).toBeGreaterThan(0);
    expect(LAND_HANDOFF_M).toBeLessThan(TEACH_TOP_M);
  });
});
