// src/lib/local-store/indexeddb-store.test.ts
import "fake-indexeddb/auto";
import { createIndexedDBLocalStore } from "@/src/lib/local-store/indexeddb-store";
import type { Session, Node, Edge } from "@/src/features/sessions/types";

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: "s-1",
    userId: null,
    title: "Octopus",
    viewportX: 0,
    viewportY: 0,
    viewportZoom: 1,
    createdAt: "2026-06-20T08:00:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

function makeNode(over: Partial<Node> = {}): Node {
  return {
    id: "n-1",
    sessionId: "s-1",
    articleTitle: "Octopus",
    lang: "en",
    x: 0,
    y: 0,
    width: 380,
    height: 520,
    parentNodeId: null,
    createdAt: "2026-06-20T08:00:00.000Z",
    ...over,
  };
}

function makeEdge(over: Partial<Edge> = {}): Edge {
  return {
    id: "e-1",
    sessionId: "s-1",
    sourceNodeId: "n-1",
    targetNodeId: "n-2",
    clickedLinkText: "Cephalopod",
    createdAt: "2026-06-20T08:30:00.000Z",
    ...over,
  };
}

describe("IndexedDBLocalStore", () => {
  let store: ReturnType<typeof createIndexedDBLocalStore>;

  beforeEach(async () => {
    // Fresh in-memory IndexedDB per test.
    indexedDB = new IDBFactory();
    store = createIndexedDBLocalStore();
  });

  it("upserts and reads back a session", async () => {
    const s = makeSession();
    await store.upsertSession(s);
    await expect(store.getSession("s-1")).resolves.toEqual(s);
  });

  it("listSessions(null) returns only anonymous sessions; listSessions(userId) returns only that user's", async () => {
    await store.upsertSession(makeSession({ id: "s-anon", userId: null }));
    await store.upsertSession(makeSession({ id: "s-user", userId: "u-1" }));

    // null → anonymous-only (user_id === null); never returns owned sessions
    const anon = await store.listSessions(null);
    expect(anon.map((s) => s.id)).toEqual(["s-anon"]);

    const owned = await store.listSessions("u-1");
    expect(owned.map((s) => s.id)).toEqual(["s-user"]);
  });

  it("hides soft-deleted sessions unless includeDeleted", async () => {
    await store.upsertSession(makeSession({ id: "s-live" }));
    await store.upsertSession(makeSession({ id: "s-dead", deletedAt: "2026-06-20T10:00:00.000Z" }));

    await expect(store.listSessions(null)).resolves.toHaveLength(1);
    await expect(store.listSessions(null, true)).resolves.toHaveLength(2);
  });

  it("soft-deletes a session and bumps updated_at to the given timestamp", async () => {
    await store.upsertSession(makeSession({ id: "s-1", updatedAt: "2026-06-20T08:00:00.000Z" }));
    await store.softDeleteSession("s-1", "2026-06-20T12:00:00.000Z");
    const s = await store.getSession("s-1");
    expect(s?.deletedAt).toBe("2026-06-20T12:00:00.000Z");
    expect(s?.updatedAt).toBe("2026-06-20T12:00:00.000Z");
  });

  it("stores nodes/edges by session and returns a full bundle", async () => {
    await store.upsertSession(makeSession());
    await store.upsertNode(makeNode({ id: "n-1" }));
    await store.upsertNode(makeNode({ id: "n-2", parentNodeId: "n-1" }));
    await store.upsertEdge(makeEdge());

    const bundle = await store.getBundle("s-1");
    expect(bundle?.nodes.map((n) => n.id).sort()).toEqual(["n-1", "n-2"]);
    expect(bundle?.edges.map((e) => e.id)).toEqual(["e-1"]);
  });

  it("replaceBundle atomically swaps nodes/edges", async () => {
    await store.upsertSession(makeSession());
    await store.upsertNode(makeNode({ id: "n-old" }));
    await store.replaceBundle({
      session: makeSession({ title: "New" }),
      nodes: [makeNode({ id: "n-new" })],
      edges: [],
    });
    const bundle = await store.getBundle("s-1");
    expect(bundle?.session.title).toBe("New");
    expect(bundle?.nodes.map((n) => n.id)).toEqual(["n-new"]);
  });

  it("deleteSessionDeep removes the session and its nodes/edges", async () => {
    await store.upsertSession(makeSession());
    await store.upsertNode(makeNode({ id: "n-1" }));
    await store.upsertEdge(makeEdge());
    await store.deleteSessionDeep("s-1");
    await expect(store.getSession("s-1")).resolves.toBeNull();
    await expect(store.listNodes("s-1")).resolves.toEqual([]);
    await expect(store.listEdges("s-1")).resolves.toEqual([]);
  });

  it("round-trips an article_cache entry", async () => {
    const entry = {
      key: "en:octopus",
      lang: "en",
      requestedTitle: "Octopus",
      canonicalTitle: "Octopus",
      html: "<p>hi</p>",
      license: "CC BY-SA 4.0",
      fetchedAt: 1_700_000_000_000,
      etag: null,
    };
    await store.putCacheEntry(entry);
    await expect(store.getCacheEntry("en:octopus")).resolves.toEqual(entry);
    await expect(store.getCacheEntry("en:missing")).resolves.toBeNull();
  });

  it("adoptAnonymousSessions stamps only user_id=null sessions and returns their ids", async () => {
    await store.upsertSession(makeSession({ id: "s-anon", userId: null }));
    await store.upsertSession(makeSession({ id: "s-user", userId: "u-existing" }));

    const adopted = await store.adoptAnonymousSessions("u-1");
    expect(adopted).toEqual(["s-anon"]);
    await expect(store.getSession("s-anon")).resolves.toMatchObject({ userId: "u-1" });
    await expect(store.getSession("s-user")).resolves.toMatchObject({ userId: "u-existing" });
  });
});

// fake-indexeddb provides the IDBFactory global used above.
declare const IDBFactory: { new (): IDBFactory };
