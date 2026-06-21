// src/features/canvas/spawn.test.ts
import { decideSpawn, type SpawnDecision } from "@/src/features/canvas/spawn";
import type { Node } from "@/src/features/sessions/types";

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: "n-src",
    sessionId: "s1",
    articleTitle: "Source Article",
    lang: "en",
    x: 0,
    y: 0,
    width: 380,
    height: 520,
    parentNodeId: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

const sourceNode = makeNode({ id: "n-src", articleTitle: "Cat" });

describe("decideSpawn", () => {
  it("spawns when no existing node matches the canonical title", () => {
    const decision = decideSpawn({ canonicalTitle: "Dog", lang: "en" }, sourceNode, [sourceNode]);
    expect(decision).toEqual<SpawnDecision>({ action: "spawn", title: "Dog", lang: "en" });
  });

  it("returns edge-only when a node for the canonical title already exists", () => {
    const existing = makeNode({ id: "n-dog", articleTitle: "Dog" });
    const decision = decideSpawn({ canonicalTitle: "Dog", lang: "en" }, sourceNode, [
      sourceNode,
      existing,
    ]);
    expect(decision).toEqual<SpawnDecision>({ action: "edge-only", existingNodeId: "n-dog" });
  });

  it("de-dupes by canonical title, NOT by the requested/source title", () => {
    // Existing node titled with the canonical authoritative form.
    const existing = makeNode({ id: "n-canon", articleTitle: "United States" });
    const decision = decideSpawn({ canonicalTitle: "United States", lang: "en" }, sourceNode, [
      sourceNode,
      existing,
    ]);
    expect(decision).toEqual<SpawnDecision>({ action: "edge-only", existingNodeId: "n-canon" });
  });

  it("matches titles exactly (case-sensitive canonical comparison)", () => {
    const existing = makeNode({ id: "n-dog", articleTitle: "dog" });
    const decision = decideSpawn({ canonicalTitle: "Dog", lang: "en" }, sourceNode, [
      sourceNode,
      existing,
    ]);
    // "dog" !== "Dog" -> still spawns a fresh node.
    expect(decision).toEqual<SpawnDecision>({ action: "spawn", title: "Dog", lang: "en" });
  });

  it("does not match an existing node from a different language with the same title", () => {
    const existing = makeNode({ id: "n-de", articleTitle: "Dog", lang: "de" });
    const decision = decideSpawn({ canonicalTitle: "Dog", lang: "en" }, sourceNode, [
      sourceNode,
      existing,
    ]);
    // Same title but different lang -> spawn (v1 stays same-language but lang still discriminates).
    expect(decision).toEqual<SpawnDecision>({ action: "spawn", title: "Dog", lang: "en" });
  });

  it("returns edge-only even when the existing match is the source node itself (self-link)", () => {
    const decision = decideSpawn(
      { canonicalTitle: "Cat", lang: "en" }, // same as sourceNode.articleTitle
      sourceNode,
      [sourceNode],
    );
    expect(decision).toEqual<SpawnDecision>({ action: "edge-only", existingNodeId: "n-src" });
  });

  it("prefers the first matching existing node when duplicates somehow exist", () => {
    const a = makeNode({ id: "n-a", articleTitle: "Dog" });
    const b = makeNode({ id: "n-b", articleTitle: "Dog" });
    const decision = decideSpawn({ canonicalTitle: "Dog", lang: "en" }, sourceNode, [
      sourceNode,
      a,
      b,
    ]);
    expect(decision).toEqual<SpawnDecision>({ action: "edge-only", existingNodeId: "n-a" });
  });
});
