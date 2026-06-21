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

/** Compute the union bounds of a non-empty list of rects. */
function unionBounds(bounds: NodeBounds[]): NodeBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bounds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Compute a viewport that fits all bounds within the screen, centered. */
export function fitToContent(
  bounds: NodeBounds[],
  screen: { width: number; height: number },
  padding = 48,
): Viewport {
  if (bounds.length === 0) return { x: 0, y: 0, zoom: 1 };
  const u = unionBounds(bounds);
  const availW = Math.max(1, screen.width - padding * 2);
  const availH = Math.max(1, screen.height - padding * 2);
  const fitW = u.width > 0 ? availW / u.width : MAX_ZOOM;
  const fitH = u.height > 0 ? availH / u.height : MAX_ZOOM;
  const zoom = clampZoom(Math.min(fitW, fitH));
  const center = boundsCenter(u);
  // Place the content center at the screen center.
  return {
    zoom,
    x: center.x - screen.width / 2 / zoom,
    y: center.y - screen.height / 2 / zoom,
  };
}

/**
 * Zoom to `nextZoom` (clamped) keeping the world point currently under
 * `focusScreen` fixed on screen.
 */
export function zoomAt(
  viewport: Viewport,
  focusScreen: { x: number; y: number },
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom);
  // World point under the focus before the zoom.
  const worldFocus = screenToWorld(focusScreen, viewport);
  // Solve for new x/y so worldToScreen(worldFocus, next) === focusScreen.
  return {
    zoom,
    x: worldFocus.x - focusScreen.x / zoom,
    y: worldFocus.y - focusScreen.y / zoom,
  };
}

/**
 * Pan (never zoom) the viewport by the minimum amount so `rect` (world space)
 * sits fully inside the padded screen. Returns the same viewport if already in.
 */
export function panToContain(
  viewport: Viewport,
  rect: NodeBounds,
  screen: { width: number; height: number },
  padding = 48,
): Viewport {
  const tl = worldToScreen({ x: rect.x, y: rect.y }, viewport);
  const br = worldToScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, viewport);
  const minX = padding;
  const minY = padding;
  const maxX = screen.width - padding;
  const maxY = screen.height - padding;

  // Screen-space delta needed to bring the rect inside [min,max].
  let dxScreen = 0;
  if (tl.x < minX) dxScreen = minX - tl.x;
  else if (br.x > maxX) dxScreen = maxX - br.x;

  let dyScreen = 0;
  if (tl.y < minY) dyScreen = minY - tl.y;
  else if (br.y > maxY) dyScreen = maxY - br.y;

  if (dxScreen === 0 && dyScreen === 0) return viewport;

  // Moving content +dxScreen on screen means decreasing viewport.x by dx/zoom.
  return {
    zoom: viewport.zoom,
    x: viewport.x - dxScreen / viewport.zoom,
    y: viewport.y - dyScreen / viewport.zoom,
  };
}
