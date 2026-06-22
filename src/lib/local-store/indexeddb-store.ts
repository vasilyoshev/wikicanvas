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
      // Idempotent: only create stores that don't already exist. A future DB_VERSION
      // bump re-runs this against an existing DB; unconditional createObjectStore
      // would throw ConstraintError and brick existing web users.
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
          sessions.createIndex(INDEX_BY_USER, "user_id");
        }
        if (!db.objectStoreNames.contains(STORE_NODES)) {
          const nodes = db.createObjectStore(STORE_NODES, { keyPath: "id" });
          nodes.createIndex(INDEX_BY_SESSION, "session_id");
        }
        if (!db.objectStoreNames.contains(STORE_EDGES)) {
          const edges = db.createObjectStore(STORE_EDGES, { keyPath: "id" });
          edges.createIndex(INDEX_BY_SESSION, "session_id");
        }
        if (!db.objectStoreNames.contains(STORE_ARTICLE_CACHE)) {
          db.createObjectStore(STORE_ARTICLE_CACHE, { keyPath: "lang_title" });
        }
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
    // One transaction across all three stores so the deep delete is all-or-nothing
    // (mirrors the SQLite FK cascade); a partial failure can't orphan node/edge rows.
    const tx = db.transaction([STORE_SESSIONS, STORE_NODES, STORE_EDGES], "readwrite");
    const nodes = tx.objectStore(STORE_NODES);
    const edges = tx.objectStore(STORE_EDGES);
    for (const key of await nodes.index(INDEX_BY_SESSION).getAllKeys(id)) await nodes.delete(key);
    for (const key of await edges.index(INDEX_BY_SESSION).getAllKeys(id)) await edges.delete(key);
    await tx.objectStore(STORE_SESSIONS).delete(id);
    await tx.done;
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
    const db = await this.db();
    const id = bundle.session.id;
    // Single readwrite transaction across all three stores: the browser rolls the
    // whole thing back on any failure, so an interrupted sync-download can never
    // leave the session with its children deleted but the new ones missing. This
    // honours the "atomic wholesale replace" contract and matches the SQLite path.
    const tx = db.transaction([STORE_SESSIONS, STORE_NODES, STORE_EDGES], "readwrite");
    const nodes = tx.objectStore(STORE_NODES);
    const edges = tx.objectStore(STORE_EDGES);
    for (const key of await nodes.index(INDEX_BY_SESSION).getAllKeys(id)) await nodes.delete(key);
    for (const key of await edges.index(INDEX_BY_SESSION).getAllKeys(id)) await edges.delete(key);
    await tx.objectStore(STORE_SESSIONS).put(sessionToRow(bundle.session));
    for (const n of bundle.nodes) await nodes.put(nodeToRow(n));
    for (const e of bundle.edges) await edges.put(edgeToRow(e));
    await tx.done;
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
    // One transaction: cursor over anonymous rows and stamp them in place, so adoption
    // is all-or-nothing (never a split owned/anonymous state) and the returned ids
    // describe exactly what committed. Matches the single-statement SQLite UPDATE.
    const tx = db.transaction(STORE_SESSIONS, "readwrite");
    const store = tx.objectStore(STORE_SESSIONS);
    const ids: string[] = [];
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.user_id === null) {
        ids.push(cursor.value.id);
        await cursor.update({ ...cursor.value, user_id: userId });
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return ids;
  }
}

export function createIndexedDBLocalStore(): LocalStore {
  return new IndexedDBLocalStore();
}
