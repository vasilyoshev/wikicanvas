// src/features/sessions/repository.test.ts
import {
  listRemoteSessions,
  getRemoteSession,
  upsertRemoteSession,
  listRemoteNodes,
  listRemoteEdges,
  upsertRemoteNodes,
  upsertRemoteEdges,
  softDeleteRemoteSession,
} from "@/src/features/sessions/repository";
import { requireSupabase } from "@/src/lib/supabase";
import type { Node, Session } from "@/src/features/sessions/types";

jest.mock("@/src/lib/supabase", () => ({
  requireSupabase: jest.fn(),
}));

const mockRequireSupabase = jest.mocked(requireSupabase);

const sessionRow = {
  id: "s-1",
  user_id: "u-1",
  title: "Octopus",
  viewport_x: 0,
  viewport_y: 0,
  viewport_zoom: 1,
  created_at: "2026-06-20T08:00:00.000Z",
  updated_at: "2026-06-20T08:00:00.000Z",
  deleted_at: null,
};

const nodeRow = {
  id: "n-1",
  session_id: "s-1",
  article_title: "Octopus",
  lang: "en",
  x: 0,
  y: 0,
  width: 380,
  height: 520,
  parent_node_id: null,
  created_at: "2026-06-20T08:00:00.000Z",
};

const edgeRow = {
  id: "e-1",
  session_id: "s-1",
  source_node_id: "n-1",
  target_node_id: "n-2",
  clicked_link_text: "Cephalopod",
  created_at: "2026-06-20T08:30:00.000Z",
};

describe("sessions remote repository", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists a user's live sessions and maps rows to domain", async () => {
    const order = jest.fn().mockResolvedValue({ data: [sessionRow], error: null });
    const isNull = jest.fn(() => ({ order }));
    const eq = jest.fn(() => ({ is: isNull }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await expect(listRemoteSessions("u-1")).resolves.toEqual([
      {
        id: "s-1",
        userId: "u-1",
        title: "Octopus",
        viewportX: 0,
        viewportY: 0,
        viewportZoom: 1,
        createdAt: "2026-06-20T08:00:00.000Z",
        updatedAt: "2026-06-20T08:00:00.000Z",
        deletedAt: null,
      },
    ]);
    expect(from).toHaveBeenCalledWith("session");
    expect(eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(isNull).toHaveBeenCalledWith("deleted_at", null);
  });

  it("lists all sessions including tombstones when includeDeleted", async () => {
    const order = jest.fn().mockResolvedValue({ data: [sessionRow], error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await listRemoteSessions("u-1", true);
    // includeDeleted skips the .is("deleted_at", null) filter
    expect(eq).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("returns null when getRemoteSession finds no row", async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eqId = jest.fn(() => ({ maybeSingle }));
    const eqUser = jest.fn(() => ({ eq: eqId }));
    const select = jest.fn(() => ({ eq: eqUser }));
    const from = jest.fn(() => ({ select }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await expect(getRemoteSession("u-1", "missing")).resolves.toBeNull();
    expect(eqUser).toHaveBeenCalledWith("user_id", "u-1");
    expect(eqId).toHaveBeenCalledWith("id", "missing");
  });

  it("upserts a session row and maps the returned row", async () => {
    const single = jest.fn().mockResolvedValue({ data: sessionRow, error: null });
    const select = jest.fn(() => ({ single }));
    const upsert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ upsert }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    const session: Session = {
      id: "s-1",
      userId: "u-1",
      title: "Octopus",
      viewportX: 0,
      viewportY: 0,
      viewportZoom: 1,
      createdAt: "2026-06-20T08:00:00.000Z",
      updatedAt: "2026-06-20T08:00:00.000Z",
      deletedAt: null,
    };
    await expect(upsertRemoteSession(session)).resolves.toMatchObject({ id: "s-1" });
    expect(from).toHaveBeenCalledWith("session");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s-1", user_id: "u-1", viewport_zoom: 1 }),
    );
  });

  it("lists nodes BY session_id (never by user_id) and maps rows", async () => {
    const eq = jest.fn().mockResolvedValue({ data: [nodeRow], error: null });
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await expect(listRemoteNodes("u-1", "s-1")).resolves.toEqual([
      {
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
      },
    ]);
    expect(from).toHaveBeenCalledWith("node");
    expect(eq).toHaveBeenCalledWith("session_id", "s-1");
    // never filters nodes by user_id
    expect(eq).not.toHaveBeenCalledWith("user_id", expect.anything());
  });

  it("lists edges BY session_id and maps rows", async () => {
    const eq = jest.fn().mockResolvedValue({ data: [edgeRow], error: null });
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await expect(listRemoteEdges("u-1", "s-1")).resolves.toEqual([
      {
        id: "e-1",
        sessionId: "s-1",
        sourceNodeId: "n-1",
        targetNodeId: "n-2",
        clickedLinkText: "Cephalopod",
        createdAt: "2026-06-20T08:30:00.000Z",
      },
    ]);
    expect(from).toHaveBeenCalledWith("edge");
    expect(eq).toHaveBeenCalledWith("session_id", "s-1");
  });

  it("upserts node rows WITHOUT a user_id field", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn(() => ({ upsert }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    const node: Node = {
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
    };
    await upsertRemoteNodes([node]);
    expect(from).toHaveBeenCalledWith("node");
    const payload = upsert.mock.calls[0][0][0];
    expect(payload.session_id).toBe("s-1");
    expect("user_id" in payload).toBe(false);
  });

  it("no-ops upsertRemoteNodes/Edges on an empty array", async () => {
    const from = jest.fn();
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);
    await upsertRemoteNodes([]);
    await upsertRemoteEdges([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts edge rows WITHOUT a user_id field", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn(() => ({ upsert }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await upsertRemoteEdges([
      {
        id: "e-1",
        sessionId: "s-1",
        sourceNodeId: "n-1",
        targetNodeId: "n-2",
        clickedLinkText: null,
        createdAt: "2026-06-20T08:30:00.000Z",
      },
    ]);
    const payload = upsert.mock.calls[0][0][0];
    expect(payload.source_node_id).toBe("n-1");
    expect("user_id" in payload).toBe(false);
  });

  it("soft-deletes a remote session scoped to the user", async () => {
    const eqId = jest.fn().mockResolvedValue({ error: null });
    const eqUser = jest.fn(() => ({ eq: eqId }));
    const update = jest.fn(() => ({ eq: eqUser }));
    const from = jest.fn(() => ({ update }));
    mockRequireSupabase.mockReturnValue({ from } as unknown as ReturnType<typeof requireSupabase>);

    await softDeleteRemoteSession("u-1", "s-1", "2026-06-20T12:00:00.000Z");
    expect(from).toHaveBeenCalledWith("session");
    expect(update).toHaveBeenCalledWith({
      deleted_at: "2026-06-20T12:00:00.000Z",
      updated_at: "2026-06-20T12:00:00.000Z",
    });
    expect(eqUser).toHaveBeenCalledWith("user_id", "u-1");
    expect(eqId).toHaveBeenCalledWith("id", "s-1");
  });
});
