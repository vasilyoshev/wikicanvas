import type { Page } from "@playwright/test";

// Must match supabase/migrations + schema.ts: PLURAL stores, snake_case columns.
export const DB_NAME = "wikicanvas";
export const DB_VERSION = 1;

export interface SeedSessionRow {
  id: string;
  user_id: string | null;
  title: string;
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface SeedNodeRow {
  id: string;
  session_id: string;
  article_title: string;
  lang: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent_node_id: string | null;
  created_at: string;
}
export interface SeedEdgeRow {
  id: string;
  session_id: string;
  source_node_id: string;
  target_node_id: string;
  clicked_link_text: string | null;
  created_at: string;
}

export interface SeedBundle {
  session: SeedSessionRow;
  nodes: SeedNodeRow[];
  edges: SeedEdgeRow[];
}

// A minimal /with_html-shaped JSON the wiki-proxy passthrough returns.
export function articleFixture(title: string): Record<string, unknown> {
  return {
    title,
    key: title.replace(/ /g, "_"),
    html: `<!DOCTYPE html><html><body><h1>${title}</h1><p>Body of ${title}. <a href="/wiki/Linked_Article">Linked Article</a></p></body></html>`,
    license: { type: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  };
}

// Intercept every wiki-proxy call (article + search) and answer with a fixture.
export async function mockWikiProxy(page: Page): Promise<void> {
  await page.route("**/functions/v1/wiki-proxy**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "search") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ pages: [] }),
      });
    }
    const title = url.searchParams.get("title") ?? "Article";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", etag: '"seed-etag"' },
      body: JSON.stringify(articleFixture(title)),
    });
  });
}

// Write ROW objects into the PLURAL IndexedDB stores the app reads from.
// Opens the DB using the same upgrade callback as the app so that the stores
// exist even if this evaluate runs before the app's own openDB completes.
export async function seedBundle(page: Page, bundle: SeedBundle): Promise<void> {
  await page.evaluate(
    ({ dbName, dbVersion, b }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onerror = () => reject(req.error);
        // Create stores if this is the first open (the app may not have run yet).
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("sessions")) {
            const sessions = db.createObjectStore("sessions", { keyPath: "id" });
            sessions.createIndex("by_user", "user_id");
          }
          if (!db.objectStoreNames.contains("nodes")) {
            const nodes = db.createObjectStore("nodes", { keyPath: "id" });
            nodes.createIndex("by_session", "session_id");
          }
          if (!db.objectStoreNames.contains("edges")) {
            const edges = db.createObjectStore("edges", { keyPath: "id" });
            edges.createIndex("by_session", "session_id");
          }
          if (!db.objectStoreNames.contains("article_cache")) {
            db.createObjectStore("article_cache", { keyPath: "lang_title" });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["sessions", "nodes", "edges"], "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore("sessions").put(b.session);
          for (const n of b.nodes) tx.objectStore("nodes").put(n);
          for (const e of b.edges) tx.objectStore("edges").put(e);
        };
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION, b: bundle },
  );
}

// Read one node row back (to assert persisted geometry after a drag).
export async function readNodeRow(page: Page, nodeId: string): Promise<SeedNodeRow | null> {
  return page.evaluate(
    ({ dbName, dbVersion, id }) =>
      new Promise<SeedNodeRow | null>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["nodes"], "readonly");
          const get = tx.objectStore("nodes").get(id);
          get.onsuccess = () => resolve((get.result as SeedNodeRow) ?? null);
          get.onerror = () => reject(get.error);
        };
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION, id: nodeId },
  );
}
