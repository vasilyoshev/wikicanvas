// src/lib/local-store/indexeddb-store.ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { Session, Node, Edge, SessionBundle } from "@/src/features/sessions/types";
import type { CacheEntry, LocalStore } from "@/src/lib/local-store/types";
import {
  DB_NAME,
  DB_VERSION,
  STORE_SESSIONS,
  STORE_NODES,
  STORE_EDGES,
  STORE_ARTICLE_CACHE,
  INDEX_BY_USER,
  INDEX_BY_SESSION,
} from "@/src/lib/local-store/schema";
import {
  sessionRowToDomain,
  sessionToRow,
  nodeRowToDomain,
  nodeToRow,
  edgeRowToDomain,
  edgeToRow,
  cacheRowToEntry,
  cacheEntryToRow,
  type SessionRow,
  type NodeRow,
  type EdgeRow,
  type CacheRow,
} from "@/src/lib/local-store/row-mapping";

interface WikiCanvasDB extends DBSchema {
  sessions: { key: string; value: SessionRow; indexes: { by_user: string } };
  nodes: { key: string; value: NodeRow; indexes: { by_session: string } };
  edges: { key: string; value: EdgeRow; indexes: { by_session: string } };
  article_cache: { key: string; value: CacheRow };
}

/** IndexedDB-backed LocalStore. Stores ROW shape; maps via row-mapping on read/write. */
export class IndexedDBLocalStore implements LocalStore {
  private dbPromise: Promise<IDBPDatabase<WikiCanvasDB>>;

  constructor() {
    this.dbPromise = openDB<WikiCanvasDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        sessions.createIndex(INDEX_BY_USER, "user_id");
        const nodes = db.createObjectStore(STORE_NODES, { keyPath: "id" });
        nodes.createIndex(INDEX_BY_SESSION, "session_id");
        const edges = db.createObjectStore(STORE_EDGES, { keyPath: "id" });
        edges.createIndex(INDEX_BY_SESSION, "session_id");
        db.createObjectStore(STORE_ARTICLE_CACHE, { keyPath: "lang_title" });
      },
    });
  }

  private db() {
    return this.dbPromise;
  }

  async listSessions(userId: string | null, includeDeleted = false): Promise<Session[]> {
    const db = await this.db();
    let rows: SessionRow[];
    if (userId === null) {
      // null userId → anonymous-only (user_id === null).
      // IDBKeyRange.only(null) throws DataError and the by_user index omits null keys,
      // so we read all rows and filter by user_id === null here.
      const all = await db.getAll(STORE_SESSIONS);
      rows = all.filter((r) => r.user_id === null);
    } else {
      rows = await db.getAllFromIndex(STORE_SESSIONS, INDEX_BY_USER, userId);
    }
    const live = includeDeleted ? rows : rows.filter((r) => r.deleted_at === null);
    return live.map(sessionRowToDomain);
  }

  async getSession(id: string): Promise<Session | null> {
    const row = await (await this.db()).get(STORE_SESSIONS, id);
    return row ? sessionRowToDomain(row) : null;
  }

  async upsertSession(session: Session): Promise<void> {
    await (await this.db()).put(STORE_SESSIONS, sessionToRow(session));
  }

  async softDeleteSession(id: string, deletedAt: string): Promise<void> {
    const db = await this.db();
    const row = await db.get(STORE_SESSIONS, id);
    if (!row) return;
    await db.put(STORE_SESSIONS, { ...row, deleted_at: deletedAt, updated_at: deletedAt });
  }

  async deleteSessionDeep(id: string): Promise<void> {
    const db = await this.db();
    await this.deleteNodesForSession(id);
    await this.deleteEdgesForSession(id);
    await db.delete(STORE_SESSIONS, id);
  }

  async listNodes(sessionId: string): Promise<Node[]> {
    const rows = await (await this.db()).getAllFromIndex(STORE_NODES, INDEX_BY_SESSION, sessionId);
    return rows.map(nodeRowToDomain);
  }

  async upsertNode(node: Node): Promise<void> {
    await (await this.db()).put(STORE_NODES, nodeToRow(node));
  }

  async deleteNodesForSession(sessionId: string): Promise<void> {
    const db = await this.db();
    const keys = await db.getAllKeysFromIndex(STORE_NODES, INDEX_BY_SESSION, sessionId);
    await Promise.all(keys.map((k) => db.delete(STORE_NODES, k)));
  }

  async listEdges(sessionId: string): Promise<Edge[]> {
    const rows = await (await this.db()).getAllFromIndex(STORE_EDGES, INDEX_BY_SESSION, sessionId);
    return rows.map(edgeRowToDomain);
  }

  async upsertEdge(edge: Edge): Promise<void> {
    await (await this.db()).put(STORE_EDGES, edgeToRow(edge));
  }

  async deleteEdgesForSession(sessionId: string): Promise<void> {
    const db = await this.db();
    const keys = await db.getAllKeysFromIndex(STORE_EDGES, INDEX_BY_SESSION, sessionId);
    await Promise.all(keys.map((k) => db.delete(STORE_EDGES, k)));
  }

  async getBundle(sessionId: string): Promise<SessionBundle | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const [nodes, edges] = await Promise.all([
      this.listNodes(sessionId),
      this.listEdges(sessionId),
    ]);
    return { session, nodes, edges };
  }

  async replaceBundle(bundle: SessionBundle): Promise<void> {
    const id = bundle.session.id;
    await this.deleteNodesForSession(id);
    await this.deleteEdgesForSession(id);
    await this.upsertSession(bundle.session);
    await Promise.all(bundle.nodes.map((n) => this.upsertNode(n)));
    await Promise.all(bundle.edges.map((e) => this.upsertEdge(e)));
  }

  async getCacheEntry(key: string): Promise<CacheEntry | null> {
    const row = await (await this.db()).get(STORE_ARTICLE_CACHE, key);
    return row ? cacheRowToEntry(row) : null;
  }

  async putCacheEntry(entry: CacheEntry): Promise<void> {
    await (await this.db()).put(STORE_ARTICLE_CACHE, cacheEntryToRow(entry));
  }

  async adoptAnonymousSessions(userId: string): Promise<string[]> {
    const db = await this.db();
    // getAll + filter (never the by_user index, which omits null keys).
    const all = await db.getAll(STORE_SESSIONS);
    const anon = all.filter((r) => r.user_id === null);
    await Promise.all(anon.map((r) => db.put(STORE_SESSIONS, { ...r, user_id: userId })));
    return anon.map((r) => r.id);
  }
}

export function createIndexedDBLocalStore(): LocalStore {
  return new IndexedDBLocalStore();
}
