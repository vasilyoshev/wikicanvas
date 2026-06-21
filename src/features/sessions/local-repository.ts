// src/features/sessions/local-repository.ts
import type {
  Session,
  Node,
  Edge,
  Viewport,
  NodeGeometry,
  NodeInput,
  EdgeInput,
  SessionBundle,
  SessionSummary,
} from "@/src/features/sessions/types";
import { getLocalStore } from "@/src/lib/local-store/index";

const DEFAULT_NODE_WIDTH = 380;
const DEFAULT_NODE_HEIGHT = 520;

/** Current time as an ISO 8601 string (the LWW clock value). */
function nowIso(): string {
  return new Date().toISOString();
}

/** RFC-4122 id; falls back to a timestamp-random id where crypto.randomUUID is unavailable. */
function newId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listSessions(userId: string | null): Promise<SessionSummary[]> {
  const store = getLocalStore();
  const sessions = await store.listSessions(userId);
  const summaries = await Promise.all(
    sessions.map(async (s): Promise<SessionSummary> => {
      const nodes = await store.listNodes(s.id);
      return {
        id: s.id,
        title: s.title,
        nodeCount: nodes.length,
        updatedAt: s.updatedAt,
        previewNodes: nodes.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height })),
      };
    }),
  );
  return summaries;
}

export async function getSessionBundle(sessionId: string): Promise<SessionBundle | null> {
  return getLocalStore().getBundle(sessionId);
}

export async function createSession(
  userId: string | null,
  title: string,
  root: { articleTitle: string; lang: string },
): Promise<SessionBundle> {
  const store = getLocalStore();
  const now = nowIso();
  const session: Session = {
    id: newId(),
    userId,
    title,
    viewportX: 0,
    viewportY: 0,
    viewportZoom: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const rootNode: Node = {
    id: newId(),
    sessionId: session.id,
    articleTitle: root.articleTitle,
    lang: root.lang,
    x: 0,
    y: 0,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    parentNodeId: null,
    createdAt: now,
  };
  await store.upsertSession(session);
  await store.upsertNode(rootNode);
  return { session, nodes: [rootNode], edges: [] };
}

// Re-export the shared clock/id helpers so sibling mutation ops (next task) bump from one source.
export { nowIso, newId };
export type { Viewport, NodeGeometry, NodeInput, EdgeInput, Edge };
