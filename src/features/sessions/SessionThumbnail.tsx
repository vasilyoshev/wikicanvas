// src/features/sessions/SessionThumbnail.tsx
import { Canvas, Line, RoundedRect, vec } from "@shopify/react-native-skia";
import { View } from "react-native";

import { thumbnailLayout } from "@/src/features/canvas/layout";

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 140;

interface SessionThumbnailProps {
  previewNodes: { x: number; y: number; width: number; height: number }[];
  width?: number;
  height?: number;
  testID?: string;
}

/**
 * Mini canvas preview for a session card. Maps the session's node rects into the
 * thumbnail box via thumbnailLayout and paints them with Skia. Edges are omitted
 * (SessionSummary carries only node rects); rects alone convey the map shape.
 */
export function SessionThumbnail({
  previewNodes,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  testID,
}: SessionThumbnailProps) {
  const nodes = previewNodes.map((n, index) => ({ id: String(index), ...n }));
  const { rects } = thumbnailLayout(nodes, [], { width, height });

  return (
    <View testID={testID} className="overflow-hidden rounded-md bg-muted" style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {rects.map((r) => (
          <RoundedRect
            key={r.id}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            r={2}
            color="#94a3b8"
          />
        ))}
        {rects.length > 1
          ? rects
              .slice(1)
              .map((r, i) => (
                <Line
                  key={`l-${r.id}`}
                  p1={vec(rects[i].x + rects[i].width / 2, rects[i].y + rects[i].height / 2)}
                  p2={vec(r.x + r.width / 2, r.y + r.height / 2)}
                  color="#cbd5e1"
                  strokeWidth={1}
                />
              ))
          : null}
      </Canvas>
    </View>
  );
}
