import type { NodeBounds } from "@/src/features/canvas/types";

/**
 * SVG cubic-bezier `d` string for a parent->child edge: from the source's
 * right-center to the target's left-center, bowed with control points at the
 * horizontal midpoint. Parsed by Skia.Path.MakeFromSVGString.
 */
export function buildEdgePath(source: NodeBounds, target: NodeBounds): string {
  const sx = source.x + source.width;
  const sy = source.y + source.height / 2;
  const tx = target.x;
  const ty = target.y + target.height / 2;
  const midX = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${midX} ${sy} ${midX} ${ty} ${tx} ${ty}`;
}
