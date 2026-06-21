// src/features/canvas/virtualization.ts
import type { NodeBounds, Viewport } from "@/src/features/canvas/types";
import { worldToScreen } from "@/src/features/canvas/viewport";

/**
 * True if a node's projected screen rect intersects the screen rect expanded by
 * `marginPx` on every side. Used to decide whether to mount the HTML host.
 */
export function isNodeVisible(
  bounds: NodeBounds,
  viewport: Viewport,
  screen: { width: number; height: number },
  marginPx = 300,
): boolean {
  const tl = worldToScreen({ x: bounds.x, y: bounds.y }, viewport);
  const br = worldToScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, viewport);
  const left = -marginPx;
  const top = -marginPx;
  const right = screen.width + marginPx;
  const bottom = screen.height + marginPx;
  // Axis-aligned rect intersection test.
  return br.x >= left && tl.x <= right && br.y >= top && tl.y <= bottom;
}
