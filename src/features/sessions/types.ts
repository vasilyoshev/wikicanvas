// src/features/sessions/types.ts

/** A saved exploration. updated_at is the LWW clock; deleted_at is a soft-delete tombstone. */
export interface Session {
  id: string; // uuid
  userId: string | null; // null = anonymous (local-only)
  title: string;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601 — bumped on ANY node/edge/session mutation
  deletedAt: string | null; // ISO 8601 tombstone, null = live
}

/** One article window. No independent updated_at: the session is the atomic sync unit. */
export interface Node {
  id: string; // uuid
  sessionId: string;
  articleTitle: string; // canonical Wikipedia title (de-dupe key within a session)
  lang: string; // e.g. "en"
  x: number;
  y: number;
  width: number;
  height: number;
  parentNodeId: string | null; // null = root
  createdAt: string; // ISO 8601
}

/** A parent->child link drawn on click. Cascades with its session/nodes at the schema level. */
export interface Edge {
  id: string; // uuid
  sessionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  clickedLinkText: string | null;
  createdAt: string; // ISO 8601
}

/** Canvas pan/zoom state. x/y are the world coordinate at the top-left of the screen. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number; // 1 = 100%
}

/** Position + size of a window on the board (the persisted geometry of a Node). */
export interface NodeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * List-card view-model computed once by the sessions list query (no per-card bundle fetch).
 * previewNodes drives the thumbnail; nodeCount/updatedAt drive the "N windows · edited …" label.
 */
export interface SessionSummary {
  id: string;
  title: string;
  nodeCount: number;
  updatedAt: string;
  previewNodes: { x: number; y: number; width: number; height: number }[];
}

/** A session plus its full node/edge payload — the atomic sync/local-write unit. */
export interface SessionBundle {
  session: Session;
  nodes: Node[];
  edges: Edge[];
}

/** addNode payload: the repo assigns id/sessionId/createdAt. */
export type NodeInput = Omit<Node, "id" | "sessionId" | "createdAt">;

/** addEdge payload: the repo assigns id/sessionId/createdAt. */
export type EdgeInput = Omit<Edge, "id" | "sessionId" | "createdAt">;
