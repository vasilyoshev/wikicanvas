import { memo, useMemo } from "react";
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
function CanvasEdgeViewImpl({ source, target, highlighted = false }: CanvasEdgeViewProps) {
  // Building the SVG string is cheap; reparsing it into a Skia.Path is the per-edge
  // cost. Key the memo on the string value so the parse is reused while endpoints
  // are unchanged (source/target are fresh objects each render, so we can't depend
  // on them directly).
  const svg = buildEdgePath(source, target);
  const path = useMemo(() => Skia.Path.MakeFromSVGString(svg), [svg]);
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

export const CanvasEdgeView = memo(CanvasEdgeViewImpl);
