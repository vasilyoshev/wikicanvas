// src/features/sync/orchestrator.test.ts
import { syncOnSignIn } from "@/src/features/sync/orchestrator";
import { adoptAnonSessions, fetchRemoteBundles } from "@/src/features/sync/remote";
import { mergeSessions } from "@/src/features/sync/merge";
import { applyMergeResult } from "@/src/features/sync/apply";
import { getLocalStore } from "@/src/lib/local-store";
import type { SyncBundle, MergeResult } from "@/src/features/sync/types";

jest.mock("@/src/features/sync/remote", () => ({
  adoptAnonSessions: jest.fn(),
  fetchRemoteBundles: jest.fn(),
}));
jest.mock("@/src/features/sync/merge", () => ({ mergeSessions: jest.fn() }));
jest.mock("@/src/features/sync/apply", () => ({ applyMergeResult: jest.fn() }));
jest.mock("@/src/lib/local-store", () => ({ getLocalStore: jest.fn() }));

const mockAdopt = jest.mocked(adoptAnonSessions);
const mockFetch = jest.mocked(fetchRemoteBundles);
const mockMerge = jest.mocked(mergeSessions);
const mockApply = jest.mocked(applyMergeResult);
const mockGetLocalStore = jest.mocked(getLocalStore);

function bundle(id: string): SyncBundle {
  return {
    session: {
      id,
      userId: "u1",
      title: id,
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
}

describe("syncOnSignIn", () => {
  let listSessions: jest.Mock;
  let getBundle: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    listSessions = jest.fn().mockResolvedValue([{ id: "s1" }]);
    getBundle = jest.fn().mockResolvedValue(bundle("s1"));
    mockGetLocalStore.mockReturnValue({
      listSessions,
      getBundle,
    } as unknown as ReturnType<typeof getLocalStore>);
    mockAdopt.mockResolvedValue([]);
    mockFetch.mockResolvedValue([bundle("s1")]);
    mockApply.mockResolvedValue(undefined);
  });

  it("adopts, reads local incl. tombstones, fetches remote, merges, applies, returns result", async () => {
    const merged: MergeResult = { toUpload: [bundle("s1")], toDownload: [], unchanged: [] };
    mockMerge.mockReturnValue(merged);

    const result = await syncOnSignIn("u1");

    expect(mockAdopt).toHaveBeenCalledWith("u1");
    expect(listSessions).toHaveBeenCalledWith("u1", true);
    expect(mockFetch).toHaveBeenCalledWith("u1");
    expect(mockMerge).toHaveBeenCalledWith([bundle("s1")], [bundle("s1")]);
    expect(mockApply).toHaveBeenCalledWith(merged);
    expect(result).toBe(merged);
  });

  it("calls adopt before reading the local session list", async () => {
    const order: string[] = [];
    mockAdopt.mockImplementation(async () => {
      order.push("adopt");
      return [];
    });
    listSessions.mockImplementation(async () => {
      order.push("list");
      return [];
    });
    mockMerge.mockReturnValue({ toUpload: [], toDownload: [], unchanged: [] });

    await syncOnSignIn("u1");
    expect(order).toEqual(["adopt", "list"]);
  });

  it("skips local sessions whose bundle is missing", async () => {
    listSessions.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    getBundle.mockResolvedValueOnce(bundle("s1")).mockResolvedValueOnce(null);
    mockMerge.mockReturnValue({ toUpload: [], toDownload: [], unchanged: [] });

    await syncOnSignIn("u1");
    expect(mockMerge).toHaveBeenCalledWith([bundle("s1")], [bundle("s1")]);
  });
});
