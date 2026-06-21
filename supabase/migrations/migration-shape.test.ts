// supabase/migrations/migration-shape.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "20260620120000_initial_wikicanvas.sql"),
  "utf8",
).toLowerCase();

describe("initial_wikicanvas migration", () => {
  it("creates session/node/edge tables in public", () => {
    expect(sql).toContain("create table if not exists public.session");
    expect(sql).toContain("create table if not exists public.node");
    expect(sql).toContain("create table if not exists public.edge");
  });

  it("session has user_id, viewport columns, timestamps and a deleted_at tombstone", () => {
    expect(sql).toMatch(/user_id uuid/);
    expect(sql).toContain("viewport_x real");
    expect(sql).toContain("viewport_y real");
    expect(sql).toContain("viewport_zoom real");
    expect(sql).toContain("created_at timestamptz");
    expect(sql).toContain("updated_at timestamptz");
    expect(sql).toContain("deleted_at timestamptz");
  });

  it("node has session_id FK on delete cascade and NO user_id column", () => {
    expect(sql).toMatch(
      /session_id uuid not null references public\.session \(id\) on delete cascade/,
    );
    // node has parent_node_id self-FK (nullable) for root detection
    expect(sql).toContain("parent_node_id uuid");
    // V3: node/edge carry no user_id
    const nodeBlock = sql.slice(sql.indexOf("public.node"), sql.indexOf("public.edge"));
    expect(nodeBlock).not.toContain("user_id");
  });

  it("edge cascades from session AND from source/target nodes", () => {
    expect(sql).toMatch(
      /source_node_id uuid not null references public\.node \(id\) on delete cascade/,
    );
    expect(sql).toMatch(
      /target_node_id uuid not null references public\.node \(id\) on delete cascade/,
    );
    const edgeBlock = sql.slice(sql.indexOf("public.edge"));
    expect(edgeBlock).not.toContain("user_id");
  });

  it("enables RLS on all three tables", () => {
    expect(sql).toContain("alter table public.session enable row level security");
    expect(sql).toContain("alter table public.node enable row level security");
    expect(sql).toContain("alter table public.edge enable row level security");
  });

  it("session RLS uses auth.uid() = user_id", () => {
    expect(sql).toMatch(/auth\.uid\(\) = user_id/);
  });

  it("node/edge RLS scopes via the parent session subquery", () => {
    expect(sql).toContain(
      "session_id in (select id from public.session where user_id = auth.uid())",
    );
  });

  it("indexes node(session_id) and edge(session_id)", () => {
    expect(sql).toContain(
      "create index if not exists idx_node_session_id on public.node (session_id)",
    );
    expect(sql).toContain(
      "create index if not exists idx_edge_session_id on public.edge (session_id)",
    );
  });
});
