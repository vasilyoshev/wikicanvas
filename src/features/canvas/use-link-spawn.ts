// src/features/canvas/use-link-spawn.ts
import { useCallback } from "react";
import * as Linking from "expo-linking";

import { decideSpawn } from "@/src/features/canvas/spawn";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  placeChildNode,
} from "@/src/features/canvas/spawn-placement";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
import { useAddEdge, useAddNode } from "@/src/features/sessions/queries";
import type { Node } from "@/src/features/sessions/types";
import { getArticle } from "@/src/features/wikipedia/client";
import type { InterceptorMessage } from "@/src/features/wikipedia/messages";

export interface UseLinkSpawnArgs {
  sessionId: string;
  /** Current nodes in the session (for de-dupe + finding the source rect). */
  nodes: Node[];
  /** Pan the viewport to reveal a freshly spawned rect (never zoom). */
  onPanToReveal: (rect: { x: number; y: number; width: number; height: number }) => void;
}

/**
 * Turns an InterceptorMessage from an article frame into canvas mutations.
 * wikilink -> resolve via getArticle -> decideSpawn (spawn node+edge OR edge-only).
 * external -> Linking.openURL. fragment -> no-op (handled inside the frame).
 */
export function useLinkSpawn({ sessionId, nodes, onPanToReveal }: UseLinkSpawnArgs) {
  const addNode = useAddNode();
  const addEdge = useAddEdge();
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const markNew = useCanvasStore((s) => s.markNew);

  const handleMessage = useCallback(
    async (message: InterceptorMessage, sourceNodeId: string): Promise<void> => {
      if (message.type === "external") {
        await Linking.openURL(message.href);
        return;
      }
      if (message.type === "fragment") {
        return;
      }

      // wikilink: resolve, decide, mutate.
      const source = nodes.find((n) => n.id === sourceNodeId);
      if (!source) return;

      const article = await getArticle(message.lang, message.title);
      const decision = decideSpawn(
        { canonicalTitle: article.canonicalTitle, lang: article.lang },
        source,
        nodes,
      );

      if (decision.action === "edge-only") {
        await addEdge.mutateAsync({
          sessionId,
          edge: {
            sourceNodeId: source.id,
            targetNodeId: decision.existingNodeId,
            clickedLinkText: message.text,
          },
        });
        return;
      }

      if (decision.action === "spawn") {
        const existingBounds = nodes.map((n) => ({
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
        }));
        const placement = placeChildNode(
          { x: source.x, y: source.y, width: source.width, height: source.height },
          existingBounds,
          { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
        );
        const created = await addNode.mutateAsync({
          sessionId,
          node: {
            articleTitle: decision.title,
            lang: decision.lang,
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
            parentNodeId: source.id,
          },
        });
        await addEdge.mutateAsync({
          sessionId,
          edge: {
            sourceNodeId: source.id,
            targetNodeId: created.id,
            clickedLinkText: message.text,
          },
        });
        bringToFront(created.id);
        markNew(created.id);
        onPanToReveal(placement);
      }
    },
    [sessionId, nodes, onPanToReveal, addNode, addEdge, bringToFront, markNew],
  );

  return { handleMessage };
}
