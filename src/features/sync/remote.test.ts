// src/features/sync/remote.test.ts
import { fetchRemoteBundles } from "@/src/features/sync/remote";
import { requireSupabase } from "@/src/lib/supabase";

// --- append to src/features/sync/remote.test.ts ---
import { pushBundle } from "@/src/features/sync/remote";
import type { SyncBundle } from "@/src/features/sync/types";

jest.mock("@/src/lib/supabase", () => ({
  requireSupabase: jest.fn(),
}));

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

  it("upserts the session row, deletes then upserts child rows, omitting user_id on children", async () => {
    const sessionUpsert = jest.fn().mockResolvedValue({ error: null });
    const nodeUpsert = jest.fn().mockResolvedValue({ error: null });
    const edgeUpsert = jest.fn().mockResolvedValue({ error: null });
    const nodeDeleteEq = jest.fn().mockResolvedValue({ error: null });
    const edgeDeleteEq = jest.fn().mockResolvedValue({ error: null });
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
    // children deleted by session_id then re-inserted
    expect(nodeDelete).toHaveBeenCalled();
    expect(nodeDeleteEq).toHaveBeenCalledWith("session_id", "s1");
    expect(edgeDeleteEq).toHaveBeenCalledWith("session_id", "s1");

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
  });

  it("throws when the session upsert errors", async () => {
    const from = jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ error: { message: "no" } }),
    }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);
    await expect(pushBundle(makeBundle())).rejects.toEqual({ message: "no" });
  });
});
