// src/lib/local-store/row-mapping.test.ts
import {
  sessionRowToDomain,
  sessionToRow,
  nodeRowToDomain,
  nodeToRow,
  edgeRowToDomain,
  edgeToRow,
  cacheRowToEntry,
  cacheEntryToRow,
  type SessionRow,
  type NodeRow,
  type EdgeRow,
  type CacheRow,
} from "@/src/lib/local-store/row-mapping";
import type { Session, Node, Edge } from "@/src/features/sessions/types";
import type { CacheEntry } from "@/src/lib/local-store/types";

const sessionDomain: Session = {
  id: "s-1",
  userId: "u-1",
  title: "Octopus",
  viewportX: 12,
  viewportY: -4,
  viewportZoom: 1.5,
  createdAt: "2026-06-20T08:00:00.000Z",
  updatedAt: "2026-06-20T09:00:00.000Z",
  deletedAt: null,
};

const sessionRow: SessionRow = {
  id: "s-1",
  user_id: "u-1",
  title: "Octopus",
  viewport_x: 12,
  viewport_y: -4,
  viewport_zoom: 1.5,
  created_at: "2026-06-20T08:00:00.000Z",
  updated_at: "2026-06-20T09:00:00.000Z",
  deleted_at: null,
};

const nodeDomain: Node = {
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

const nodeRow: NodeRow = {
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

const edgeDomain: Edge = {
  id: "e-1",
  sessionId: "s-1",
  sourceNodeId: "n-1",
  targetNodeId: "n-2",
  clickedLinkText: "Cephalopod",
  createdAt: "2026-06-20T08:30:00.000Z",
};

const edgeRow: EdgeRow = {
  id: "e-1",
  session_id: "s-1",
  source_node_id: "n-1",
  target_node_id: "n-2",
  clicked_link_text: "Cephalopod",
  created_at: "2026-06-20T08:30:00.000Z",
};

const cacheEntry: CacheEntry = {
  key: "en:octopus",
  lang: "en",
  requestedTitle: "Octopus",
  canonicalTitle: "Octopus",
  html: "<p>hi</p>",
  license: "CC BY-SA 4.0",
  fetchedAt: 1_700_000_000_000,
  etag: 'W/"abc"',
};

const cacheRow: CacheRow = {
  lang_title: "en:octopus",
  lang: "en",
  requested_title: "Octopus",
  canonical_title: "Octopus",
  html: "<p>hi</p>",
  license: "CC BY-SA 4.0",
  fetched_at: 1_700_000_000_000,
  etag: 'W/"abc"',
};

describe("row-mapping: sessions", () => {
  it("maps a row to the domain shape", () => {
    expect(sessionRowToDomain(sessionRow)).toEqual(sessionDomain);
  });
  it("maps a domain object back to a row", () => {
    expect(sessionToRow(sessionDomain)).toEqual(sessionRow);
  });
  it("round-trips a soft-deleted anonymous session", () => {
    const deletedAnon: Session = {
      ...sessionDomain,
      userId: null,
      deletedAt: "2026-06-20T10:00:00.000Z",
    };
    expect(sessionRowToDomain(sessionToRow(deletedAnon))).toEqual(deletedAnon);
  });
});

describe("row-mapping: nodes", () => {
  it("maps a row to the domain shape", () => {
    expect(nodeRowToDomain(nodeRow)).toEqual(nodeDomain);
  });
  it("maps a domain object back to a row (no user_id)", () => {
    const row = nodeToRow(nodeDomain);
    expect(row).toEqual(nodeRow);
    expect("user_id" in row).toBe(false);
  });
  it("round-trips a child node with a parent", () => {
    const child: Node = { ...nodeDomain, id: "n-2", parentNodeId: "n-1" };
    expect(nodeRowToDomain(nodeToRow(child))).toEqual(child);
  });
});

describe("row-mapping: edges", () => {
  it("maps a row to the domain shape", () => {
    expect(edgeRowToDomain(edgeRow)).toEqual(edgeDomain);
  });
  it("maps a domain object back to a row (no user_id)", () => {
    const row = edgeToRow(edgeDomain);
    expect(row).toEqual(edgeRow);
    expect("user_id" in row).toBe(false);
  });
  it("preserves a null clicked_link_text", () => {
    const e: Edge = { ...edgeDomain, clickedLinkText: null };
    expect(edgeToRow(e).clicked_link_text).toBeNull();
    expect(edgeRowToDomain(edgeToRow(e))).toEqual(e);
  });
});

describe("row-mapping: article_cache", () => {
  it("maps a cache row to a CacheEntry (lang_title -> key)", () => {
    expect(cacheRowToEntry(cacheRow)).toEqual(cacheEntry);
  });
  it("maps a CacheEntry back to a row (key -> lang_title)", () => {
    expect(cacheEntryToRow(cacheEntry)).toEqual(cacheRow);
  });
  it("preserves a null etag", () => {
    const e: CacheEntry = { ...cacheEntry, etag: null };
    expect(cacheEntryToRow(e).etag).toBeNull();
    expect(cacheRowToEntry(cacheEntryToRow(e))).toEqual(e);
  });
});
