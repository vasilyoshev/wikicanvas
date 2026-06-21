// src/features/canvas/spawn-placement.ts
import type { NodeBounds } from "@/src/features/canvas/types";

/** Default article-window dimensions used when spawning a child node. */
export const DEFAULT_NODE_WIDTH = 380;
export const DEFAULT_NODE_HEIGHT = 520;

/** Default horizontal/vertical spacing between a source window and its spawned child. */
const DEFAULT_GAP = 40;

/** Half-open overlap test: rectangles that merely touch at an edge do NOT overlap. */
function overlaps(a: NodeBounds, b: NodeBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Place a new child window to the RIGHT of `source`, nudged DOWN only as much as
 * needed to avoid overlapping any rect in `existing`. The horizontal position is
 * fixed (right of source + gap); we sweep the candidate downward until it is clear.
 */
export function placeChildNode(
  source: NodeBounds,
  existing: NodeBounds[],
  size: { width: number; height: number } = {
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  },
  gap: number = DEFAULT_GAP,
): { x: number; y: number; width: number; height: number } {
  const x = source.x + source.width + gap;
  let y = source.y;

  // Sweep downward: whenever the candidate overlaps an existing rect, drop below
  // that rect (plus the gap) and re-check from the top against all rects.
  let moved = true;
  while (moved) {
    moved = false;
    const candidate: NodeBounds = { x, y, width: size.width, height: size.height };
    for (const rect of existing) {
      if (overlaps(candidate, rect)) {
        y = rect.y + rect.height + gap;
        moved = true;
        break;
      }
    }
  }

  return { x, y, width: size.width, height: size.height };
}
