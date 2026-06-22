// src/features/sync/orchestrator.test.ts
import {
  syncOnSignIn,
  syncSessionOnOpen,
  scheduleBackgroundPush,
  flushPendingPushes,
  BACKGROUND_PUSH_DEBOUNCE_MS,
} from "@/src/features/sync/orchestrator";
import {
  adoptAnonSessions,
  fetchRemoteBundle,
  fetchRemoteBundles,
  pushBundle,
} from "@/src/features/sync/remote";
import { mergeSessions } from "@/src/features/sync/merge";
import { applyMergeResult } from "@/src/features/sync/apply";
import { getLocalStore } from "@/src/lib/local-store";
import type { SyncBundle, MergeResult } from "@/src/features/sync/types";

jest.mock("@/src/features/sync/remote", () => ({
  adoptAnonSessions: jest.fn(),
  fetchRemoteBundle: jest.fn(),
  fetchRemoteBundles: jest.fn(),
  pushBundle: jest.fn(),
}));
jest.mock("@/src/features/sync/merge", () => ({ mergeSessions: jest.fn() }));
jest.mock("@/src/features/sync/apply", () => ({ applyMergeResult: jest.fn() }));
jest.mock("@/src/lib/local-store", () => ({ getLocalStore: jest.fn() }));

const mockAdopt = jest.mocked(adoptAnonSessions);
const mockFetch = jest.mocked(fetchRemoteBundles);
const mockFetchOne = jest.mocked(fetchRemoteBundle);
const mockMerge = jest.mocked(mergeSessions);
const mockApply = jest.mocked(applyMergeResult);
const mockGetLocalStore = jest.mocked(getLocalStore);
const mockPushBundle = jest.mocked(pushBundle);

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

describe("syncSessionOnOpen", () => {
  let getBundle: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getBundle = jest.fn();
    mockGetLocalStore.mockReturnValue({
      getBundle,
    } as unknown as ReturnType<typeof getLocalStore>);
    mockApply.mockResolvedValue(undefined);
  });

  it("merges the one local bundle against the single fetched remote bundle and applies", async () => {
    getBundle.mockResolvedValue(bundle("s1"));
    mockFetchOne.mockResolvedValue(bundle("s1"));
    const merged: MergeResult = { toUpload: [], toDownload: [bundle("s1")], unchanged: [] };
    mockMerge.mockReturnValue(merged);

    await syncSessionOnOpen("u1", "s1");

    // fetches ONLY this session (not the whole remote dataset)
    expect(mockFetchOne).toHaveBeenCalledWith("u1", "s1");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(getBundle).toHaveBeenCalledWith("s1");
    expect(mockMerge).toHaveBeenCalledWith([bundle("s1")], [bundle("s1")]);
    expect(mockApply).toHaveBeenCalledWith(merged);
  });

  it("treats a session absent locally as an empty local side (remote-only download)", async () => {
    getBundle.mockResolvedValue(null);
    mockFetchOne.mockResolvedValue(bundle("s1"));
    mockMerge.mockReturnValue({ toUpload: [], toDownload: [bundle("s1")], unchanged: [] });

    await syncSessionOnOpen("u1", "s1");
    expect(mockMerge).toHaveBeenCalledWith([], [bundle("s1")]);
  });

  it("is a no-op when the id exists on neither side", async () => {
    getBundle.mockResolvedValue(null);
    mockFetchOne.mockResolvedValue(null);
    mockMerge.mockReturnValue({ toUpload: [], toDownload: [], unchanged: [] });

    await syncSessionOnOpen("u1", "missing");
    expect(mockMerge).toHaveBeenCalledWith([], []);
    expect(mockApply).toHaveBeenCalledWith({ toUpload: [], toDownload: [], unchanged: [] });
  });
});

describe("scheduleBackgroundPush / flushPendingPushes", () => {
  let getBundle: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    getBundle = jest.fn().mockResolvedValue(bundle("s1"));
    mockGetLocalStore.mockReturnValue({
      getBundle,
    } as unknown as ReturnType<typeof getLocalStore>);
    mockPushBundle.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushPendingPushes();
    jest.useRealTimers();
  });

  it("is a no-op when signed out (userId null)", () => {
    scheduleBackgroundPush(null, "s1");
    jest.advanceTimersByTime(BACKGROUND_PUSH_DEBOUNCE_MS + 100);
    expect(getBundle).not.toHaveBeenCalled();
    expect(mockPushBundle).not.toHaveBeenCalled();
  });

  it("pushes the bundle after the debounce window elapses", async () => {
    scheduleBackgroundPush("u1", "s1");
    expect(mockPushBundle).not.toHaveBeenCalled();

    jest.advanceTimersByTime(BACKGROUND_PUSH_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(getBundle).toHaveBeenCalledWith("s1");
    expect(mockPushBundle).toHaveBeenCalledWith(bundle("s1"));
  });

  it("debounces rapid calls for the same session into a single push", async () => {
    scheduleBackgroundPush("u1", "s1");
    jest.advanceTimersByTime(BACKGROUND_PUSH_DEBOUNCE_MS - 200);
    scheduleBackgroundPush("u1", "s1");
    jest.advanceTimersByTime(BACKGROUND_PUSH_DEBOUNCE_MS - 200);
    expect(mockPushBundle).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockPushBundle).toHaveBeenCalledTimes(1);
  });

  it("keeps separate debounce timers per session", async () => {
    getBundle.mockImplementation(async (id: string) => bundle(id));
    scheduleBackgroundPush("u1", "s1");
    scheduleBackgroundPush("u1", "s2");
    jest.advanceTimersByTime(BACKGROUND_PUSH_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockPushBundle).toHaveBeenCalledTimes(2);
    expect(mockPushBundle).toHaveBeenCalledWith(bundle("s1"));
    expect(mockPushBundle).toHaveBeenCalledWith(bundle("s2"));
  });

  it("flushPendingPushes runs a queued push immediately without waiting", async () => {
    scheduleBackgroundPush("u1", "s1");
    await flushPendingPushes();
    expect(mockPushBundle).toHaveBeenCalledWith(bundle("s1"));
    // timer was cleared: advancing does not double-push
    jest.advanceTimersByTime(BACKGROUND_PUSH_DEBOUNCE_MS);
    await Promise.resolve();
    expect(mockPushBundle).toHaveBeenCalledTimes(1);
  });

  it("swallows push errors so a failed push never rejects to the caller", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockPushBundle.mockRejectedValue(new Error("network down"));
    scheduleBackgroundPush("u1", "s1");
    await expect(flushPendingPushes()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
