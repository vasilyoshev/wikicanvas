// src/features/canvas/types.ts
import type { Node, Edge } from "@/src/features/sessions/types";
import type { Viewport } from "@/src/features/sessions/types";

// Re-export the canonical Viewport (defined in sessions/types.ts, Phase 2) so
// canvas code can import it from "@/src/features/canvas/types" without a second
// definition. Single source of truth: sessions/types.ts.
export type { Viewport };

/** An axis-aligned rectangle in world space. */
export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Render view-model for one article window on the board. */
export interface CanvasNode {
  node: Node;
  /** Whether this node should mount its ArticleHtml host (vs a placeholder). */
  visible: boolean;
  /** Whether this node is currently selected. */
  selected: boolean;
  /** Whether this node has a transient "new" highlight. */
  isNew: boolean;
}

/** Render view-model for one parent->child edge. */
export interface CanvasEdge {
  edge: Edge;
  source: NodeBounds;
  target: NodeBounds;
  /** Whether either endpoint is selected/hovered (draw highlighted). */
  highlighted: boolean;
}
