// src/features/sessions/repository.ts
import type { Session, Node, Edge } from "@/src/features/sessions/types";
import { requireSupabase } from "@/src/lib/supabase";
import {
  sessionRowToDomain,
  sessionToRow,
  nodeRowToDomain,
  nodeToRow,
  edgeRowToDomain,
  edgeToRow,
  type SessionRow,
  type NodeRow,
  type EdgeRow,
} from "@/src/lib/local-store/row-mapping";

const SESSION_TABLE = "session";
const NODE_TABLE = "node";
const EDGE_TABLE = "edge";

export async function listRemoteSessions(
  userId: string,
  includeDeleted = false,
): Promise<Session[]> {
  const client = requireSupabase();
  const base = client.from(SESSION_TABLE).select("*").eq("user_id", userId);
  const query = includeDeleted ? base : base.is("deleted_at", null);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as SessionRow[]).map(sessionRowToDomain);
}

export async function getRemoteSession(userId: string, id: string): Promise<Session | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from(SESSION_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? sessionRowToDomain(data as SessionRow) : null;
}

export async function upsertRemoteSession(session: Session): Promise<Session> {
  const client = requireSupabase();
  const { data, error } = await client
    .from(SESSION_TABLE)
    .upsert(sessionToRow(session))
    .select("*")
    .single();
  if (error) throw error;
  return sessionRowToDomain(data as SessionRow);
}

export async function listRemoteNodes(_userId: string, sessionId: string): Promise<Node[]> {
  const client = requireSupabase();
  // Nodes have no user_id; RLS scopes via the parent session. List BY session_id.
  const { data, error } = await client.from(NODE_TABLE).select("*").eq("session_id", sessionId);
  if (error) throw error;
  return (data as NodeRow[]).map(nodeRowToDomain);
}

export async function listRemoteEdges(_userId: string, sessionId: string): Promise<Edge[]> {
  const client = requireSupabase();
  const { data, error } = await client.from(EDGE_TABLE).select("*").eq("session_id", sessionId);
  if (error) throw error;
  return (data as EdgeRow[]).map(edgeRowToDomain);
}

export async function upsertRemoteNodes(nodes: Node[]): Promise<void> {
  if (nodes.length === 0) return;
  const client = requireSupabase();
  const { error } = await client.from(NODE_TABLE).upsert(nodes.map(nodeToRow));
  if (error) throw error;
}

export async function upsertRemoteEdges(edges: Edge[]): Promise<void> {
  if (edges.length === 0) return;
  const client = requireSupabase();
  const { error } = await client.from(EDGE_TABLE).upsert(edges.map(edgeToRow));
  if (error) throw error;
}

export async function softDeleteRemoteSession(
  userId: string,
  id: string,
  deletedAt: string,
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from(SESSION_TABLE)
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}
