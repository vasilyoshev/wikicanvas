// src/features/canvas/layout.ts
import type { Node, Edge } from "@/src/features/sessions/types";
import type { NodeBounds } from "@/src/features/canvas/types";

/** Union bounds of all node rects. Empty list -> zero rect. */
export function computeContentBounds(
  nodes: Pick<Node, "x" | "y" | "width" | "height">[],
): NodeBounds {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Map nodes/edges into a width x height thumbnail space: uniform scale to fit,
 * centered, with padding. Edges become center-to-center lines.
 */
export function thumbnailLayout(
  nodes: Pick<Node, "id" | "x" | "y" | "width" | "height">[],
  edges: Pick<Edge, "sourceNodeId" | "targetNodeId">[],
  size: { width: number; height: number },
  padding = 6,
): {
  rects: { id: string; x: number; y: number; width: number; height: number }[];
  lines: { x1: number; y1: number; x2: number; y2: number }[];
} {
  if (nodes.length === 0) return { rects: [], lines: [] };

  const content = computeContentBounds(nodes);
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const scaleW = content.width > 0 ? availW / content.width : availW;
  const scaleH = content.height > 0 ? availH / content.height : availH;
  const scale = Math.min(scaleW, scaleH);

  // Center the scaled content within the thumbnail.
  const scaledW = content.width * scale;
  const scaledH = content.height * scale;
  const offsetX = padding + (availW - scaledW) / 2;
  const offsetY = padding + (availH - scaledH) / 2;

  const project = (wx: number, wy: number) => ({
    x: offsetX + (wx - content.x) * scale,
    y: offsetY + (wy - content.y) * scale,
  });

  const rects = nodes.map((n) => {
    const tl = project(n.x, n.y);
    return { id: n.id, x: tl.x, y: tl.y, width: n.width * scale, height: n.height * scale };
  });

  const centerById = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    centerById.set(n.id, project(n.x + n.width / 2, n.y + n.height / 2));
  }

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const e of edges) {
    const s = centerById.get(e.sourceNodeId);
    const t = centerById.get(e.targetNodeId);
    if (!s || !t) continue;
    lines.push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y });
  }

  return { rects, lines };
}
