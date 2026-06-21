// src/features/sessions/local-repository.test.ts
import {
  listSessions,
  getSessionBundle,
  createSession,
} from "@/src/features/sessions/local-repository";
import { getLocalStore } from "@/src/lib/local-store/index";
import type { LocalStore } from "@/src/lib/local-store/types";
import type { Session, Node, Edge, SessionBundle } from "@/src/features/sessions/types";

jest.mock("@/src/lib/local-store/index", () => ({
  getLocalStore: jest.fn(),
}));

const mockGetLocalStore = jest.mocked(getLocalStore);

function makeFakeStore(seed: { sessions?: Session[]; nodes?: Node[]; edges?: Edge[] } = {}) {
  const sessions = new Map<string, Session>((seed.sessions ?? []).map((s) => [s.id, s]));
  const nodes = [...(seed.nodes ?? [])];
  const edges = [...(seed.edges ?? [])];
  const store: LocalStore = {
    listSessions: jest.fn(async (userId, includeDeleted = false) =>
      [...sessions.values()].filter(
        (s) => s.userId === userId && (includeDeleted || s.deletedAt === null),
      ),
    ),
    getSession: jest.fn(async (id) => sessions.get(id) ?? null),
    upsertSession: jest.fn(async (s: Session) => {
      sessions.set(s.id, s);
    }),
    softDeleteSession: jest.fn(async (id, deletedAt) => {
      const s = sessions.get(id);
      if (s) sessions.set(id, { ...s, deletedAt, updatedAt: deletedAt });
    }),
    deleteSessionDeep: jest.fn(async (id) => {
      sessions.delete(id);
    }),
    listNodes: jest.fn(async (sessionId) => nodes.filter((n) => n.sessionId === sessionId)),
    upsertNode: jest.fn(async (n: Node) => {
      const i = nodes.findIndex((x) => x.id === n.id);
      if (i >= 0) nodes[i] = n;
      else nodes.push(n);
    }),
    deleteNodesForSession: jest.fn(),
    listEdges: jest.fn(async (sessionId) => edges.filter((e) => e.sessionId === sessionId)),
    upsertEdge: jest.fn(async (e: Edge) => {
      const i = edges.findIndex((x) => x.id === e.id);
      if (i >= 0) edges[i] = e;
      else edges.push(e);
    }),
    deleteEdgesForSession: jest.fn(),
    getBundle: jest.fn(async (sessionId): Promise<SessionBundle | null> => {
      const s = sessions.get(sessionId);
      if (!s) return null;
      return {
        session: s,
        nodes: nodes.filter((n) => n.sessionId === sessionId),
        edges: edges.filter((e) => e.sessionId === sessionId),
      };
    }),
    replaceBundle: jest.fn(),
    getCacheEntry: jest.fn(),
    putCacheEntry: jest.fn(),
    adoptAnonymousSessions: jest.fn(),
  };
  return { store, sessions, nodes, edges };
}

describe("local-repository: read + create", () => {
  beforeEach(() => jest.clearAllMocks());

  it("createSession writes a session + root node and returns the bundle", async () => {
    const { store } = makeFakeStore();
    mockGetLocalStore.mockReturnValue(store);

    const bundle = await createSession("u-1", "Octopus", { articleTitle: "Octopus", lang: "en" });

    expect(bundle.session.title).toBe("Octopus");
    expect(bundle.session.userId).toBe("u-1");
    expect(bundle.session.viewportZoom).toBe(1);
    expect(bundle.session.deletedAt).toBeNull();
    expect(bundle.nodes).toHaveLength(1);
    expect(bundle.nodes[0]).toMatchObject({
      sessionId: bundle.session.id,
      articleTitle: "Octopus",
      lang: "en",
      parentNodeId: null,
    });
    expect(bundle.edges).toEqual([]);
    expect(store.upsertSession).toHaveBeenCalledTimes(1);
    expect(store.upsertNode).toHaveBeenCalledTimes(1);
  });

  it("createSession supports an anonymous user (userId null)", async () => {
    const { store } = makeFakeStore();
    mockGetLocalStore.mockReturnValue(store);
    const bundle = await createSession(null, "Cephalopod", {
      articleTitle: "Cephalopod",
      lang: "en",
    });
    expect(bundle.session.userId).toBeNull();
  });

  it("getSessionBundle returns null for a missing session", async () => {
    const { store } = makeFakeStore();
    mockGetLocalStore.mockReturnValue(store);
    await expect(getSessionBundle("missing")).resolves.toBeNull();
  });

  it("listSessions returns summaries with nodeCount + previewNodes geometry", async () => {
    const session: Session = {
      id: "s-1",
      userId: "u-1",
      title: "Octopus",
      viewportX: 0,
      viewportY: 0,
      viewportZoom: 1,
      createdAt: "2026-06-20T08:00:00.000Z",
      updatedAt: "2026-06-20T09:00:00.000Z",
      deletedAt: null,
    };
    const node: Node = {
      id: "n-1",
      sessionId: "s-1",
      articleTitle: "Octopus",
      lang: "en",
      x: 10,
      y: 20,
      width: 380,
      height: 520,
      parentNodeId: null,
      createdAt: "2026-06-20T08:00:00.000Z",
    };
    const { store } = makeFakeStore({ sessions: [session], nodes: [node] });
    mockGetLocalStore.mockReturnValue(store);

    const summaries = await listSessions("u-1");
    expect(summaries).toEqual([
      {
        id: "s-1",
        title: "Octopus",
        nodeCount: 1,
        updatedAt: "2026-06-20T09:00:00.000Z",
        previewNodes: [{ x: 10, y: 20, width: 380, height: 520 }],
      },
    ]);
  });
});
