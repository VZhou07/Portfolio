import { describe, expect, it } from "vitest";
import {
  approachOffset,
  tagConfidence,
  tagPixels,
  windOffset,
} from "./sim-render";

/** Lateral error the ALIGNED gate accepts, metres — matches sections/approach. */
const ALIGN_GATE = 0.2;

const err = (o: { x: number; y: number }) => Math.hypot(o.x, o.y);

describe("approach geometry", () => {
  it("converges onto the pad centre at touchdown", () => {
    expect(err(approachOffset(0))).toBeCloseTo(0, 6);
    expect(err(approachOffset(12))).toBeGreaterThan(0.5);
  });

  it("projects the tag larger as the camera descends", () => {
    expect(tagPixels(1, 500)).toBeGreaterThan(tagPixels(4, 500));
    expect(tagPixels(4, 500)).toBeGreaterThan(tagPixels(12, 500));
  });

  it("reports nothing until the tag is big enough to resolve", () => {
    expect(tagConfidence(12, 5)).toBe(0);
    const high = tagConfidence(10, tagPixels(10, 500));
    const low = tagConfidence(2, tagPixels(2, 500));
    expect(low).toBeGreaterThan(high);
  });
});

describe("crosswind injection", () => {
  it("is a no-op when the air is calm", () => {
    for (const alt of [12, 6, 2, 0.5, 0]) {
      expect(windOffset(alt, 0)).toEqual(approachOffset(alt));
    }
  });

  it("leaves a touchdown error that grows with the wind", () => {
    expect(err(windOffset(0, 2))).toBeLessThan(err(windOffset(0, 4)));
    expect(err(windOffset(0, 4))).toBeLessThan(err(windOffset(0, 6)));
  });

  it("fails the aligned gate past about 4 m/s, as the panel claims", () => {
    expect(err(windOffset(0, 3.5))).toBeLessThan(ALIGN_GATE);
    expect(err(windOffset(0, 4.5))).toBeGreaterThan(ALIGN_GATE);
  });

  it("is trimmed out more the closer it gets to the ground", () => {
    const high = Math.abs(windOffset(12, 5).x - approachOffset(12).x);
    const low = Math.abs(windOffset(0, 5).x - approachOffset(0).x);
    expect(high).toBeGreaterThan(low);
  });

  it("pushes both axes, so the error is not a straight line", () => {
    const o = windOffset(6, 5);
    const base = approachOffset(6);
    expect(o.x).not.toBeCloseTo(base.x, 3);
    expect(o.y).not.toBeCloseTo(base.y, 3);
  });
});
