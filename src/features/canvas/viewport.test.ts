// src/features/canvas/viewport.test.ts
import { MIN_ZOOM, MAX_ZOOM, clampZoom } from "@/src/features/canvas/viewport";

describe("clampZoom", () => {
  it("returns the zoom unchanged when in bounds", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(2)).toBe(2);
  });

  it("clamps below MIN_ZOOM up to MIN_ZOOM", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
    expect(clampZoom(MIN_ZOOM / 2)).toBe(MIN_ZOOM);
  });

  it("clamps above MAX_ZOOM down to MAX_ZOOM", () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(MAX_ZOOM * 2)).toBe(MAX_ZOOM);
  });

  it("treats NaN as MIN_ZOOM (never produces NaN)", () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
  });

  it("exposes sane bounds", () => {
    expect(MIN_ZOOM).toBeGreaterThan(0);
    expect(MAX_ZOOM).toBeGreaterThan(MIN_ZOOM);
  });
});
