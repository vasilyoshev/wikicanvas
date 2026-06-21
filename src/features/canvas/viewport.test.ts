// src/features/canvas/viewport.test.ts
import {
  MIN_ZOOM,
  MAX_ZOOM,
  clampZoom,
  screenToWorld,
  worldToScreen,
  zoomAt,
  fitToContent,
  panToContain,
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

describe("fitToContent", () => {
  const screen = { width: 800, height: 600 };

  it("returns identity viewport for empty bounds", () => {
    expect(fitToContent([], screen)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("centers a single rect and clamps zoom to MAX for tiny content", () => {
    const vp = fitToContent([{ x: 0, y: 0, width: 10, height: 10 }], screen);
    expect(vp.zoom).toBe(MAX_ZOOM);
    // The rect center should map to the screen center.
    const centerScreen = worldToScreen({ x: 5, y: 5 }, vp);
    expect(centerScreen.x).toBeCloseTo(400, 4);
    expect(centerScreen.y).toBeCloseTo(300, 4);
  });

  it("fits oversized content by zooming out (within MIN_ZOOM)", () => {
    const vp = fitToContent([{ x: 0, y: 0, width: 10000, height: 10000 }], screen, 0);
    expect(vp.zoom).toBeLessThan(1);
    expect(vp.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it("encloses every rect within the screen at the computed zoom", () => {
    const bounds = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 500, y: 300, width: 100, height: 100 },
    ];
    const vp = fitToContent(bounds, screen, 20);
    for (const b of bounds) {
      const tl = worldToScreen({ x: b.x, y: b.y }, vp);
      const br = worldToScreen({ x: b.x + b.width, y: b.y + b.height }, vp);
      expect(tl.x).toBeGreaterThanOrEqual(-0.001);
      expect(tl.y).toBeGreaterThanOrEqual(-0.001);
      expect(br.x).toBeLessThanOrEqual(screen.width + 0.001);
      expect(br.y).toBeLessThanOrEqual(screen.height + 0.001);
    }
  });
});

describe("panToContain", () => {
  const screen = { width: 800, height: 600 };

  it("never changes zoom", () => {
    const vp = { x: 0, y: 0, zoom: 1.5 };
    const next = panToContain(vp, { x: 5000, y: 5000, width: 100, height: 100 }, screen);
    expect(next.zoom).toBe(1.5);
  });

  it("leaves the viewport unchanged when the rect is already visible", () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const rect = { x: 100, y: 100, width: 100, height: 100 };
    expect(panToContain(vp, rect, screen, 0)).toEqual(vp);
  });

  it("pans so an off-screen-right rect becomes fully visible", () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const rect = { x: 900, y: 50, width: 100, height: 100 };
    const next = panToContain(vp, rect, screen, 10);
    const tl = worldToScreen({ x: rect.x, y: rect.y }, next);
    const br = worldToScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, next);
    expect(tl.x).toBeGreaterThanOrEqual(10 - 0.001);
    expect(br.x).toBeLessThanOrEqual(screen.width - 10 + 0.001);
  });

  it("pans so an off-screen-top rect becomes fully visible", () => {
    const vp = { x: 0, y: 500, zoom: 1 };
    const rect = { x: 100, y: 100, width: 100, height: 100 };
    const next = panToContain(vp, rect, screen, 10);
    const tl = worldToScreen({ x: rect.x, y: rect.y }, next);
    expect(tl.y).toBeGreaterThanOrEqual(10 - 0.001);
  });
});
