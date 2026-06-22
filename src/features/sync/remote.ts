import {
  sessionRowToDomain,
  nodeRowToDomain,
  edgeRowToDomain,
  sessionToRow,
  nodeToRow,
  edgeToRow,
  type SessionRow,
  type NodeRow,
  type EdgeRow,
} from "@/src/lib/local-store/row-mapping";
import { requireSupabase } from "@/src/lib/supabase";
import type { SyncBundle } from "@/src/features/sync/types";

import { getLocalStore } from "@/src/lib/local-store";

/** Pull all of a user's session bundles from Supabase (incl. tombstones). */
export async function fetchRemoteBundles(userId: string): Promise<SyncBundle[]> {
  const client = requireSupabase();

  const sessionsRes = await client.from("session").select("*").eq("user_id", userId);
  if (sessionsRes.error) throw sessionsRes.error;
  const sessionRows = (sessionsRes.data ?? []) as SessionRow[];
  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((row) => row.id);

  const nodesRes = await client.from("node").select("*").in("session_id", sessionIds);
  if (nodesRes.error) throw nodesRes.error;
  const edgesRes = await client.from("edge").select("*").in("session_id", sessionIds);
  if (edgesRes.error) throw edgesRes.error;

  const nodeRows = (nodesRes.data ?? []) as NodeRow[];
  const edgeRows = (edgesRes.data ?? []) as EdgeRow[];

  const nodesBySession = new Map<string, NodeRow[]>();
  for (const row of nodeRows) {
    const list = nodesBySession.get(row.session_id) ?? [];
    list.push(row);
    nodesBySession.set(row.session_id, list);
  }
  const edgesBySession = new Map<string, EdgeRow[]>();
  for (const row of edgeRows) {
    const list = edgesBySession.get(row.session_id) ?? [];
    list.push(row);
    edgesBySession.set(row.session_id, list);
  }

  return sessionRows.map((row) => ({
    session: sessionRowToDomain(row),
    nodes: (nodesBySession.get(row.id) ?? []).map(nodeRowToDomain),
    edges: (edgesBySession.get(row.id) ?? []).map(edgeRowToDomain),
  }));
}

/** Adopt anon LocalStore sessions: stamp user_id locally; returns adopted bundles ready to push. */
export async function adoptAnonSessions(userId: string): Promise<SyncBundle[]> {
  const store = getLocalStore();
  const adoptedIds = await store.adoptAnonymousSessions(userId);

  const bundles: SyncBundle[] = [];
  for (const id of adoptedIds) {
    const bundle = await store.getBundle(id);
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}

/** Upsert one bundle: session + replace its nodes/edges remotely. */
export async function pushBundle(bundle: SyncBundle): Promise<void> {
  const client = requireSupabase();
  const sessionId = bundle.session.id;

  const sessionRes = await client.from("session").upsert(sessionToRow(bundle.session));
  if (sessionRes.error) throw sessionRes.error;

  // Replace-wholesale: clear existing children, then re-insert. Edges deleted before
  // nodes (edge FK -> node); re-inserted nodes-first so edge FK targets exist.
  const edgeDel = await client.from("edge").delete().eq("session_id", sessionId);
  if (edgeDel.error) throw edgeDel.error;
  const nodeDel = await client.from("node").delete().eq("session_id", sessionId);
  if (nodeDel.error) throw nodeDel.error;

  if (bundle.nodes.length > 0) {
    const nodeRes = await client.from("node").upsert(bundle.nodes.map(nodeToRow));
    if (nodeRes.error) throw nodeRes.error;
  }
  if (bundle.edges.length > 0) {
    const edgeRes = await client.from("edge").upsert(bundle.edges.map(edgeToRow));
    if (edgeRes.error) throw edgeRes.error;
  }
}
