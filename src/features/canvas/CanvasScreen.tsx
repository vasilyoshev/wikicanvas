// src/features/canvas/CanvasScreen.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, useWindowDimensions, View } from "react-native";
import { useQueries } from "@tanstack/react-query";

import { LoadingState, EmptyState } from "@/src/components/app/screen-state";
import type { NodeBounds, Viewport } from "@/src/features/canvas/types";
import { CanvasBoard } from "@/src/features/canvas/CanvasBoard";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
import {
  useSessionBundle,
  useUpdateNodeGeometry,
  useUpdateViewport,
} from "@/src/features/sessions/queries";
import { getArticle } from "@/src/features/wikipedia/client";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";

interface CanvasScreenProps {
  sessionId: string;
}

export function CanvasScreen({ sessionId }: CanvasScreenProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bundleQuery = useSessionBundle(sessionId);
  const updateViewport = useUpdateViewport();
  const updateNodeGeometry = useUpdateNodeGeometry();

  const setStoreViewport = useCanvasStore((s) => s.setViewport);
  const setNodeOrder = useCanvasStore((s) => s.setNodeOrder);
  const reset = useCanvasStore((s) => s.reset);

  const [fullscreenNodeId, setFullscreenNodeId] = useState<string | null>(null);

  const bundle = bundleQuery.data;
  const nodes = useMemo(() => bundle?.nodes ?? [], [bundle]);
  const edges = useMemo(() => bundle?.edges ?? [], [bundle]);

  // Hydrate the canvas store from the persisted session once the bundle loads.
  useEffect(() => {
    if (!bundle) return;
    setStoreViewport({
      x: bundle.session.viewportX,
      y: bundle.session.viewportY,
      zoom: bundle.session.viewportZoom,
    });
    setNodeOrder(bundle.nodes.map((n) => n.id));
    return () => reset();
  }, [bundle, setStoreViewport, setNodeOrder, reset]);

  // Fetch each node's article (cache-first via the wikipedia client).
  const articleQueries = useQueries({
    queries: nodes.map((node) => ({
      queryKey: ["article", node.lang, node.articleTitle],
      queryFn: () => getArticle(node.lang, node.articleTitle),
      staleTime: 60 * 60 * 1000,
    })),
  });

  const articlesByNodeId = useMemo(() => {
    const map: Record<string, ArticleResult | undefined> = {};
    nodes.forEach((node, i) => {
      map[node.id] = articleQueries[i]?.data;
    });
    return map;
  }, [nodes, articleQueries]);

  const handleViewportChange = useCallback(
    (viewport: Viewport) => {
      updateViewport.mutate({ sessionId, viewport });
    },
    [updateViewport, sessionId],
  );

  const handleNodeGeometryChange = useCallback(
    (nodeId: string, geom: NodeBounds) => {
      updateNodeGeometry.mutate({ sessionId, nodeId, geom });
    },
    [updateNodeGeometry, sessionId],
  );

  const handleToggleFullscreen = useCallback((nodeId: string) => {
    setFullscreenNodeId((current) => (current === nodeId ? null : nodeId));
  }, []);

  // Base message handler: open external links, ignore fragments/wikilinks.
  // Phase 5 REPLACES this body to spawn nodes on `wikilink`.
  const handleMessage = useCallback((message: InterceptorMessage, _sourceNodeId: string) => {
    if (message.type === "external") {
      void Linking.openURL(message.href);
    }
    // wikilink/fragment: no-op in Phase 4.
  }, []);

  if (bundleQuery.isLoading) {
    return <LoadingState label="Loading session…" />;
  }
  if (!bundle) {
    return (
      <EmptyState title="Session not found" description="This exploration may have been deleted." />
    );
  }

  return (
    <View testID="canvas-screen" className="flex-1 bg-background">
      <CanvasBoard
        nodes={nodes}
        edges={edges}
        articlesByNodeId={articlesByNodeId}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        fullscreenNodeId={fullscreenNodeId}
        onViewportChange={handleViewportChange}
        onNodeGeometryChange={handleNodeGeometryChange}
        onMessage={handleMessage}
        onToggleFullscreen={handleToggleFullscreen}
      />
    </View>
  );
}
