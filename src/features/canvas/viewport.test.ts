// src/features/canvas/viewport.test.ts
import {
  MIN_ZOOM,
  MAX_ZOOM,
  clampZoom,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "@/src/features/canvas/viewport";

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

describe("screenToWorld / worldToScreen", () => {
  it("maps screen origin to viewport world origin at zoom 1", () => {
    const vp = { x: 100, y: 50, zoom: 1 };
    expect(screenToWorld({ x: 0, y: 0 }, vp)).toEqual({ x: 100, y: 50 });
  });

  it("accounts for zoom when converting screen->world", () => {
    const vp = { x: 0, y: 0, zoom: 2 };
    // 200 screen px at 2x = 100 world units.
    expect(screenToWorld({ x: 200, y: 100 }, vp)).toEqual({ x: 100, y: 50 });
  });

  it("worldToScreen is the inverse of screenToWorld", () => {
    const vp = { x: -30, y: 75, zoom: 1.5 };
    const screen = { x: 320, y: 240 };
    const world = screenToWorld(screen, vp);
    const back = worldToScreen(world, vp);
    expect(back.x).toBeCloseTo(screen.x, 6);
    expect(back.y).toBeCloseTo(screen.y, 6);
  });

  it("worldToScreen maps the viewport world origin to screen origin", () => {
    const vp = { x: 100, y: 50, zoom: 2 };
    expect(worldToScreen({ x: 100, y: 50 }, vp)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoomAt", () => {
  it("keeps the focus screen point over the same world point", () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const focus = { x: 200, y: 100 };
    const next = zoomAt(vp, focus, 2);
    expect(next.zoom).toBe(2);
    // The world point under `focus` before and after must be identical.
    expect(screenToWorld(focus, vp)).toEqual(screenToWorld(focus, next));
  });

  it("clamps the requested zoom", () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const next = zoomAt(vp, { x: 0, y: 0 }, 999);
    expect(next.zoom).toBe(MAX_ZOOM);
  });

  it("is a no-op in world position when zooming at the screen origin", () => {
    const vp = { x: 40, y: 20, zoom: 1 };
    const next = zoomAt(vp, { x: 0, y: 0 }, 2);
    // Screen origin maps to viewport.x/y at any zoom, so x/y are unchanged.
    expect(next.x).toBeCloseTo(40, 6);
    expect(next.y).toBeCloseTo(20, 6);
    expect(next.zoom).toBe(2);
  });
});
