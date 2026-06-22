// src/features/canvas/CanvasNodeView.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { Text } from "@/src/components/react-native-reusables/text";
import { Button } from "@/src/components/react-native-reusables/button";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
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
  /** True when the article fetch for this node failed (distinct from still loading). */
  articleError?: boolean;
  onRetryArticle?: () => void;
  viewport: Viewport;
  /** Viewport pixel size — the geometry a node animates to when it goes fullscreen. */
  screenWidth: number;
  screenHeight: number;
  visible: boolean;
  selected: boolean;
  isNew: boolean;
  fullscreen: boolean;
  onSelect: (nodeId: string) => void;
  onHoverChange: (nodeId: string, hovered: boolean) => void;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
  onToggleFullscreen: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  // Drag/resize report INCREMENTAL world-space deltas; the board accumulates them.
  onDragMove: (nodeId: string, dxWorld: number, dyWorld: number) => void;
  onDragEnd: (nodeId: string) => void;
  onResize: (nodeId: string, dwWorld: number, dhWorld: number) => void;
  onResizeEnd: (nodeId: string) => void;
}

/**
 * One article window anchored on the board. Positioned in screen space from the
 * node's (effective) world geometry and the current viewport. When off-screen
 * (`visible` is false) it renders a lightweight placeholder instead of the HTML host.
 */
function CanvasNodeViewImpl({
  node,
  article,
  articleError = false,
  onRetryArticle,
  viewport,
  screenWidth,
  screenHeight,
  visible,
  selected,
  isNew,
  fullscreen,
  onSelect,
  onHoverChange,
  onMessage,
  onToggleFullscreen,
  onDeleteNode,
  onDragMove,
  onDragEnd,
  onResize,
  onResizeEnd,
}: CanvasNodeViewProps) {
  const tl = worldToScreen({ x: node.x, y: node.y }, viewport);
  const width = node.width * viewport.zoom;
  const height = node.height * viewport.zoom;
  const zoom = viewport.zoom;
  const nodeId = node.id;

  const handleToggleFullscreen = useCallback(
    () => onToggleFullscreen(nodeId),
    [onToggleFullscreen, nodeId],
  );

  const handleClose = useCallback(() => onDeleteNode(nodeId), [onDeleteNode, nodeId]);

  // Restore this node's saved reading position at mount (read once, non-reactively), and
  // report scroll changes back so the position survives re-mount / theme switch / reopen.
  const setScroll = useCanvasStore((s) => s.setScroll);
  const [initialScrollY] = useState(() => useCanvasStore.getState().scrollByNodeId[nodeId] ?? 0);
  const handleScroll = useCallback((y: number) => setScroll(nodeId, y), [setScroll, nodeId]);

  // Animate the grow/shrink between card and fullscreen on web. The CSS transition
  // must be enabled on the SAME render that flips the geometry, so we detect the toggle
  // synchronously (`toggledThisRender`) AND keep it on for the settle window via
  // `animating` — keying only off the post-render effect would land the geometry before
  // the transition turns on and the window would jump. The transition stays off in the
  // steady card state so ordinary pan/drag/zoom (which also move left/top) don't lag.
  // Native has no CSS transition, so the switch is simply instant there.
  const [animating, setAnimating] = useState(false);
  const prevFullscreen = useRef(fullscreen);
  const toggledThisRender = prevFullscreen.current !== fullscreen;
  useEffect(() => {
    if (prevFullscreen.current === fullscreen) return;
    prevFullscreen.current = fullscreen;
    if (Platform.OS !== "web") return;
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 320);
    return () => clearTimeout(timer);
  }, [fullscreen]);

  // Fullscreen lifts the window to cover the whole viewport (above its siblings and the
  // zoom controls); otherwise it sits at its world rect projected to the screen. It
  // stays "lifted" for the whole transition so it never drops behind a sibling mid-shrink.
  const lifted = fullscreen || animating || toggledThisRender;
  const geometry = fullscreen
    ? { left: 0, top: 0, width: screenWidth, height: screenHeight }
    : { left: tl.x, top: tl.y, width, height };
  const transition =
    Platform.OS === "web" && lifted
      ? {
          transitionProperty: "left, top, width, height",
          transitionDuration: "300ms",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      : null;

  // Drag the window header to move the node (world delta = screen delta / zoom).
  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!fullscreen)
        .onBegin(() => {
          "worklet";
          runOnJS(onSelect)(nodeId);
        })
        .onChange((e) => {
          "worklet";
          runOnJS(onDragMove)(nodeId, e.changeX / zoom, e.changeY / zoom);
        })
        .onEnd(() => {
          "worklet";
          runOnJS(onDragEnd)(nodeId);
        }),
    [fullscreen, nodeId, zoom, onSelect, onDragMove, onDragEnd],
  );

  // Bottom-right corner resize; reports incremental world-space size deltas.
  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!fullscreen)
        .onChange((e) => {
          "worklet";
          runOnJS(onResize)(nodeId, e.changeX / zoom, e.changeY / zoom);
        })
        .onEnd(() => {
          "worklet";
          runOnJS(onResizeEnd)(nodeId);
        }),
    [fullscreen, nodeId, zoom, onResize, onResizeEnd],
  );

  // Web-only hover handlers for edge highlight.
  const hoverProps =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => onHoverChange(nodeId, true),
          onMouseLeave: () => onHoverChange(nodeId, false),
        }
      : {};

  const borderClass = selected
    ? "border-2 border-blue-600"
    : isNew
      ? "border-2 border-emerald-500"
      : "border border-border";

  return (
    <View
      testID={`canvas-node-${nodeId}`}
      {...(hoverProps as any)}
      style={
        [{ position: "absolute", zIndex: lifted ? 1000 : undefined }, geometry, transition] as any
      }
      className={`overflow-hidden bg-card ${fullscreen ? "" : `rounded-lg ${borderClass}`}`}
    >
      {/* Stable title testID for e2e — always rendered so tests can count windows by title.
          Sized 1×1 and fully transparent so it's detectable by Playwright but invisible to users. */}
      <Text
        testID={`canvas-node-title-${node.articleTitle}`}
        accessible={false}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, overflow: "hidden" }}
      >
        {node.articleTitle}
      </Text>

      {/* Drag handle: only the centre title gutter of the header, so the left source
          mark and the right fullscreen/close controls stay clickable (they are not
          covered by the drag overlay). */}
      <GestureDetector gesture={dragGesture}>
        <Pressable
          testID={`canvas-node-drag-${nodeId}`}
          accessibilityLabel="Move window"
          onPress={() => onSelect(nodeId)}
          style={{ position: "absolute", top: 0, left: 44, right: 60, height: 36, zIndex: 2 }}
        />
      </GestureDetector>

      {visible && article ? (
        <ArticleWindow
          article={article}
          nodeId={nodeId}
          fullscreen={fullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onClose={handleClose}
          initialScrollY={initialScrollY}
          onScroll={handleScroll}
          onMessage={onMessage}
        />
      ) : visible && articleError ? (
        <View
          testID={`canvas-node-error-${nodeId}`}
          className="flex-1 items-center justify-center gap-2 bg-muted p-3"
        >
          <Text variant="muted" numberOfLines={2} className="text-center">
            {`Couldn't load "${node.articleTitle}"`}
          </Text>
          {onRetryArticle ? (
            <Button
              testID={`canvas-node-retry-${nodeId}`}
              variant="outline"
              size="sm"
              onPress={onRetryArticle}
            >
              <Text>Retry</Text>
            </Button>
          ) : null}
        </View>
      ) : (
        <View
          testID={`canvas-node-placeholder-${nodeId}`}
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
            testID={`canvas-node-resize-${nodeId}`}
            accessibilityLabel="Resize window"
            style={
              [
                { position: "absolute", right: 0, bottom: 0, width: 20, height: 20, zIndex: 3 },
                Platform.OS === "web" ? { cursor: "nwse-resize" } : null,
              ] as any
            }
          >
            {/* Two diagonal strokes in the corner — the conventional resize grip, in
                place of a flat filled square. Decorative, so they ignore pointers and
                the parent View remains the gesture target. */}
            <View
              pointerEvents="none"
              className="bg-muted-foreground"
              style={{
                position: "absolute",
                left: 5.5,
                top: 11,
                width: 13,
                height: 2,
                borderRadius: 1,
                transform: [{ rotate: "-45deg" }],
              }}
            />
            <View
              pointerEvents="none"
              className="bg-muted-foreground"
              style={{
                position: "absolute",
                left: 11.5,
                top: 14,
                width: 7,
                height: 2,
                borderRadius: 1,
                transform: [{ rotate: "-45deg" }],
              }}
            />
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

export const CanvasNodeView = memo(CanvasNodeViewImpl);
