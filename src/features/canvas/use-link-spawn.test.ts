// src/features/canvas/use-link-spawn.test.ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { createElement } from "react";
import * as Linking from "expo-linking";

import { useLinkSpawn } from "@/src/features/canvas/use-link-spawn";
import { getArticle } from "@/src/features/wikipedia/client";
import { useAddEdge, useAddNode } from "@/src/features/sessions/queries";
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";
import type { ArticleResult } from "@/src/features/wikipedia/types";
import type { Edge, Node } from "@/src/features/sessions/types";

jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("@/src/features/wikipedia/client", () => ({ getArticle: jest.fn() }));
jest.mock("@/src/features/sessions/queries", () => ({
  useAddNode: jest.fn(),
  useAddEdge: jest.fn(),
}));
jest.mock("@/src/features/canvas/use-canvas-store", () => ({
  useCanvasStore: jest.fn(),
}));

const mockGetArticle = getArticle as jest.MockedFunction<typeof getArticle>;
const mockUseAddNode = useAddNode as jest.MockedFunction<typeof useAddNode>;
const mockUseAddEdge = useAddEdge as jest.MockedFunction<typeof useAddEdge>;
const mockUseCanvasStore = useCanvasStore as unknown as jest.Mock;

function sourceNode(): Node {
  return {
    id: "n-src",
    sessionId: "s1",
    articleTitle: "Cat",
    lang: "en",
    x: 100,
    y: 100,
    width: 380,
    height: 520,
    parentNodeId: null,
    createdAt: "2026-06-20T00:00:00.000Z",
  };
}

function article(canonicalTitle: string): ArticleResult {
  return {
    lang: "en",
    requestedTitle: canonicalTitle,
    canonicalTitle,
    html: "<p>body</p>",
    license: "CC BY-SA 4.0",
    sourceUrl: `https://en.wikipedia.org/wiki/${canonicalTitle}`,
    fetchedAt: 1,
    etag: null,
    fromCache: false,
  };
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

const addNodeMutate = jest.fn();
const addEdgeMutate = jest.fn();
const bringToFront = jest.fn();
const markNew = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAddNode.mockReturnValue({ mutateAsync: addNodeMutate } as never);
  mockUseAddEdge.mockReturnValue({ mutateAsync: addEdgeMutate } as never);
  mockUseCanvasStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ bringToFront, markNew }),
  );
});

describe("useLinkSpawn", () => {
  it("spawns a node + edge, pans to reveal, brings to front, and highlights on a new wikilink", async () => {
    mockGetArticle.mockResolvedValue(article("Dog"));
    const spawned: Node = { ...sourceNode(), id: "n-dog", articleTitle: "Dog", x: 520, y: 100 };
    addNodeMutate.mockResolvedValue(spawned);
    addEdgeMutate.mockResolvedValue({ id: "e1" } as Edge);

    const onPanToReveal = jest.fn();
    const { result } = renderHook(
      () => useLinkSpawn({ sessionId: "s1", nodes: [sourceNode()], onPanToReveal }),
      { wrapper: makeWrapper() },
    );

    await result.current.handleMessage(
      { type: "wikilink", lang: "en", title: "Dog", text: "dogs" },
      "n-src",
    );

    expect(mockGetArticle).toHaveBeenCalledWith("en", "Dog");
    // Node added with placement to the right of the source (x = 100 + 380 + 40).
    expect(addNodeMutate).toHaveBeenCalledWith({
      sessionId: "s1",
      node: {
        articleTitle: "Dog",
        lang: "en",
        x: 520,
        y: 100,
        width: 380,
        height: 520,
        parentNodeId: "n-src",
      },
    });
    // Edge from source -> new node, carrying the clicked link text.
    expect(addEdgeMutate).toHaveBeenCalledWith({
      sessionId: "s1",
      edge: { sourceNodeId: "n-src", targetNodeId: "n-dog", clickedLinkText: "dogs" },
    });
    expect(onPanToReveal).toHaveBeenCalledWith({ x: 520, y: 100, width: 380, height: 520 });
    expect(bringToFront).toHaveBeenCalledWith("n-dog");
    expect(markNew).toHaveBeenCalledWith("n-dog");
  });

  it("de-dupes: existing node for the canonical title -> only an edge, no node, no highlight", async () => {
    mockGetArticle.mockResolvedValue(article("Dog"));
    const existing: Node = { ...sourceNode(), id: "n-dog", articleTitle: "Dog" };
    addEdgeMutate.mockResolvedValue({ id: "e1" } as Edge);

    const onPanToReveal = jest.fn();
    const { result } = renderHook(
      () => useLinkSpawn({ sessionId: "s1", nodes: [sourceNode(), existing], onPanToReveal }),
      { wrapper: makeWrapper() },
    );

    await result.current.handleMessage(
      { type: "wikilink", lang: "en", title: "Dog", text: "dogs" },
      "n-src",
    );

    expect(addNodeMutate).not.toHaveBeenCalled();
    expect(addEdgeMutate).toHaveBeenCalledWith({
      sessionId: "s1",
      edge: { sourceNodeId: "n-src", targetNodeId: "n-dog", clickedLinkText: "dogs" },
    });
    expect(markNew).not.toHaveBeenCalled();
    expect(onPanToReveal).not.toHaveBeenCalled();
  });

  it("opens external links via Linking.openURL and never touches the store", async () => {
    const onPanToReveal = jest.fn();
    const { result } = renderHook(
      () => useLinkSpawn({ sessionId: "s1", nodes: [sourceNode()], onPanToReveal }),
      { wrapper: makeWrapper() },
    );

    await result.current.handleMessage(
      { type: "external", href: "https://example.com/page" },
      "n-src",
    );

    expect(Linking.openURL).toHaveBeenCalledWith("https://example.com/page");
    expect(mockGetArticle).not.toHaveBeenCalled();
    expect(addNodeMutate).not.toHaveBeenCalled();
    expect(addEdgeMutate).not.toHaveBeenCalled();
  });

  it("ignores fragment messages entirely (no-op)", async () => {
    const onPanToReveal = jest.fn();
    const { result } = renderHook(
      () => useLinkSpawn({ sessionId: "s1", nodes: [sourceNode()], onPanToReveal }),
      { wrapper: makeWrapper() },
    );

    await result.current.handleMessage({ type: "fragment", fragment: "History" }, "n-src");

    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(mockGetArticle).not.toHaveBeenCalled();
    expect(addNodeMutate).not.toHaveBeenCalled();
    expect(addEdgeMutate).not.toHaveBeenCalled();
  });

  it("does nothing when the source node id is unknown", async () => {
    const onPanToReveal = jest.fn();
    const { result } = renderHook(
      () => useLinkSpawn({ sessionId: "s1", nodes: [sourceNode()], onPanToReveal }),
      { wrapper: makeWrapper() },
    );

    await result.current.handleMessage(
      { type: "wikilink", lang: "en", title: "Dog", text: "dogs" },
      "n-missing",
    );

    expect(mockGetArticle).not.toHaveBeenCalled();
    expect(addNodeMutate).not.toHaveBeenCalled();
  });
});
