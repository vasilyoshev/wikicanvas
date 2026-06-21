// src/features/canvas/CanvasNodeView.tsx
import { useCallback } from "react";
import { Platform, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { Text } from "@/src/components/react-native-reusables/text";
import type { Node } from "@/src/features/sessions/types";
import type { Viewport } from "@/src/features/canvas/types";
import { worldToScreen } from "@/src/features/canvas/viewport";
import ArticleWindow from "@/src/features/wikipedia/ArticleWindow";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";

export const MIN_NODE_W = 220;
export const MIN_NODE_H = 160;

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
  onDragEnd: (nodeId: string) => void;
  onResize: (nodeId: string, width: number, height: number) => void;
  onResizeEnd: (nodeId: string) => void;
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
  onDragMove,
  onDragEnd,
  onResize,
  onResizeEnd,
}: CanvasNodeViewProps) {
  const tl = worldToScreen({ x: node.x, y: node.y }, viewport);
  const width = node.width * viewport.zoom;
  const height = node.height * viewport.zoom;
  const zoom = viewport.zoom;

  const handleToggleFullscreen = useCallback(
    () => onToggleFullscreen(node.id),
    [onToggleFullscreen, node.id],
  );

  // Drag the window header to move the node (world delta = screen delta / zoom).
  const dragGesture = Gesture.Pan()
    .enabled(!fullscreen)
    .onBegin(() => {
      "worklet";
      runOnJS(onSelect)(node.id);
    })
    .onChange((e) => {
      "worklet";
      runOnJS(onDragMove)(node.id, e.changeX / zoom, e.changeY / zoom);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(onDragEnd)(node.id);
    });

  // Bottom-right corner resize; new size = current screen size + delta, / zoom.
  const resizeGesture = Gesture.Pan()
    .enabled(!fullscreen)
    .onChange((e) => {
      "worklet";
      const nextW = Math.max(MIN_NODE_W, node.width + e.changeX / zoom);
      const nextH = Math.max(MIN_NODE_H, node.height + e.changeY / zoom);
      runOnJS(onResize)(node.id, nextW, nextH);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(onResizeEnd)(node.id);
    });

  // Web-only hover handlers for edge highlight.
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
      style={{ position: "absolute", left: tl.x, top: tl.y, width, height }}
      className={`overflow-hidden rounded-lg bg-card ${borderClass}`}
    >
      {/* Drag handle strip across the top so window chrome stays interactive. */}
      <GestureDetector gesture={dragGesture}>
        <Pressable
          testID={`canvas-node-drag-${node.id}`}
          onPress={() => onSelect(node.id)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 36, zIndex: 2 }}
        />
      </GestureDetector>

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

      {!fullscreen ? (
        <GestureDetector gesture={resizeGesture}>
          <View
            testID={`canvas-node-resize-${node.id}`}
            style={{ position: "absolute", right: 0, bottom: 0, width: 20, height: 20, zIndex: 3 }}
            className="rounded-tl bg-border"
          />
        </GestureDetector>
      ) : null}
    </View>
  );
}
