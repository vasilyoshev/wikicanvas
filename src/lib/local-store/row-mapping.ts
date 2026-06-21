// src/lib/local-store/row-mapping.ts
import type { Session, Node, Edge } from "@/src/features/sessions/types";
import type { CacheEntry } from "@/src/lib/local-store/types";

export interface SessionRow {
  id: string;
  user_id: string | null;
  title: string;
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NodeRow {
  id: string;
  session_id: string;
  article_title: string;
  lang: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent_node_id: string | null;
  created_at: string;
}

export interface EdgeRow {
  id: string;
  session_id: string;
  source_node_id: string;
  target_node_id: string;
  clicked_link_text: string | null;
  created_at: string;
}

export interface CacheRow {
  lang_title: string;
  lang: string;
  requested_title: string;
  canonical_title: string;
  html: string;
  license: string;
  fetched_at: number;
  etag: string | null;
}

export function sessionRowToDomain(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    viewportX: row.viewport_x,
    viewportY: row.viewport_y,
    viewportZoom: row.viewport_zoom,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function sessionToRow(session: Session): SessionRow {
  return {
    id: session.id,
    user_id: session.userId,
    title: session.title,
    viewport_x: session.viewportX,
    viewport_y: session.viewportY,
    viewport_zoom: session.viewportZoom,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    deleted_at: session.deletedAt,
  };
}

export function nodeRowToDomain(row: NodeRow): Node {
  return {
    id: row.id,
    sessionId: row.session_id,
    articleTitle: row.article_title,
    lang: row.lang,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    parentNodeId: row.parent_node_id,
    createdAt: row.created_at,
  };
}

export function nodeToRow(node: Node): NodeRow {
  return {
    id: node.id,
    session_id: node.sessionId,
    article_title: node.articleTitle,
    lang: node.lang,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    parent_node_id: node.parentNodeId,
    created_at: node.createdAt,
  };
}

export function edgeRowToDomain(row: EdgeRow): Edge {
  return {
    id: row.id,
    sessionId: row.session_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    clickedLinkText: row.clicked_link_text,
    createdAt: row.created_at,
  };
}

export function edgeToRow(edge: Edge): EdgeRow {
  return {
    id: edge.id,
    session_id: edge.sessionId,
    source_node_id: edge.sourceNodeId,
    target_node_id: edge.targetNodeId,
    clicked_link_text: edge.clickedLinkText,
    created_at: edge.createdAt,
  };
}

export function cacheRowToEntry(row: CacheRow): CacheEntry {
  return {
    key: row.lang_title,
    lang: row.lang,
    requestedTitle: row.requested_title,
    canonicalTitle: row.canonical_title,
    html: row.html,
    license: row.license,
    fetchedAt: row.fetched_at,
    etag: row.etag,
  };
}

export function cacheEntryToRow(entry: CacheEntry): CacheRow {
  return {
    lang_title: entry.key,
    lang: entry.lang,
    requested_title: entry.requestedTitle,
    canonical_title: entry.canonicalTitle,
    html: entry.html,
    license: entry.license,
    fetched_at: entry.fetchedAt,
    etag: entry.etag,
  };
}
