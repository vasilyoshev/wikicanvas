// src/features/canvas/virtualization.test.ts
import { isNodeVisible } from "@/src/features/canvas/virtualization";

describe("isNodeVisible", () => {
  const screen = { width: 800, height: 600 };
  const vp = { x: 0, y: 0, zoom: 1 };

  it("returns true for a node fully on screen", () => {
    expect(isNodeVisible({ x: 100, y: 100, width: 100, height: 100 }, vp, screen)).toBe(true);
  });

  it("returns false for a node far off screen with no margin", () => {
    expect(isNodeVisible({ x: 5000, y: 5000, width: 100, height: 100 }, vp, screen, 0)).toBe(false);
  });

  it("returns true for a node just off screen but within the margin", () => {
    // Node at screen x=820..920; screen right edge 800; within 200px margin.
    expect(isNodeVisible({ x: 820, y: 100, width: 100, height: 100 }, vp, screen, 200)).toBe(true);
  });

  it("returns false for a node just outside the margin", () => {
    expect(isNodeVisible({ x: 1100, y: 100, width: 100, height: 100 }, vp, screen, 200)).toBe(
      false,
    );
  });

  it("accounts for zoom when projecting bounds", () => {
    const zoomed = { x: 0, y: 0, zoom: 0.1 };
    // At 0.1x, world 3000 -> screen 300 (visible).
    expect(isNodeVisible({ x: 3000, y: 0, width: 100, height: 100 }, zoomed, screen, 0)).toBe(true);
  });
});
