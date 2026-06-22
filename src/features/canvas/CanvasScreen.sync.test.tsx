// src/features/canvas/CanvasScreen.sync.test.tsx
import { createElement, type PropsWithChildren } from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CanvasScreen } from "@/src/features/canvas/CanvasScreen";
import { syncSessionOnOpen } from "@/src/features/sync/orchestrator";
import { useSession } from "@/src/providers/session-provider";
import { useSessionBundle } from "@/src/features/sessions/queries";

jest.mock("@/src/features/sync/orchestrator", () => ({ syncSessionOnOpen: jest.fn() }));
jest.mock("@/src/providers/session-provider", () => ({ useSession: jest.fn() }));
jest.mock("@/src/features/sessions/queries", () => ({
  useSessionBundle: jest.fn(),
  useUpdateViewport: jest.fn(() => ({ mutate: jest.fn() })),
  useUpdateNodeGeometry: jest.fn(() => ({ mutate: jest.fn() })),
  useAddNode: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useAddEdge: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useDeleteNode: jest.fn(() => ({ mutate: jest.fn() })),
}));
// CanvasBoard pulls Skia/gesture-handler; stub it to a no-op so the screen renders in jest.
jest.mock("@/src/features/canvas/CanvasBoard", () => ({ CanvasBoard: () => null }));
// use-link-spawn -> wikipedia/client -> expo-sqlite -> expo-asset (not available in Jest).
jest.mock("@/src/features/canvas/use-link-spawn", () => ({
  useLinkSpawn: jest.fn(() => ({ handleMessage: jest.fn() })),
}));
// wikipedia/client is imported directly by CanvasScreen for getArticle.
jest.mock("@/src/features/wikipedia/client", () => ({ getArticle: jest.fn() }));
// use-canvas-store uses zustand; provide a minimal stub so selector calls return no-ops.
jest.mock("@/src/features/canvas/use-canvas-store", () => ({
  useCanvasStore: jest.fn((selector: (s: unknown) => unknown) =>
    selector({
      viewport: { x: 0, y: 0, zoom: 1 },
      setViewport: jest.fn(),
      setNodeOrder: jest.fn(),
      syncNodeOrder: jest.fn(),
      reset: jest.fn(),
      bringToFront: jest.fn(),
      markNew: jest.fn(),
      clearNew: jest.fn(),
      newNodeIds: new Set<string>(),
      selectNode: jest.fn(),
    }),
  ),
}));

const mockSyncOnOpen = jest.mocked(syncSessionOnOpen);
const mockUseSession = jest.mocked(useSession);
const mockUseSessionBundle = jest.mocked(useSessionBundle);

const bundle = {
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
  nodes: [
    {
      id: "n1",
      sessionId: "s1",
      articleTitle: "T",
      lang: "en",
      x: 0,
      y: 0,
      width: 380,
      height: 520,
      parentNodeId: null,
      createdAt: "c",
    },
  ],
  edges: [],
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("CanvasScreen — syncSessionOnOpen wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncOnOpen.mockResolvedValue(undefined);
    mockUseSessionBundle.mockReturnValue({
      data: bundle,
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useSessionBundle>);
  });

  it("syncs the open session when a user is signed in", () => {
    mockUseSession.mockReturnValue({ user: { id: "u1" } } as unknown as ReturnType<
      typeof useSession
    >);
    render(<CanvasScreen sessionId="s1" />, { wrapper: makeWrapper() });
    expect(mockSyncOnOpen).toHaveBeenCalledWith("u1", "s1");
  });

  it("does not sync when signed out", () => {
    mockUseSession.mockReturnValue({ user: null } as unknown as ReturnType<typeof useSession>);
    render(<CanvasScreen sessionId="s1" />, { wrapper: makeWrapper() });
    expect(mockSyncOnOpen).not.toHaveBeenCalled();
  });
});
