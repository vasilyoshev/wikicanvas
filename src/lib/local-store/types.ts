// src/lib/local-store/types.ts
import type { Session, Node, Edge, SessionBundle } from "@/src/features/sessions/types";

/** article_cache row, keyed by `${lang}:${title}` (lower-namespaced key built by cacheKey). */
export interface CacheEntry {
  key: string; // `${lang}:${title}`
  lang: string;
  requestedTitle: string;
  canonicalTitle: string;
  html: string;
  license: string;
  fetchedAt: number; // epoch ms
  etag: string | null;
}

/** Single source of truth on-device. Same row shapes as Supabase so sync is a straight upsert. */
export interface LocalStore {
  // --- sessions ---
  listSessions(userId: string | null, includeDeleted?: boolean): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  upsertSession(session: Session): Promise<void>;
  /** Sets deleted_at and bumps updated_at; soft delete. */
  softDeleteSession(id: string, deletedAt: string): Promise<void>;
  /** Hard removal incl. cascaded nodes/edges (used by merge download replace). */
  deleteSessionDeep(id: string): Promise<void>;

  // --- nodes ---
  listNodes(sessionId: string): Promise<Node[]>;
  upsertNode(node: Node): Promise<void>;
  deleteNodesForSession(sessionId: string): Promise<void>;

  // --- edges ---
  listEdges(sessionId: string): Promise<Edge[]>;
  upsertEdge(edge: Edge): Promise<void>;
  deleteEdgesForSession(sessionId: string): Promise<void>;

  // --- whole-bundle helpers (used by sync replace-wholesale) ---
  getBundle(sessionId: string): Promise<SessionBundle | null>;
  /** Atomically replace a session and ALL its nodes/edges (LWW download). */
  replaceBundle(bundle: SessionBundle): Promise<void>;

  // --- article cache ---
  getCacheEntry(key: string): Promise<CacheEntry | null>;
  putCacheEntry(entry: CacheEntry): Promise<void>;

  // --- anonymous adoption ---
  /** Stamp every user_id=null session (and nothing else) with the given userId. Returns ids adopted. */
  adoptAnonymousSessions(userId: string): Promise<string[]>;
}

/** Platform-selected singleton (web index.ts -> IndexedDB; index.native.ts -> SQLite). */
export type GetLocalStore = () => LocalStore;
