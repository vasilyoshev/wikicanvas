import type { Page } from "@playwright/test";

// Schema constants MUST match src/lib/local-store/schema.ts (Phase 2). Kept here as
// literals because the e2e runs against the built web bundle, not the TS source.
const DB_NAME = "wikicanvas";
const DB_VERSION = 1;

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

/**
 * Seed ROW objects (snake_case) into the PLURAL IndexedDB object stores so a single
 * platform-agnostic seed round-trips through row-mapping into the running app.
 */
export async function seedSessions(
  page: Page,
  data: { sessions: SeedSessionRow[]; nodes: SeedNodeRow[] },
): Promise<void> {
  await page.evaluate(
    ({ dbName, dbVersion, sessions, nodes }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName, dbVersion);
        open.onerror = () => reject(open.error);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("sessions")) {
            const s = db.createObjectStore("sessions", { keyPath: "id" });
            s.createIndex("by_user", "user_id");
          }
          if (!db.objectStoreNames.contains("nodes")) {
            const n = db.createObjectStore("nodes", { keyPath: "id" });
            n.createIndex("by_session", "session_id");
          }
          if (!db.objectStoreNames.contains("edges")) {
            const e = db.createObjectStore("edges", { keyPath: "id" });
            e.createIndex("by_session", "session_id");
          }
          if (!db.objectStoreNames.contains("article_cache")) {
            db.createObjectStore("article_cache", { keyPath: "lang_title" });
          }
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["sessions", "nodes"], "readwrite");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          const sessionStore = tx.objectStore("sessions");
          const nodeStore = tx.objectStore("nodes");
          for (const s of sessions) sessionStore.put(s);
          for (const n of nodes) nodeStore.put(n);
        };
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION, sessions: data.sessions, nodes: data.nodes },
  );
}

export async function clearSessions(page: Page): Promise<void> {
  await page
    .evaluate(
      (dbName) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        }),
      DB_NAME,
    )
    .catch(() => undefined);
}
