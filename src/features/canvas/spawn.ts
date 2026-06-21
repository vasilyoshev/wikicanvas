// src/features/canvas/spawn.ts
import type { Node } from "@/src/features/sessions/types";

/**
 * Outcome of an in-article link click within a session.
 * - "spawn": no node for the canonical title -> create node + edge (caller places it).
 * - "edge-only": a node for the canonical title already exists -> caller MUST add an
 *   edge source -> existingNodeId (de-dupe; no duplicate node).
 * - "ignore": never returned for resolved articles; reserved for completeness.
 */
export type SpawnDecision =
  | { action: "spawn"; title: string; lang: string }
  | { action: "edge-only"; existingNodeId: string }
  | { action: "ignore" };

/**
 * Decide what to do when a resolved internal article link is clicked from `sourceNode`.
 * De-dupe key within a session = canonical title + lang (authoritative from the API),
 * NOT the requested title. The first matching node wins.
 */
export function decideSpawn(
  article: { canonicalTitle: string; lang: string },
  sourceNode: Node,
  existingNodes: Node[],
): SpawnDecision {
  const match = existingNodes.find(
    (node) => node.articleTitle === article.canonicalTitle && node.lang === article.lang,
  );
  if (match) {
    return { action: "edge-only", existingNodeId: match.id };
  }
  // sourceNode is referenced so callers/tests treat it as the edge origin; no-op read
  // keeps the signature stable for future placement-aware logic without unused-var lint.
  void sourceNode;
  return { action: "spawn", title: article.canonicalTitle, lang: article.lang };
}
