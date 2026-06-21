// src/lib/local-store/schema.test.ts
import {
  DB_NAME,
  DB_VERSION,
  STORE_SESSIONS,
  STORE_NODES,
  STORE_EDGES,
  STORE_ARTICLE_CACHE,
  INDEX_BY_USER,
  INDEX_BY_SESSION,
  INDEX_BY_TARGET,
  SQLITE_DDL,
} from "@/src/lib/local-store/schema";

describe("local-store schema constants", () => {
  it("uses PLURAL snake_case store/table names", () => {
    expect(STORE_SESSIONS).toBe("sessions");
    expect(STORE_NODES).toBe("nodes");
    expect(STORE_EDGES).toBe("edges");
    expect(STORE_ARTICLE_CACHE).toBe("article_cache");
  });

  it("declares snake_case index names", () => {
    expect(INDEX_BY_USER).toBe("by_user");
    expect(INDEX_BY_SESSION).toBe("by_session");
    expect(INDEX_BY_TARGET).toBe("by_target");
  });

  it("declares a versioned IndexedDB database", () => {
    expect(DB_NAME).toBe("wikicanvas");
    expect(DB_VERSION).toBe(1);
  });

  it("provides one CREATE TABLE statement per plural table with snake_case columns", () => {
    const ddl = SQLITE_DDL.join("\n");
    expect(ddl).toContain("create table if not exists sessions");
    expect(ddl).toContain("create table if not exists nodes");
    expect(ddl).toContain("create table if not exists edges");
    expect(ddl).toContain("create table if not exists article_cache");
    // snake_case columns mirroring Supabase rows
    expect(ddl).toContain("user_id");
    expect(ddl).toContain("viewport_zoom");
    expect(ddl).toContain("session_id");
    expect(ddl).toContain("parent_node_id");
    expect(ddl).toContain("source_node_id");
    expect(ddl).toContain("target_node_id");
    expect(ddl).toContain("clicked_link_text");
    // cascade integrity on native too
    expect(ddl).toContain("on delete cascade");
  });

  it("indexes nodes and edges by session_id", () => {
    const ddl = SQLITE_DDL.join("\n");
    expect(ddl).toContain("create index if not exists idx_nodes_session_id on nodes (session_id)");
    expect(ddl).toContain("create index if not exists idx_edges_session_id on edges (session_id)");
  });
});
