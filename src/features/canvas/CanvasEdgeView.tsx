import { Path, Skia } from "@shopify/react-native-skia";

import type { NodeBounds } from "@/src/features/canvas/types";
import { buildEdgePath } from "@/src/features/canvas/edge-path";

interface CanvasEdgeViewProps {
  source: NodeBounds;
  target: NodeBounds;
  highlighted?: boolean;
}

const EDGE_COLOR = "#94a3b8"; // slate-400
const EDGE_HIGHLIGHT_COLOR = "#2563eb"; // blue-600

/** A single curved parent->child arrow drawn on the Skia layer. */
export function CanvasEdgeView({ source, target, highlighted = false }: CanvasEdgeViewProps) {
  const path = Skia.Path.MakeFromSVGString(buildEdgePath(source, target));
  if (!path) return null;
  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={highlighted ? 3 : 1.5}
      color={highlighted ? EDGE_HIGHLIGHT_COLOR : EDGE_COLOR}
    />
  );
}
