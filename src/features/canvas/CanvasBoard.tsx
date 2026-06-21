// src/features/canvas/CanvasBoard.tsx
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { Canvas, Group } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import type { Edge, Node } from "@/src/features/sessions/types";
import type { NodeBounds, Viewport } from "@/src/features/canvas/types";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";
import { CanvasEdgeView } from "@/src/features/canvas/CanvasEdgeView";
import { CanvasNodeView } from "@/src/features/canvas/CanvasNodeView";
import { ZoomControls } from "@/src/features/canvas/ZoomControls";
import { computeContentBounds } from "@/src/features/canvas/layout";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
import { isNodeVisible } from "@/src/features/canvas/virtualization";
import { clampZoom, fitToContent, worldToScreen, zoomAt } from "@/src/features/canvas/viewport";

export interface CanvasBoardProps {
  nodes: Node[];
  edges: Edge[];
  articlesByNodeId: Record<string, ArticleResult | undefined>;
  screenWidth: number;
  screenHeight: number;
  fullscreenNodeId: string | null;
  onViewportChange: (viewport: Viewport) => void;
  onNodeGeometryChange: (nodeId: string, geom: NodeBounds) => void;
  onMessage: (message: InterceptorMessage, sourceNodeId: string) => void;
  onToggleFullscreen: (nodeId: string) => void;
}

const ZOOM_STEP = 1.2;

function boundsOf(node: Node): NodeBounds {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function CanvasBoard({
  nodes,
  edges,
  articlesByNodeId,
  screenWidth,
  screenHeight,
  fullscreenNodeId,
  onViewportChange,
  onNodeGeometryChange,
  onMessage,
  onToggleFullscreen,
}: CanvasBoardProps) {
  const viewport = useCanvasStore((s) => s.viewport);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const hoveredNodeId = useCanvasStore((s) => s.hoveredNodeId);
  const nodeOrder = useCanvasStore((s) => s.nodeOrder);
  const newNodeIds = useCanvasStore((s) => s.newNodeIds);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const setHovered = useCanvasStore((s) => s.setHovered);

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

  const activeHighlightId = selectedNodeId ?? hoveredNodeId;

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
    const bounds = nodes.map(boundsOf);
    commitViewport(fitToContent(bounds, { width: screenWidth, height: screenHeight }));
  }, [commitViewport, nodes, screenWidth, screenHeight]);

  // Pre-project edge endpoints to screen space for the Skia layer.
  const edgeViews = useMemo(() => {
    return edges
      .map((edge) => {
        const source = nodeById.get(edge.sourceNodeId);
        const target = nodeById.get(edge.targetNodeId);
        if (!source || !target) return null;
        const sTl = worldToScreen({ x: source.x, y: source.y }, viewport);
        const tTl = worldToScreen({ x: target.x, y: target.y }, viewport);
        const sourceScreen: NodeBounds = {
          x: sTl.x,
          y: sTl.y,
          width: source.width * viewport.zoom,
          height: source.height * viewport.zoom,
        };
        const targetScreen: NodeBounds = {
          x: tTl.x,
          y: tTl.y,
          width: target.width * viewport.zoom,
          height: target.height * viewport.zoom,
        };
        const highlighted =
          activeHighlightId === edge.sourceNodeId || activeHighlightId === edge.targetNodeId;
        return { id: edge.id, source: sourceScreen, target: targetScreen, highlighted };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [edges, nodeById, viewport, activeHighlightId]);

  // Suppress all non-fullscreen nodes when one node is fullscreen (P4.15 overlay
  // renders the fullscreen node separately).
  const renderNodes = fullscreenNodeId
    ? orderedNodes.filter((n) => n.id === fullscreenNodeId)
    : orderedNodes;

  // computeContentBounds is referenced for an empty-state aware fit (keeps the
  // import meaningful and lets future hooks read total content extent).
  const contentBounds = computeContentBounds(nodes.map(boundsOf));
  void contentBounds;

  // Node drag/resize handlers: forward geometry changes to the parent via
  // onNodeGeometryChange so the session layer can persist updated positions.
  const handleDragMove = useCallback(
    (nodeId: string, dxWorld: number, dyWorld: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      onNodeGeometryChange(nodeId, {
        x: node.x + dxWorld,
        y: node.y + dyWorld,
        width: node.width,
        height: node.height,
      });
    },
    [nodes, onNodeGeometryChange],
  );

  const handleDragEnd = useCallback(() => {
    // no-op at this layer; persistence happened via handleDragMove
  }, []);

  const handleResize = useCallback(
    (nodeId: string, width: number, height: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      onNodeGeometryChange(nodeId, { x: node.x, y: node.y, width, height });
    },
    [nodes, onNodeGeometryChange],
  );

  const handleResizeEnd = useCallback(() => {
    // no-op at this layer
  }, []);

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
          {renderNodes.map((node) => (
            <CanvasNodeView
              key={node.id}
              node={node}
              article={articlesByNodeId[node.id]}
              viewport={viewport}
              visible={
                fullscreenNodeId === node.id ||
                isNodeVisible(
                  boundsOf(node),
                  viewport,
                  { width: screenWidth, height: screenHeight },
                  300,
                )
              }
              selected={selectedNodeId === node.id}
              isNew={newNodeIds.has(node.id)}
              fullscreen={fullscreenNodeId === node.id}
              onSelect={selectNode}
              onHoverChange={(id, hovered) => setHovered(hovered ? id : null)}
              onMessage={onMessage}
              onToggleFullscreen={onToggleFullscreen}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
            />
          ))}
        </View>
      </GestureDetector>
      <View style={{ position: "absolute", top: 12, right: 12 }}>
        <ZoomControls
          zoom={viewport.zoom}
          onZoomIn={() => handleZoomTo(ZOOM_STEP)}
          onZoomOut={() => handleZoomTo(1 / ZOOM_STEP)}
          onResetZoom={handleResetZoom}
          onFit={handleFit}
        />
      </View>
    </View>
  );
}
