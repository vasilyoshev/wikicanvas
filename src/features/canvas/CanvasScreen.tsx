// src/features/canvas/CanvasScreen.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useQueries } from "@tanstack/react-query";

import { Button } from "@/src/components/react-native-reusables/button";
import { Icon } from "@/src/components/react-native-reusables/icon";
import { ThemeToggle } from "@/src/components/app/theme-toggle";
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
  useDeleteNode,
  useSessionBundle,
  useUpdateNodeGeometry,
  useUpdateViewport,
  sessionKeys,
} from "@/src/features/sessions/queries";
import { syncSessionOnOpen } from "@/src/features/sync/orchestrator";
import { queryClient } from "@/src/lib/query-client";
import { useSession } from "@/src/providers/session-provider";
import { getArticle } from "@/src/features/wikipedia/client";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";

interface CanvasScreenProps {
  sessionId: string;
}

/** Persist debounce for viewport pans/zooms (store updates immediately; this only flushes to disk). */
const VIEWPORT_PERSIST_MS = 400;
/** How long a freshly-spawned node keeps its "new" highlight. */
const NEW_HIGHLIGHT_MS = 2500;

export function CanvasScreen({ sessionId }: CanvasScreenProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bundleQuery = useSessionBundle(sessionId);
  const updateViewport = useUpdateViewport();
  const updateNodeGeometry = useUpdateNodeGeometry();

  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const syncNodeOrder = useCanvasStore((s) => s.syncNodeOrder);
  const reset = useCanvasStore((s) => s.reset);
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const markNew = useCanvasStore((s) => s.markNew);
  const clearNew = useCanvasStore((s) => s.clearNew);
  const newNodeIds = useCanvasStore((s) => s.newNodeIds);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const clearScroll = useCanvasStore((s) => s.clearScroll);

  const [fullscreenNodeId, setFullscreenNodeId] = useState<string | null>(null);

  const bundle = bundleQuery.data;
  const nodes = useMemo(() => bundle?.nodes ?? [], [bundle]);
  const edges = useMemo(() => bundle?.edges ?? [], [bundle]);

  // Derive session language from the root node (parentNodeId === null).
  const rootNode = nodes.find((n) => n.parentNodeId === null);
  const sessionLang = rootNode?.lang ?? "en";

  // Hydrate viewport + z-order ONCE per session. On later bundle refetches (e.g. a
  // spawn invalidates the bundle) we only reconcile z-order additively, so the new
  // highlight, selection, and a panned-to-reveal viewport are not clobbered.
  const hydratedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bundle) return;
    if (hydratedSessionRef.current !== sessionId) {
      hydratedSessionRef.current = sessionId;
      setViewport({
        x: bundle.session.viewportX,
        y: bundle.session.viewportY,
        zoom: bundle.session.viewportZoom,
      });
    }
    syncNodeOrder(bundle.nodes.map((n) => n.id));
  }, [bundle, sessionId, setViewport, syncNodeOrder]);

  // Reset transient canvas state only when leaving the session (or unmounting).
  useEffect(() => {
    return () => {
      reset();
      hydratedSessionRef.current = null;
    };
  }, [sessionId, reset]);

  // Auto-clear the transient "new" highlight after a short delay.
  useEffect(() => {
    if (newNodeIds.size === 0) return;
    const timers = [...newNodeIds].map((id) => setTimeout(() => clearNew(id), NEW_HIGHLIGHT_MS));
    return () => timers.forEach(clearTimeout);
  }, [newNodeIds, clearNew]);

  // Fetch each node's article (cache-first via the wikipedia client).
  const articleQueries = useQueries({
    queries: nodes.map((node) => ({
      queryKey: ["article", node.lang, node.articleTitle],
      queryFn: () => getArticle(node.lang, node.articleTitle),
      staleTime: 60 * 60 * 1000,
    })),
  });

  const articleStateByNodeId = useMemo(() => {
    const map: Record<string, { article?: ArticleResult; isError: boolean; refetch: () => void }> =
      {};
    nodes.forEach((node, i) => {
      const q = articleQueries[i];
      map[node.id] = {
        article: q?.data,
        isError: q?.isError ?? false,
        refetch: () => {
          void q?.refetch();
        },
      };
    });
    return map;
  }, [nodes, articleQueries]);

  // Persist viewport changes with a trailing debounce so a pan/zoom stream is one
  // write, not one per frame. The store viewport already updated synchronously.
  const viewportPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistViewport = useCallback(
    (v: Viewport) => {
      if (viewportPersistTimer.current) clearTimeout(viewportPersistTimer.current);
      viewportPersistTimer.current = setTimeout(() => {
        updateViewport.mutate({ sessionId, viewport: v });
      }, VIEWPORT_PERSIST_MS);
    },
    [updateViewport, sessionId],
  );
  useEffect(
    () => () => {
      if (viewportPersistTimer.current) clearTimeout(viewportPersistTimer.current);
    },
    [],
  );

  const handleViewportChange = useCallback((v: Viewport) => persistViewport(v), [persistViewport]);

  const handleNodeGeometryChange = useCallback(
    (nodeId: string, geom: NodeBounds) => {
      updateNodeGeometry.mutate({ sessionId, nodeId, geom });
    },
    [updateNodeGeometry, sessionId],
  );

  const handleToggleFullscreen = useCallback((nodeId: string) => {
    setFullscreenNodeId((current) => (current === nodeId ? null : nodeId));
  }, []);

  const deleteNodeMutation = useDeleteNode();
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      // If the closed node was fullscreen, drop back to the canvas so we don't strand
      // the viewport on a now-missing node (which would hide the top bar + zoom controls).
      setFullscreenNodeId((current) => (current === nodeId ? null : current));
      selectNode(null);
      clearScroll(nodeId);
      deleteNodeMutation.mutate({ sessionId, nodeId });
    },
    [deleteNodeMutation, sessionId, selectNode, clearScroll],
  );

  // Return to the sessions list. Fall back to a replace when there's no history to pop
  // (e.g. the canvas was opened from a deep link).
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, []);

  // Pan-to-reveal: shift the viewport to contain a world-space rect, then persist.
  const onPanToReveal = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const next = panToContain(viewport, rect, { width: screenWidth, height: screenHeight });
      setViewport(next);
      persistViewport(next);
    },
    [viewport, screenWidth, screenHeight, setViewport, persistViewport],
  );

  // Phase 5: link-spawn handler — routes frame wikilink messages to useLinkSpawn.
  const { handleMessage } = useLinkSpawn({ sessionId, nodes, onPanToReveal });

  const handleBoardMessage = useCallback(
    (message: InterceptorMessage, sourceNodeId: string) => {
      void handleMessage(message, sourceNodeId);
    },
    [handleMessage],
  );

  const addNode = useAddNode();

  const { user } = useSession();
  const userId = user?.id ?? null;

  // Pull + merge this session from remote when it opens while signed in. Fire-and-forget:
  // a sync failure must never block opening the canvas. (spec §9/§11) Keyed on the user id
  // (not the user object) so a token refresh does not re-run the full merge.
  useEffect(() => {
    if (!userId) return;
    void syncSessionOnOpen(userId, sessionId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.bundle(sessionId) });
      })
      .catch((error) => {
        console.warn("[sync] syncSessionOnOpen failed", error);
      });
  }, [userId, sessionId]);

  // Add-article picker (root window): de-dupe against existing nodes ourselves
  // (select+pan if present; otherwise create a root node — NO edge).
  const handleAddArticle = useCallback(
    async (choice: { lang: string; title: string }) => {
      try {
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
      } catch (error) {
        // Surfaced via the search field's own state; never let it become an unhandled rejection.
        console.warn("[canvas] add-article failed", error);
        throw error;
      }
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
      {/* Top bar: back-to-sessions + add-article search (Phase 5). box-none lets clicks
          in the empty area (and the top-right ZoomControls) pass through; the search box
          is bounded so it never covers the zoom controls. Hidden while fullscreen so the
          window can own the whole viewport. */}
      {fullscreenNodeId == null ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 top-0 z-10 flex-row items-start gap-2 p-2"
        >
          <Button
            testID="canvas-back"
            variant="secondary"
            size="icon"
            accessibilityLabel="Back to sessions"
            onPress={handleBack}
          >
            <Icon name="arrow-back" />
          </Button>
          <View testID="add-article" className="flex-1" style={{ maxWidth: 380 }}>
            <AddArticleSearch lang={sessionLang} onPick={handleAddArticle} />
          </View>
          <ThemeToggle />
        </View>
      ) : null}
      {/* Board receives the real spawn handler (Phase 5: was a no-op placeholder in Phase 4) */}
      <CanvasBoard
        nodes={nodes}
        edges={edges}
        articleStateByNodeId={articleStateByNodeId}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        fullscreenNodeId={fullscreenNodeId}
        onViewportChange={handleViewportChange}
        onNodeGeometryChange={handleNodeGeometryChange}
        onMessage={handleBoardMessage}
        onToggleFullscreen={handleToggleFullscreen}
        onDeleteNode={handleDeleteNode}
      />
    </View>
  );
}
