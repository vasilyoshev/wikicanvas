// src/features/canvas/viewport.ts
import type { NodeBounds, Viewport } from "@/src/features/canvas/types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/** Clamp a zoom factor into [MIN_ZOOM, MAX_ZOOM]; NaN -> MIN_ZOOM. */
export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return MIN_ZOOM;
  if (zoom < MIN_ZOOM) return MIN_ZOOM;
  if (zoom > MAX_ZOOM) return MAX_ZOOM;
  return zoom;
}

/**
 * Internal: center point of a bounds rect in world space. Used by later helpers
 * (panToContain/fitToContent). Declared here so the Viewport/NodeBounds imports
 * are referenced from the first commit (strict, no unused imports).
 */
export function boundsCenter(rect: NodeBounds): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Internal: identity guard so Viewport is referenced from the first commit. */
export function isViewport(value: Viewport): value is Viewport {
  return (
    typeof value.x === "number" && typeof value.y === "number" && typeof value.zoom === "number"
  );
}

/** Convert a screen-space point to world space given the viewport. */
export function screenToWorld(
  screen: { x: number; y: number },
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: viewport.x + screen.x / viewport.zoom,
    y: viewport.y + screen.y / viewport.zoom,
  };
}

/** Convert a world-space point to screen space given the viewport. */
export function worldToScreen(
  world: { x: number; y: number },
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (world.x - viewport.x) * viewport.zoom,
    y: (world.y - viewport.y) * viewport.zoom,
  };
}
