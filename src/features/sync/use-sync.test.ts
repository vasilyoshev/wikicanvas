// src/features/sync/use-sync.test.ts
import { renderHook } from "@testing-library/react-native";

import { startSyncForUser, runSyncSignIn, useSync } from "@/src/features/sync/use-sync";
import { syncBus } from "@/src/lib/sync-bus";
import {
  syncOnSignIn,
  scheduleBackgroundPush,
  flushPendingPushes,
} from "@/src/features/sync/orchestrator";
import { signInWithGoogle } from "@/src/features/auth/api";
import { useSession } from "@/src/providers/session-provider";

jest.mock("@/src/lib/sync-bus", () => ({
  syncBus: { subscribe: jest.fn(), notify: jest.fn() },
}));
jest.mock("@/src/features/sync/orchestrator", () => ({
  syncOnSignIn: jest.fn(),
  scheduleBackgroundPush: jest.fn(),
  flushPendingPushes: jest.fn(),
}));
jest.mock("@/src/features/auth/api", () => ({ signInWithGoogle: jest.fn() }));
jest.mock("@/src/providers/session-provider", () => ({ useSession: jest.fn() }));

const mockSubscribe = jest.mocked(syncBus.subscribe);
const mockSyncOnSignIn = jest.mocked(syncOnSignIn);
const mockSchedule = jest.mocked(scheduleBackgroundPush);
const mockFlush = jest.mocked(flushPendingPushes);
const mockSignIn = jest.mocked(signInWithGoogle);
const mockUseSession = jest.mocked(useSession);

describe("startSyncForUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncOnSignIn.mockResolvedValue({ toUpload: [], toDownload: [], unchanged: [] });
    mockFlush.mockResolvedValue(undefined);
  });

  it("subscribes the sync-bus to schedule a push per notified session", async () => {
    let busHandler: ((sessionId: string) => void) | undefined;
    mockSubscribe.mockImplementation((fn) => {
      busHandler = fn;
      return () => {};
    });

    startSyncForUser("u1");
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    busHandler!("s1");
    expect(mockSchedule).toHaveBeenCalledWith("u1", "s1");
  });

  it("kicks off syncOnSignIn for the user", () => {
    mockSubscribe.mockReturnValue(() => {});
    startSyncForUser("u1");
    expect(mockSyncOnSignIn).toHaveBeenCalledWith("u1");
  });

  it("cleanup unsubscribes and flushes pending pushes", () => {
    const unsubscribe = jest.fn();
    mockSubscribe.mockReturnValue(unsubscribe);

    const cleanup = startSyncForUser("u1");
    cleanup();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });
});

describe("runSyncSignIn", () => {
  beforeEach(() => jest.clearAllMocks());

  it("starts the Google sign-in flow", async () => {
    mockSignIn.mockResolvedValue(false);
    await runSyncSignIn();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});

describe("useSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncOnSignIn.mockResolvedValue({ toUpload: [], toDownload: [], unchanged: [] });
    mockSubscribe.mockReturnValue(() => {});
    mockFlush.mockResolvedValue(undefined);
  });

  it("does not start sync while signed out", () => {
    mockUseSession.mockReturnValue({ user: null } as unknown as ReturnType<typeof useSession>);
    renderHook(() => useSync());
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockSyncOnSignIn).not.toHaveBeenCalled();
  });

  it("starts sync once when a user is present", () => {
    mockUseSession.mockReturnValue({ user: { id: "u1" } } as unknown as ReturnType<
      typeof useSession
    >);
    renderHook(() => useSync());
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSyncOnSignIn).toHaveBeenCalledWith("u1");
  });

  it("cleans up (unsubscribe + flush) on unmount", () => {
    const unsubscribe = jest.fn();
    mockSubscribe.mockReturnValue(unsubscribe);
    mockUseSession.mockReturnValue({ user: { id: "u1" } } as unknown as ReturnType<
      typeof useSession
    >);

    const { unmount } = renderHook(() => useSync());
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockFlush).toHaveBeenCalled();
  });
});
