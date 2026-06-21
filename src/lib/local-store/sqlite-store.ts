// src/lib/local-store/sqlite-store.ts
import * as SQLite from "expo-sqlite";

import type { Session, Node, Edge, SessionBundle } from "@/src/features/sessions/types";
import type { CacheEntry, LocalStore } from "@/src/lib/local-store/types";
import { DB_NAME, SQLITE_DDL } from "@/src/lib/local-store/schema";
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

/** expo-sqlite-backed LocalStore. Stores ROW shape; maps via row-mapping on read/write. */
export class SqliteLocalStore implements LocalStore {
  private dbPromise: Promise<SQLite.SQLiteDatabase>;

  constructor() {
    this.dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(`${DB_NAME}.db`);
      for (const stmt of SQLITE_DDL) {
        await db.execAsync(stmt);
      }
      return db;
    })();
  }

  private db() {
    return this.dbPromise;
  }

  async listSessions(userId: string | null, includeDeleted = false): Promise<Session[]> {
    const db = await this.db();
    const where = userId === null ? "user_id is null" : "user_id = ?";
    const liveClause = includeDeleted ? "" : " and deleted_at is null";
    const params = userId === null ? [] : [userId];
    const rows = await db.getAllAsync<SessionRow>(
      `select * from sessions where ${where}${liveClause}`,
      params,
    );
    return rows.map(sessionRowToDomain);
  }

  async getSession(id: string): Promise<Session | null> {
    const db = await this.db();
    const row = await db.getFirstAsync<SessionRow>("select * from sessions where id = ?", [id]);
    return row ? sessionRowToDomain(row) : null;
  }

  async upsertSession(session: Session): Promise<void> {
    const db = await this.db();
    const r = sessionToRow(session);
    await db.runAsync(
      `insert into sessions
         (id, user_id, title, viewport_x, viewport_y, viewport_zoom, created_at, updated_at, deleted_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         user_id = excluded.user_id,
         title = excluded.title,
         viewport_x = excluded.viewport_x,
         viewport_y = excluded.viewport_y,
         viewport_zoom = excluded.viewport_zoom,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      [
        r.id,
        r.user_id,
        r.title,
        r.viewport_x,
        r.viewport_y,
        r.viewport_zoom,
        r.created_at,
        r.updated_at,
        r.deleted_at,
      ],
    );
  }

  async softDeleteSession(id: string, deletedAt: string): Promise<void> {
    const db = await this.db();
    await db.runAsync("update sessions set deleted_at = ?, updated_at = ? where id = ?", [
      deletedAt,
      deletedAt,
      id,
    ]);
  }

  async deleteSessionDeep(id: string): Promise<void> {
    const db = await this.db();
    // FK cascade removes nodes/edges (pragma foreign_keys=on in SQLITE_DDL).
    await db.runAsync("delete from sessions where id = ?", [id]);
  }

  async listNodes(sessionId: string): Promise<Node[]> {
    const db = await this.db();
    const rows = await db.getAllAsync<NodeRow>("select * from nodes where session_id = ?", [
      sessionId,
    ]);
    return rows.map(nodeRowToDomain);
  }

  async upsertNode(node: Node): Promise<void> {
    const db = await this.db();
    const r = nodeToRow(node);
    await db.runAsync(
      `insert into nodes
         (id, session_id, article_title, lang, x, y, width, height, parent_node_id, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         session_id = excluded.session_id,
         article_title = excluded.article_title,
         lang = excluded.lang,
         x = excluded.x,
         y = excluded.y,
         width = excluded.width,
         height = excluded.height,
         parent_node_id = excluded.parent_node_id,
         created_at = excluded.created_at`,
      [
        r.id,
        r.session_id,
        r.article_title,
        r.lang,
        r.x,
        r.y,
        r.width,
        r.height,
        r.parent_node_id,
        r.created_at,
      ],
    );
  }

  async deleteNodesForSession(sessionId: string): Promise<void> {
    const db = await this.db();
    await db.runAsync("delete from nodes where session_id = ?", [sessionId]);
  }

  async listEdges(sessionId: string): Promise<Edge[]> {
    const db = await this.db();
    const rows = await db.getAllAsync<EdgeRow>("select * from edges where session_id = ?", [
      sessionId,
    ]);
    return rows.map(edgeRowToDomain);
  }

  async upsertEdge(edge: Edge): Promise<void> {
    const db = await this.db();
    const r = edgeToRow(edge);
    await db.runAsync(
      `insert into edges
         (id, session_id, source_node_id, target_node_id, clicked_link_text, created_at)
       values (?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         session_id = excluded.session_id,
         source_node_id = excluded.source_node_id,
         target_node_id = excluded.target_node_id,
         clicked_link_text = excluded.clicked_link_text,
         created_at = excluded.created_at`,
      [r.id, r.session_id, r.source_node_id, r.target_node_id, r.clicked_link_text, r.created_at],
    );
  }

  async deleteEdgesForSession(sessionId: string): Promise<void> {
    const db = await this.db();
    await db.runAsync("delete from edges where session_id = ?", [sessionId]);
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
    await db.withTransactionAsync(async () => {
      const id = bundle.session.id;
      await db.runAsync("delete from edges where session_id = ?", [id]);
      await db.runAsync("delete from nodes where session_id = ?", [id]);
      await this.upsertSession(bundle.session);
      for (const n of bundle.nodes) await this.upsertNode(n);
      for (const e of bundle.edges) await this.upsertEdge(e);
    });
  }

  async getCacheEntry(key: string): Promise<CacheEntry | null> {
    const db = await this.db();
    const row = await db.getFirstAsync<CacheRow>(
      "select * from article_cache where lang_title = ?",
      [key],
    );
    return row ? cacheRowToEntry(row) : null;
  }

  async putCacheEntry(entry: CacheEntry): Promise<void> {
    const db = await this.db();
    const r = cacheEntryToRow(entry);
    await db.runAsync(
      `insert into article_cache
         (lang_title, lang, requested_title, canonical_title, html, license, fetched_at, etag)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(lang_title) do update set
         lang = excluded.lang,
         requested_title = excluded.requested_title,
         canonical_title = excluded.canonical_title,
         html = excluded.html,
         license = excluded.license,
         fetched_at = excluded.fetched_at,
         etag = excluded.etag`,
      [
        r.lang_title,
        r.lang,
        r.requested_title,
        r.canonical_title,
        r.html,
        r.license,
        r.fetched_at,
        r.etag,
      ],
    );
  }

  async adoptAnonymousSessions(userId: string): Promise<string[]> {
    const db = await this.db();
    const rows = await db.getAllAsync<{ id: string }>(
      "select id from sessions where user_id is null",
    );
    await db.runAsync("update sessions set user_id = ? where user_id is null", [userId]);
    return rows.map((r) => r.id);
  }
}

export function createSqliteLocalStore(): LocalStore {
  return new SqliteLocalStore();
}
