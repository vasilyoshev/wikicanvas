// src/features/sessions/queries.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import {
  sessionKeys,
  useCreateSession,
  useRenameSession,
  useDeleteSession,
  useUpdateViewport,
  useUpdateNodeGeometry,
  useAddNode,
  useAddEdge,
} from "@/src/features/sessions/queries";
import * as localRepo from "@/src/features/sessions/local-repository";
import { syncBus } from "@/src/lib/sync-bus";

jest.mock("@/src/features/sessions/local-repository", () => ({
  listSessions: jest.fn(),
  getSessionBundle: jest.fn(),
  createSession: jest.fn(),
  renameSession: jest.fn(),
  deleteSession: jest.fn(),
  updateViewport: jest.fn(),
  updateNodeGeometry: jest.fn(),
  addNode: jest.fn(),
  addEdge: jest.fn(),
}));

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("sessionKeys", () => {
  it("uses 'anonymous' for a null userId in list keys", () => {
    expect(sessionKeys.all).toEqual(["sessions"]);
    expect(sessionKeys.list(null)).toEqual(["sessions", "list", "anonymous"]);
    expect(sessionKeys.list("u-1")).toEqual(["sessions", "list", "u-1"]);
    expect(sessionKeys.bundle("s-1")).toEqual(["sessions", "bundle", "s-1"]);
  });
});

describe("session mutations notify the sync-bus and invalidate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("useCreateSession returns the new session", async () => {
    (localRepo.createSession as jest.Mock).mockResolvedValue({
      session: { id: "s-1", title: "Octopus" },
      nodes: [],
      edges: [],
    });
    const client = newClient();
    const { result } = renderHook(() => useCreateSession(), { wrapper: makeWrapper(client) });
    const session = await result.current.mutateAsync({
      title: "Octopus",
      root: { lang: "en", articleTitle: "Octopus" },
    });
    expect(session).toMatchObject({ id: "s-1" });
    expect(localRepo.createSession).toHaveBeenCalledWith(null, "Octopus", {
      lang: "en",
      articleTitle: "Octopus",
    });
  });

  it("useRenameSession notifies the bus with the sessionId", async () => {
    (localRepo.renameSession as jest.Mock).mockResolvedValue({ id: "s-1", title: "New" });
    const notify = jest.spyOn(syncBus, "notify");
    const client = newClient();
    const { result } = renderHook(() => useRenameSession(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ sessionId: "s-1", title: "New" });
    expect(localRepo.renameSession).toHaveBeenCalledWith("s-1", "New");
    expect(notify).toHaveBeenCalledWith("s-1");
    notify.mockRestore();
  });

  it("useDeleteSession invalidates the list and notifies the bus", async () => {
    (localRepo.deleteSession as jest.Mock).mockResolvedValue(undefined);
    const notify = jest.spyOn(syncBus, "notify");
    const client = newClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteSession(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ sessionId: "s-1" });
    expect(localRepo.deleteSession).toHaveBeenCalledWith("s-1");
    expect(notify).toHaveBeenCalledWith("s-1");
    expect(spy).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
    notify.mockRestore();
  });

  it("useUpdateViewport passes { sessionId, viewport } through and notifies", async () => {
    (localRepo.updateViewport as jest.Mock).mockResolvedValue(undefined);
    const notify = jest.spyOn(syncBus, "notify");
    const client = newClient();
    const { result } = renderHook(() => useUpdateViewport(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ sessionId: "s-1", viewport: { x: 1, y: 2, zoom: 3 } });
    expect(localRepo.updateViewport).toHaveBeenCalledWith("s-1", { x: 1, y: 2, zoom: 3 });
    expect(notify).toHaveBeenCalledWith("s-1");
    notify.mockRestore();
  });

  it("useUpdateNodeGeometry passes { sessionId, nodeId, geom } through", async () => {
    (localRepo.updateNodeGeometry as jest.Mock).mockResolvedValue(undefined);
    const client = newClient();
    const { result } = renderHook(() => useUpdateNodeGeometry(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      sessionId: "s-1",
      nodeId: "n-1",
      geom: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect(localRepo.updateNodeGeometry).toHaveBeenCalledWith("s-1", "n-1", {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });

  it("useAddNode returns the created node and invalidates that session's bundle", async () => {
    (localRepo.addNode as jest.Mock).mockResolvedValue({ id: "n-2", sessionId: "s-1" });
    const client = newClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAddNode(), { wrapper: makeWrapper(client) });
    const node = await result.current.mutateAsync({
      sessionId: "s-1",
      node: {
        articleTitle: "Cephalopod",
        lang: "en",
        x: 420,
        y: 0,
        width: 380,
        height: 520,
        parentNodeId: "n-1",
      },
    });
    expect(node).toMatchObject({ id: "n-2" });
    expect(spy).toHaveBeenCalledWith({ queryKey: sessionKeys.bundle("s-1") });
  });

  it("useAddEdge returns the created edge", async () => {
    (localRepo.addEdge as jest.Mock).mockResolvedValue({ id: "e-1", sessionId: "s-1" });
    const client = newClient();
    const { result } = renderHook(() => useAddEdge(), { wrapper: makeWrapper(client) });
    const edge = await result.current.mutateAsync({
      sessionId: "s-1",
      edge: { sourceNodeId: "n-1", targetNodeId: "n-2", clickedLinkText: "Cephalopod" },
    });
    expect(edge).toMatchObject({ id: "e-1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
