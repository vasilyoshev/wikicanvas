// src/features/sync/apply.test.ts
import { applyMergeResult } from "@/src/features/sync/apply";
import { getLocalStore } from "@/src/lib/local-store";
import { pushBundle } from "@/src/features/sync/remote";
import type { MergeResult, SyncBundle } from "@/src/features/sync/types";

jest.mock("@/src/lib/local-store", () => ({ getLocalStore: jest.fn() }));
jest.mock("@/src/features/sync/remote", () => ({ pushBundle: jest.fn() }));

const mockGetLocalStore = jest.mocked(getLocalStore);
const mockPushBundle = jest.mocked(pushBundle);

function bundle(id: string, deletedAt: string | null = null): SyncBundle {
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
      deletedAt,
    },
    nodes: [],
    edges: [],
  };
}

describe("applyMergeResult", () => {
  let replaceBundle: jest.Mock;
  let deleteSessionDeep: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    replaceBundle = jest.fn().mockResolvedValue(undefined);
    deleteSessionDeep = jest.fn().mockResolvedValue(undefined);
    mockGetLocalStore.mockReturnValue({
      replaceBundle,
      deleteSessionDeep,
    } as unknown as ReturnType<typeof getLocalStore>);
    mockPushBundle.mockResolvedValue(undefined);
  });

  it("replaces live downloads into the local store", async () => {
    const result: MergeResult = { toUpload: [], toDownload: [bundle("s1")], unchanged: [] };
    await applyMergeResult(result);
    expect(replaceBundle).toHaveBeenCalledWith(bundle("s1"));
    expect(deleteSessionDeep).not.toHaveBeenCalled();
  });

  it("hard-deletes a downloaded tombstone locally", async () => {
    const result: MergeResult = {
      toUpload: [],
      toDownload: [bundle("s1", "2026-06-06T00:00:00.000Z")],
      unchanged: [],
    };
    await applyMergeResult(result);
    expect(deleteSessionDeep).toHaveBeenCalledWith("s1");
    expect(replaceBundle).not.toHaveBeenCalled();
  });

  it("pushes uploads to remote", async () => {
    const up = bundle("s2");
    const result: MergeResult = { toUpload: [up], toDownload: [], unchanged: [] };
    await applyMergeResult(result);
    expect(mockPushBundle).toHaveBeenCalledWith(up);
  });

  it("does nothing for unchanged ids", async () => {
    const result: MergeResult = { toUpload: [], toDownload: [], unchanged: ["s3"] };
    await applyMergeResult(result);
    expect(replaceBundle).not.toHaveBeenCalled();
    expect(deleteSessionDeep).not.toHaveBeenCalled();
    expect(mockPushBundle).not.toHaveBeenCalled();
  });
});
