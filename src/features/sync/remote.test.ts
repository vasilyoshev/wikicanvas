// src/features/sync/remote.test.ts
import {
  adoptAnonSessions,
  fetchRemoteBundle,
  fetchRemoteBundles,
  pushBundle,
} from "@/src/features/sync/remote";
import type { SyncBundle } from "@/src/features/sync/types";
import { getLocalStore } from "@/src/lib/local-store";
import { requireSupabase } from "@/src/lib/supabase";

jest.mock("@/src/lib/supabase", () => ({
  requireSupabase: jest.fn(),
}));

jest.mock("@/src/lib/local-store", () => ({
  getLocalStore: jest.fn(),
}));

const mockGetLocalStore = jest.mocked(getLocalStore);

const mockRequireSupabase = jest.mocked(requireSupabase);

const sessionRow = {
  id: "s1",
  user_id: "u1",
  title: "Roman Empire",
  viewport_x: 0,
  viewport_y: 0,
  viewport_zoom: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
};
const nodeRow = {
  id: "n1",
  session_id: "s1",
  article_title: "Roman Empire",
  lang: "en",
  x: 0,
  y: 0,
  width: 380,
  height: 520,
  parent_node_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
};
const edgeRow = {
  id: "e1",
  session_id: "s1",
  source_node_id: "n1",
  target_node_id: "n2",
  clicked_link_text: "Augustus",
  created_at: "2026-01-01T00:00:00.000Z",
};

/** Build a fake supabase whose .from() returns table-specific resolved data. */
function fakeClient(byTable: Record<string, { data: unknown[]; error: unknown }>) {
  const from = jest.fn((table: string) => {
    const resolved = byTable[table] ?? { data: [], error: null };
    // sessions: from().select().eq() resolves; nodes/edges: from().select().in() resolves
    const eq = jest.fn().mockResolvedValue(resolved);
    const inFn = jest.fn().mockResolvedValue(resolved);
    const select = jest.fn(() => ({ eq, in: inFn }));
    return { select };
  });
  return { from } as unknown as ReturnType<typeof requireSupabase>;
}

describe("fetchRemoteBundles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns [] when the user has no sessions", async () => {
    mockRequireSupabase.mockReturnValue(fakeClient({ session: { data: [], error: null } }));
    await expect(fetchRemoteBundles("u1")).resolves.toEqual([]);
  });

  it("groups nodes/edges under their session and maps rows to domain", async () => {
    mockRequireSupabase.mockReturnValue(
      fakeClient({
        session: { data: [sessionRow], error: null },
        node: { data: [nodeRow], error: null },
        edge: { data: [edgeRow], error: null },
      }),
    );

    const bundles = await fetchRemoteBundles("u1");
    expect(bundles).toHaveLength(1);
    expect(bundles[0].session).toMatchObject({ id: "s1", userId: "u1", title: "Roman Empire" });
    expect(bundles[0].nodes).toHaveLength(1);
    expect(bundles[0].nodes[0]).toMatchObject({
      id: "n1",
      sessionId: "s1",
      articleTitle: "Roman Empire",
    });
    expect(bundles[0].edges[0]).toMatchObject({ id: "e1", sessionId: "s1", sourceNodeId: "n1" });
  });

  it("queries sessions by user_id and child rows by session_id (not user_id)", async () => {
    const eq = jest.fn().mockResolvedValue({ data: [sessionRow], error: null });
    const inFn = jest.fn().mockResolvedValue({ data: [], error: null });
    const select = jest.fn(() => ({ eq, in: inFn }));
    const from = jest.fn(() => ({ select }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await fetchRemoteBundles("u1");

    expect(from).toHaveBeenCalledWith("session");
    expect(from).toHaveBeenCalledWith("node");
    expect(from).toHaveBeenCalledWith("edge");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(inFn).toHaveBeenCalledWith("session_id", ["s1"]);
  });

  it("throws when the sessions query errors", async () => {
    mockRequireSupabase.mockReturnValue(
      fakeClient({ session: { data: [], error: { message: "boom" } } }),
    );
    await expect(fetchRemoteBundles("u1")).rejects.toEqual({ message: "boom" });
  });
});

/** Fake client for the single-session fetch chain: session via select().eq().eq().maybeSingle(). */
function fakeOneClient(
  sessionData: { data: unknown; error: unknown },
  nodeData: { data: unknown[]; error: unknown },
  edgeData: { data: unknown[]; error: unknown },
) {
  const from = jest.fn((table: string) => {
    if (table === "session") {
      const maybeSingle = jest.fn().mockResolvedValue(sessionData);
      const eqId = jest.fn(() => ({ maybeSingle }));
      const eqUser = jest.fn(() => ({ eq: eqId }));
      return { select: jest.fn(() => ({ eq: eqUser })) };
    }
    const eq = jest.fn().mockResolvedValue(table === "node" ? nodeData : edgeData);
    return { select: jest.fn(() => ({ eq })) };
  });
  return { from } as unknown as ReturnType<typeof requireSupabase>;
}

describe("fetchRemoteBundle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when the session is absent for that user", async () => {
    mockRequireSupabase.mockReturnValue(
      fakeOneClient(
        { data: null, error: null },
        { data: [], error: null },
        { data: [], error: null },
      ),
    );
    await expect(fetchRemoteBundle("u1", "s1")).resolves.toBeNull();
  });

  it("returns the single session's mapped bundle", async () => {
    mockRequireSupabase.mockReturnValue(
      fakeOneClient(
        { data: sessionRow, error: null },
        { data: [nodeRow], error: null },
        { data: [edgeRow], error: null },
      ),
    );
    const result = await fetchRemoteBundle("u1", "s1");
    expect(result?.session).toMatchObject({ id: "s1", userId: "u1" });
    expect(result?.nodes[0]).toMatchObject({ id: "n1", sessionId: "s1" });
    expect(result?.edges[0]).toMatchObject({ id: "e1", sessionId: "s1" });
  });
});

function makeBundle(): SyncBundle {
  return {
    session: {
      id: "s1",
      userId: "u1",
      title: "Roman Empire",
      viewportX: 0,
      viewportY: 0,
      viewportZoom: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: null,
    },
    nodes: [
      {
        id: "n1",
        sessionId: "s1",
        articleTitle: "Roman Empire",
        lang: "en",
        x: 0,
        y: 0,
        width: 380,
        height: 520,
        parentNodeId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    edges: [
      {
        id: "e1",
        sessionId: "s1",
        sourceNodeId: "n1",
        targetNodeId: "n2",
        clickedLinkText: "Augustus",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

describe("pushBundle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("upserts session + children first, then deletes stale child rows, omitting user_id on children", async () => {
    const sessionUpsert = jest.fn().mockResolvedValue({ error: null });
    const nodeUpsert = jest.fn().mockResolvedValue({ error: null });
    const edgeUpsert = jest.fn().mockResolvedValue({ error: null });
    const nodeNot = jest.fn().mockResolvedValue({ error: null });
    const edgeNot = jest.fn().mockResolvedValue({ error: null });
    const nodeDeleteEq = jest.fn(() => ({ not: nodeNot }));
    const edgeDeleteEq = jest.fn(() => ({ not: edgeNot }));
    const nodeDelete = jest.fn(() => ({ eq: nodeDeleteEq }));
    const edgeDelete = jest.fn(() => ({ eq: edgeDeleteEq }));

    const from = jest.fn((table: string) => {
      if (table === "session") return { upsert: sessionUpsert };
      if (table === "node") return { upsert: nodeUpsert, delete: nodeDelete };
      if (table === "edge") return { upsert: edgeUpsert, delete: edgeDelete };
      throw new Error(`unexpected table ${table}`);
    });
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await pushBundle(makeBundle());

    // session upserted as a row (snake_case)
    expect(sessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1", user_id: "u1", viewport_zoom: 1 }),
    );

    const nodePayload = nodeUpsert.mock.calls[0][0][0];
    expect(nodePayload).toMatchObject({
      id: "n1",
      session_id: "s1",
      article_title: "Roman Empire",
    });
    expect(nodePayload).not.toHaveProperty("user_id");

    const edgePayload = edgeUpsert.mock.calls[0][0][0];
    expect(edgePayload).toMatchObject({ id: "e1", session_id: "s1", source_node_id: "n1" });
    expect(edgePayload).not.toHaveProperty("user_id");

    // stale children removed by session_id, excluding the ids still in the bundle
    expect(edgeDeleteEq).toHaveBeenCalledWith("session_id", "s1");
    expect(edgeNot).toHaveBeenCalledWith("id", "in", "(e1)");
    expect(nodeDeleteEq).toHaveBeenCalledWith("session_id", "s1");
    expect(nodeNot).toHaveBeenCalledWith("id", "in", "(n1)");
  });

  it("throws when the session upsert errors", async () => {
    const from = jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ error: { message: "no" } }),
    }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);
    await expect(pushBundle(makeBundle())).rejects.toEqual({ message: "no" });
  });
});

describe("adoptAnonSessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns [] when there are no anonymous sessions", async () => {
    mockGetLocalStore.mockReturnValue({
      adoptAnonymousSessions: jest.fn().mockResolvedValue([]),
      getBundle: jest.fn(),
    } as unknown as ReturnType<typeof getLocalStore>);

    await expect(adoptAnonSessions("u1")).resolves.toEqual([]);
  });

  it("stamps anon sessions, then loads each adopted bundle", async () => {
    const adoptedBundle = {
      session: {
        id: "s1",
        userId: "u1",
        title: "T",
        viewportX: 0,
        viewportY: 0,
        viewportZoom: 1,
        createdAt: "c",
        updatedAt: "u",
        deletedAt: null,
      },
      nodes: [],
      edges: [],
    };
    const adoptAnonymousSessions = jest.fn().mockResolvedValue(["s1"]);
    const getBundle = jest.fn().mockResolvedValue(adoptedBundle);
    mockGetLocalStore.mockReturnValue({
      adoptAnonymousSessions,
      getBundle,
    } as unknown as ReturnType<typeof getLocalStore>);

    const result = await adoptAnonSessions("u1");

    expect(adoptAnonymousSessions).toHaveBeenCalledWith("u1");
    expect(getBundle).toHaveBeenCalledWith("s1");
    expect(result).toEqual([adoptedBundle]);
  });

  it("skips an adopted id whose bundle is missing", async () => {
    mockGetLocalStore.mockReturnValue({
      adoptAnonymousSessions: jest.fn().mockResolvedValue(["s1", "s2"]),
      getBundle: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ session: { id: "s2" }, nodes: [], edges: [] }),
    } as unknown as ReturnType<typeof getLocalStore>);

    const result = await adoptAnonSessions("u1");
    expect(result).toEqual([{ session: { id: "s2" }, nodes: [], edges: [] }]);
  });
});
