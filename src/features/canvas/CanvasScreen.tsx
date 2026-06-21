// src/features/canvas/CanvasScreen.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, useWindowDimensions, View } from "react-native";
import { useQueries } from "@tanstack/react-query";

import { LoadingState, EmptyState } from "@/src/components/app/screen-state";
import type { NodeBounds, Viewport } from "@/src/features/canvas/types";
import { CanvasBoard } from "@/src/features/canvas/CanvasBoard";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
import { panToContain } from "@/src/features/canvas/viewport";
import { useLinkSpawn } from "@/src/features/canvas/use-link-spawn";
import { AddArticleSearch } from "@/src/features/canvas/AddArticleSearch";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  placeChildNode,
} from "@/src/features/canvas/spawn-placement";
import {
  useAddNode,
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

  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setNodeOrder = useCanvasStore((s) => s.setNodeOrder);
  const reset = useCanvasStore((s) => s.reset);
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const markNew = useCanvasStore((s) => s.markNew);
  const selectNode = useCanvasStore((s) => s.selectNode);

  const [fullscreenNodeId, setFullscreenNodeId] = useState<string | null>(null);

  const bundle = bundleQuery.data;
  const nodes = useMemo(() => bundle?.nodes ?? [], [bundle]);
  const edges = useMemo(() => bundle?.edges ?? [], [bundle]);

  // Derive session language from the root node (parentNodeId === null).
  const rootNode = nodes.find((n) => n.parentNodeId === null);
  const sessionLang = rootNode?.lang ?? "en";

  // Hydrate the canvas store from the persisted session once the bundle loads.
  useEffect(() => {
    if (!bundle) return;
    setViewport({
      x: bundle.session.viewportX,
      y: bundle.session.viewportY,
      zoom: bundle.session.viewportZoom,
    });
    setNodeOrder(bundle.nodes.map((n) => n.id));
    return () => reset();
  }, [bundle, setViewport, setNodeOrder, reset]);

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
    (v: Viewport) => {
      updateViewport.mutate({ sessionId, viewport: v });
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

  // Pan-to-reveal: shift the viewport to contain a world-space rect, then persist.
  const onPanToReveal = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const next = panToContain(viewport, rect, { width: screenWidth, height: screenHeight });
      setViewport(next);
      updateViewport.mutate({ sessionId, viewport: next });
    },
    [viewport, screenWidth, screenHeight, setViewport, updateViewport, sessionId],
  );

  // Phase 5: link-spawn handler — routes frame wikilink messages to useLinkSpawn.
  const { handleMessage } = useLinkSpawn({ sessionId, nodes, onPanToReveal });

  const addNode = useAddNode();

  // Add-article picker (root window): de-dupe against existing nodes ourselves
  // (select+pan if present; otherwise create a root node — NO edge).
  const handleAddArticle = useCallback(
    async (choice: { lang: string; title: string }) => {
      const article = await getArticle(choice.lang, choice.title);
      const existing = nodes.find(
        (n) => n.articleTitle === article.canonicalTitle && n.lang === article.lang,
      );
      if (existing) {
        selectNode(existing.id);
        bringToFront(existing.id);
        onPanToReveal({
          x: existing.x,
          y: existing.y,
          width: existing.width,
          height: existing.height,
        });
        return;
      }
      const bounds = nodes.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
      // Place a fresh root window near the current viewport top-left, nudged clear.
      const anchor = { x: viewport.x + 80, y: viewport.y + 80, width: 0, height: 0 };
      const placement = placeChildNode(anchor, bounds, {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      });
      const created = await addNode.mutateAsync({
        sessionId,
        node: {
          articleTitle: article.canonicalTitle,
          lang: article.lang,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
          parentNodeId: null,
        },
      });
      bringToFront(created.id);
      markNew(created.id);
      onPanToReveal(placement);
    },
    [nodes, viewport, sessionId, addNode, selectNode, bringToFront, markNew, onPanToReveal],
  );

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
      {/* Top bar: add-article search (Phase 5). box-none lets clicks in the empty
          area (and the top-right ZoomControls) pass through; the search box is
          bounded to the left so it never covers the zoom controls. */}
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 top-0 z-10 flex-row items-start gap-2 p-2"
      >
        <View testID="add-article" style={{ width: "100%", maxWidth: 380 }}>
          <AddArticleSearch lang={sessionLang} onPick={handleAddArticle} />
        </View>
      </View>
      {/* Board receives the real spawn handler (Phase 5: was a no-op placeholder in Phase 4) */}
      <CanvasBoard
        nodes={nodes}
        edges={edges}
        articlesByNodeId={articlesByNodeId}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        fullscreenNodeId={fullscreenNodeId}
        onViewportChange={handleViewportChange}
        onNodeGeometryChange={handleNodeGeometryChange}
        onMessage={(message: InterceptorMessage, sourceNodeId: string) => {
          void handleMessage(message, sourceNodeId);
        }}
        onToggleFullscreen={handleToggleFullscreen}
      />
    </View>
  );
}
