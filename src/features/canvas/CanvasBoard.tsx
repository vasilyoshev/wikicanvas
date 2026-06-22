// src/features/canvas/CanvasBoard.tsx
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { Canvas, Group } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { Text } from "@/src/components/react-native-reusables/text";
import type { Edge, Node } from "@/src/features/sessions/types";
import type { NodeBounds, Viewport } from "@/src/features/canvas/types";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";
import { CanvasEdgeView } from "@/src/features/canvas/CanvasEdgeView";
import { CanvasNodeView, MIN_NODE_W, MIN_NODE_H } from "@/src/features/canvas/CanvasNodeView";
import { ZoomControls } from "@/src/features/canvas/ZoomControls";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
import { isNodeVisible } from "@/src/features/canvas/virtualization";
import { clampZoom, fitToContent, worldToScreen, zoomAt } from "@/src/features/canvas/viewport";

export interface CanvasBoardProps {
  nodes: Node[];
  edges: Edge[];
  articleStateByNodeId: Record<
    string,
    { article?: ArticleResult; isError: boolean; refetch: () => void }
  >;
  screenWidth: number;
  screenHeight: number;
  fullscreenNodeId: string | null;
  onViewportChange: (viewport: Viewport) => void;
  onNodeGeometryChange: (nodeId: string, geom: NodeBounds) => void;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
  onToggleFullscreen: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

const ZOOM_STEP = 1.2;

function boundsOf(node: Node): NodeBounds {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function CanvasBoard({
  nodes,
  edges,
  articleStateByNodeId,
  screenWidth,
  screenHeight,
  fullscreenNodeId,
  onViewportChange,
  onNodeGeometryChange,
  onMessage,
  onToggleFullscreen,
  onDeleteNode,
}: CanvasBoardProps) {
  const viewport = useCanvasStore((s) => s.viewport);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const hoveredNodeId = useCanvasStore((s) => s.hoveredNodeId);
  const nodeOrder = useCanvasStore((s) => s.nodeOrder);
  const newNodeIds = useCanvasStore((s) => s.newNodeIds);
  const liveBounds = useCanvasStore((s) => s.liveBounds);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const setHovered = useCanvasStore((s) => s.setHovered);
  const setDragging = useCanvasStore((s) => s.setDragging);
  const setResizing = useCanvasStore((s) => s.setResizing);
  const setLiveBounds = useCanvasStore((s) => s.setLiveBounds);
  const clearLiveBounds = useCanvasStore((s) => s.clearLiveBounds);

  const commitViewport = useCallback(
    (next: Viewport) => {
      setViewport(next);
      onViewportChange(next);
    },
    [setViewport, onViewportChange],
  );

  // Pan the empty canvas: translate the viewport by the screen delta / zoom.
  const panGesture = useMemo(
    () =>
      Gesture.Pan().onChange((e) => {
        "worklet";
        const current = useCanvasStore.getState().viewport;
        runOnJS(commitViewport)({
          zoom: current.zoom,
          x: current.x - e.changeX / current.zoom,
          y: current.y - e.changeY / current.zoom,
        });
      }),
    [commitViewport],
  );

  // Pinch zoom anchored on the pinch focal point.
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch().onChange((e) => {
        "worklet";
        const current = useCanvasStore.getState().viewport;
        const next = zoomAt(
          current,
          { x: e.focalX, y: e.focalY },
          clampZoom(current.zoom * e.scaleChange),
        );
        runOnJS(commitViewport)(next);
      }),
    [commitViewport],
  );

  // Tapping empty canvas clears selection.
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        "worklet";
        runOnJS(selectNode)(null);
      }),
    [selectNode],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture, tapGesture),
    [panGesture, pinchGesture, tapGesture],
  );

  // Order nodes for rendering (z-order); fall back to natural order for ids
  // not yet present in nodeOrder.
  const orderedNodes = useMemo(() => {
    const indexOf = (id: string) => {
      const i = nodeOrder.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...nodes].sort((a, b) => indexOf(a.id) - indexOf(b.id));
  }, [nodes, nodeOrder]);

  const nodeById = useMemo(() => {
    const map = new Map<string, Node>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  // Effective geometry: the live (in-gesture) override if present, else persisted.
  const effectiveBounds = useCallback(
    (node: Node): NodeBounds => liveBounds[node.id] ?? boundsOf(node),
    [liveBounds],
  );

  const activeHighlightId = selectedNodeId ?? hoveredNodeId;

  const handleHoverChange = useCallback(
    (id: string, hovered: boolean) => setHovered(hovered ? id : null),
    [setHovered],
  );

  const handleZoomTo = useCallback(
    (factor: number) => {
      const current = useCanvasStore.getState().viewport;
      const center = { x: screenWidth / 2, y: screenHeight / 2 };
      commitViewport(zoomAt(current, center, clampZoom(current.zoom * factor)));
    },
    [commitViewport, screenWidth, screenHeight],
  );

  const handleResetZoom = useCallback(() => {
    const current = useCanvasStore.getState().viewport;
    const center = { x: screenWidth / 2, y: screenHeight / 2 };
    commitViewport(zoomAt(current, center, 1));
  }, [commitViewport, screenWidth, screenHeight]);

  const handleFit = useCallback(() => {
    const bounds = nodes.map((n) => liveBounds[n.id] ?? boundsOf(n));
    commitViewport(fitToContent(bounds, { width: screenWidth, height: screenHeight }));
  }, [commitViewport, nodes, liveBounds, screenWidth, screenHeight]);

  // Pre-project edge endpoints to screen space for the Skia layer. Uses effective
  // (live) bounds so edges track a node while it is being dragged/resized.
  const edgeViews = useMemo(() => {
    return edges
      .map((edge) => {
        const source = nodeById.get(edge.sourceNodeId);
        const target = nodeById.get(edge.targetNodeId);
        if (!source || !target) return null;
        const sB = liveBounds[source.id] ?? boundsOf(source);
        const tB = liveBounds[target.id] ?? boundsOf(target);
        const sTl = worldToScreen({ x: sB.x, y: sB.y }, viewport);
        const tTl = worldToScreen({ x: tB.x, y: tB.y }, viewport);
        const sourceScreen: NodeBounds = {
          x: sTl.x,
          y: sTl.y,
          width: sB.width * viewport.zoom,
          height: sB.height * viewport.zoom,
        };
        const targetScreen: NodeBounds = {
          x: tTl.x,
          y: tTl.y,
          width: tB.width * viewport.zoom,
          height: tB.height * viewport.zoom,
        };
        const highlighted =
          activeHighlightId === edge.sourceNodeId || activeHighlightId === edge.targetNodeId;
        return { id: edge.id, source: sourceScreen, target: targetScreen, highlighted };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [edges, nodeById, viewport, activeHighlightId, liveBounds]);

  // Render every node in z-order. The fullscreen node (if any) lifts itself to cover
  // the viewport via its own geometry + zIndex and animates over the others, so the
  // rest stay mounted behind it (no reload on exit) instead of being unmounted here.
  const renderNodes = orderedNodes;

  // Node drag/resize handlers: accumulate the live geometry in the canvas store
  // (the render source during the gesture) so the node tracks the pointer without
  // a per-frame persistence round-trip. Geometry is committed once on gesture end.
  const handleDragMove = useCallback(
    (nodeId: string, dxWorld: number, dyWorld: number) => {
      const node = nodeById.get(nodeId);
      const base = useCanvasStore.getState().liveBounds[nodeId] ?? (node ? boundsOf(node) : null);
      if (!base) return;
      setDragging(nodeId);
      setLiveBounds(nodeId, {
        x: base.x + dxWorld,
        y: base.y + dyWorld,
        width: base.width,
        height: base.height,
      });
    },
    [nodeById, setDragging, setLiveBounds],
  );

  const handleResize = useCallback(
    (nodeId: string, dwWorld: number, dhWorld: number) => {
      const node = nodeById.get(nodeId);
      const base = useCanvasStore.getState().liveBounds[nodeId] ?? (node ? boundsOf(node) : null);
      if (!base) return;
      setResizing(nodeId);
      setLiveBounds(nodeId, {
        x: base.x,
        y: base.y,
        width: Math.max(MIN_NODE_W, base.width + dwWorld),
        height: Math.max(MIN_NODE_H, base.height + dhWorld),
      });
    },
    [nodeById, setResizing, setLiveBounds],
  );

  // Commit the final live geometry once, then clear the override. useUpdateNodeGeometry
  // optimistically updates the bundle cache so the node stays put after the clear.
  const commitGesture = useCallback(
    (nodeId: string) => {
      const final = useCanvasStore.getState().liveBounds[nodeId];
      if (final) onNodeGeometryChange(nodeId, final);
      clearLiveBounds(nodeId);
    },
    [onNodeGeometryChange, clearLiveBounds],
  );

  const handleDragEnd = useCallback(
    (nodeId: string) => {
      setDragging(null);
      commitGesture(nodeId);
    },
    [setDragging, commitGesture],
  );

  const handleResizeEnd = useCallback(
    (nodeId: string) => {
      setResizing(null);
      commitGesture(nodeId);
    },
    [setResizing, commitGesture],
  );

  return (
    <View testID="canvas-board" className="flex-1 overflow-hidden bg-background">
      <GestureDetector gesture={composedGesture}>
        <View style={{ flex: 1 }}>
          <Canvas style={{ position: "absolute", width: screenWidth, height: screenHeight }}>
            <Group>
              {edgeViews.map((ev) => (
                <CanvasEdgeView
                  key={ev.id}
                  source={ev.source}
                  target={ev.target}
                  highlighted={ev.highlighted}
                />
              ))}
            </Group>
          </Canvas>
          {/* DOM overlays for e2e: one per edge so Playwright can count edges via testID. */}
          {edgeViews.map((ev) => (
            <View
              key={`edge-overlay-${ev.id}`}
              testID="canvas-edge"
              pointerEvents="none"
              style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
            />
          ))}
          {renderNodes.map((node) => {
            const lb = liveBounds[node.id];
            const displayNode = lb
              ? { ...node, x: lb.x, y: lb.y, width: lb.width, height: lb.height }
              : node;
            const state = articleStateByNodeId[node.id];
            return (
              <CanvasNodeView
                key={node.id}
                node={displayNode}
                article={state?.article}
                articleError={state?.isError ?? false}
                onRetryArticle={state?.refetch}
                viewport={viewport}
                screenWidth={screenWidth}
                screenHeight={screenHeight}
                visible={
                  fullscreenNodeId === node.id ||
                  isNodeVisible(
                    effectiveBounds(displayNode),
                    viewport,
                    { width: screenWidth, height: screenHeight },
                    300,
                  )
                }
                selected={selectedNodeId === node.id}
                isNew={newNodeIds.has(node.id)}
                fullscreen={fullscreenNodeId === node.id}
                onSelect={selectNode}
                onHoverChange={handleHoverChange}
                onMessage={onMessage}
                onToggleFullscreen={onToggleFullscreen}
                onDeleteNode={onDeleteNode}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onResize={handleResize}
                onResizeEnd={handleResizeEnd}
              />
            );
          })}
        </View>
      </GestureDetector>
      {/* Zoom controls are irrelevant while a window is fullscreen, and would otherwise
          paint over it, so they hide for the duration. */}
      {!fullscreenNodeId ? (
        <View style={{ position: "absolute", top: 12, right: 12 }}>
          <ZoomControls
            zoom={viewport.zoom}
            onZoomIn={() => handleZoomTo(ZOOM_STEP)}
            onZoomOut={() => handleZoomTo(1 / ZOOM_STEP)}
            onResetZoom={handleResetZoom}
            onFit={handleFit}
          />
        </View>
      ) : null}

      {/* CC BY-SA attribution for the Wikipedia content, kept to a quiet corner label
          instead of a per-window footer. Floats above the fullscreen window too (the
          per-article source link lives in each window's header "W" mark). */}
      {nodes.length > 0 ? (
        <View
          testID="canvas-attribution"
          pointerEvents="none"
          style={{ position: "absolute", right: 8, bottom: 6, zIndex: 1500 }}
        >
          <Text className="text-[10px] text-muted-foreground opacity-70">
            Content from Wikipedia · CC BY-SA 4.0
          </Text>
        </View>
      ) : null}
    </View>
  );
}
