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

/** Load a session or throw; the LWW clock requires a live session to bump. */
async function requireSession(sessionId: string): Promise<Session> {
  const session = await getLocalStore().getSession(sessionId);
  if (!session) throw new Error("Session not found");
  return session;
}

/** Write the session with a fresh updatedAt (the single place the LWW clock advances). */
async function bumpSession(session: Session, patch: Partial<Session> = {}): Promise<Session> {
  const updated: Session = { ...session, ...patch, updatedAt: nowIso() };
  await getLocalStore().upsertSession(updated);
  return updated;
}

export async function renameSession(sessionId: string, title: string): Promise<Session> {
  const session = await requireSession(sessionId);
  return bumpSession(session, { title });
}

export async function deleteSession(sessionId: string): Promise<void> {
  // Soft delete: deleted_at = now; the adapter also bumps updated_at to the same value.
  await requireSession(sessionId);
  await getLocalStore().softDeleteSession(sessionId, nowIso());
}

export async function updateViewport(sessionId: string, viewport: Viewport): Promise<void> {
  const session = await requireSession(sessionId);
  await bumpSession(session, {
    viewportX: viewport.x,
    viewportY: viewport.y,
    viewportZoom: viewport.zoom,
  });
}

export async function addNode(sessionId: string, node: NodeInput): Promise<Node> {
  const session = await requireSession(sessionId);
  const created: Node = {
    ...node,
    id: newId(),
    sessionId,
    createdAt: nowIso(),
  };
  await getLocalStore().upsertNode(created);
  await bumpSession(session);
  return created;
}

export async function addEdge(sessionId: string, edge: EdgeInput): Promise<Edge> {
  const session = await requireSession(sessionId);
  const created: Edge = {
    ...edge,
    id: newId(),
    sessionId,
    createdAt: nowIso(),
  };
  await getLocalStore().upsertEdge(created);
  await bumpSession(session);
  return created;
}

export async function updateNodeGeometry(
  sessionId: string,
  nodeId: string,
  geom: NodeGeometry,
): Promise<void> {
  const store = getLocalStore();
  const session = await requireSession(sessionId);
  const nodes = await store.listNodes(sessionId);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error("Node not found");
  await store.upsertNode({ ...node, ...geom });
  await bumpSession(session);
}

// Re-export the shared clock/id helpers so sibling mutation ops (next task) bump from one source.
export { nowIso, newId };
export type { Viewport, NodeGeometry, NodeInput, EdgeInput, Edge };
