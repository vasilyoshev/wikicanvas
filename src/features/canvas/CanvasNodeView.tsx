// src/features/canvas/CanvasNodeView.tsx
import { useCallback } from "react";
import { Platform, View } from "react-native";

import { Text } from "@/src/components/react-native-reusables/text";
import type { Node } from "@/src/features/sessions/types";
import type { Viewport } from "@/src/features/canvas/types";
import { worldToScreen } from "@/src/features/canvas/viewport";
import ArticleWindow from "@/src/features/wikipedia/ArticleWindow";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";

export interface CanvasNodeViewProps {
  node: Node;
  article: ArticleResult | undefined;
  viewport: Viewport;
  visible: boolean;
  selected: boolean;
  isNew: boolean;
  fullscreen: boolean;
  onSelect: (nodeId: string) => void;
  onHoverChange: (nodeId: string, hovered: boolean) => void;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
  onToggleFullscreen: (nodeId: string) => void;
  onDragMove: (nodeId: string, dxWorld: number, dyWorld: number) => void;
  onDragEnd: () => void;
  onResize: (nodeId: string, width: number, height: number) => void;
  onResizeEnd: () => void;
}

/**
 * One article window anchored on the board. Positioned in screen space from the
 * node's world geometry and the current viewport. When off-screen (`visible` is
 * false) it renders a lightweight placeholder instead of the HTML host.
 */
export function CanvasNodeView({
  node,
  article,
  viewport,
  visible,
  selected,
  isNew,
  fullscreen,
  onSelect,
  onHoverChange,
  onMessage,
  onToggleFullscreen,
}: CanvasNodeViewProps) {
  const tl = worldToScreen({ x: node.x, y: node.y }, viewport);
  const width = node.width * viewport.zoom;
  const height = node.height * viewport.zoom;

  const handleToggleFullscreen = useCallback(
    () => onToggleFullscreen(node.id),
    [onToggleFullscreen, node.id],
  );

  // Web-only hover handlers for edge highlight (P4.14 reads hoveredNodeId).
  const hoverProps =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => onHoverChange(node.id, true),
          onMouseLeave: () => onHoverChange(node.id, false),
        }
      : {};

  const borderClass = selected
    ? "border-2 border-blue-600"
    : isNew
      ? "border-2 border-emerald-500"
      : "border border-border";

  return (
    <View
      testID={`canvas-node-${node.id}`}
      {...(hoverProps as any)}
      onTouchStart={() => onSelect(node.id)}
      style={{
        position: "absolute",
        left: tl.x,
        top: tl.y,
        width,
        height,
      }}
      className={`overflow-hidden rounded-lg bg-card ${borderClass}`}
    >
      {visible && article ? (
        <ArticleWindow
          article={article}
          nodeId={node.id}
          fullscreen={fullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onMessage={onMessage}
        />
      ) : (
        <View
          testID={`canvas-node-placeholder-${node.id}`}
          className="flex-1 items-center justify-center bg-muted p-3"
        >
          <Text variant="muted" numberOfLines={2} className="text-center">
            {node.articleTitle}
          </Text>
        </View>
      )}
    </View>
  );
}
