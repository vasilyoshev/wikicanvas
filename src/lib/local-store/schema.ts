// src/lib/local-store/schema.ts

/** IndexedDB database name + schema version (bump on any store/index change). */
export const DB_NAME = "wikicanvas";
export const DB_VERSION = 1;

/** Object-store / SQLite-table names. PLURAL + snake_case, identical on both platforms. */
export const STORE_SESSIONS = "sessions";
export const STORE_NODES = "nodes";
export const STORE_EDGES = "edges";
export const STORE_ARTICLE_CACHE = "article_cache";

/** IndexedDB index names (snake_case keyPaths). */
export const INDEX_BY_USER = "by_user"; // sessions.user_id
export const INDEX_BY_SESSION = "by_session"; // nodes.session_id / edges.session_id
export const INDEX_BY_TARGET = "by_target"; // edges.target_node_id

/**
 * SQLite DDL run once on first open (native adapter). Columns are snake_case to mirror the
 * Supabase rows exactly, so sync is a straight upsert. FK cascades preserve integrity on device.
 */
export const SQLITE_DDL: string[] = [
  "pragma foreign_keys = on;",
  `create table if not exists sessions (
    id text primary key not null,
    user_id text,
    title text not null,
    viewport_x real not null,
    viewport_y real not null,
    viewport_zoom real not null,
    created_at text not null,
    updated_at text not null,
    deleted_at text
  );`,
  `create table if not exists nodes (
    id text primary key not null,
    session_id text not null references sessions (id) on delete cascade,
    article_title text not null,
    lang text not null,
    x real not null,
    y real not null,
    width real not null,
    height real not null,
    parent_node_id text,
    created_at text not null
  );`,
  `create table if not exists edges (
    id text primary key not null,
    session_id text not null references sessions (id) on delete cascade,
    source_node_id text not null references nodes (id) on delete cascade,
    target_node_id text not null references nodes (id) on delete cascade,
    clicked_link_text text,
    created_at text not null
  );`,
  `create table if not exists article_cache (
    lang_title text primary key not null,
    lang text not null,
    requested_title text not null,
    canonical_title text not null,
    html text not null,
    license text not null,
    fetched_at integer not null,
    etag text
  );`,
  "create index if not exists idx_nodes_session_id on nodes (session_id);",
  "create index if not exists idx_edges_session_id on edges (session_id);",
];
