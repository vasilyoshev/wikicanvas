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

/** Pull a single session's bundle from Supabase (incl. tombstone), or null if absent. */
export async function fetchRemoteBundle(
  userId: string,
  sessionId: string,
): Promise<SyncBundle | null> {
  const client = requireSupabase();

  const sessionRes = await client
    .from("session")
    .select("*")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionRes.error) throw sessionRes.error;
  if (!sessionRes.data) return null;

  const nodesRes = await client.from("node").select("*").eq("session_id", sessionId);
  if (nodesRes.error) throw nodesRes.error;
  const edgesRes = await client.from("edge").select("*").eq("session_id", sessionId);
  if (edgesRes.error) throw edgesRes.error;

  return {
    session: sessionRowToDomain(sessionRes.data as SessionRow),
    nodes: ((nodesRes.data ?? []) as NodeRow[]).map(nodeRowToDomain),
    edges: ((edgesRes.data ?? []) as EdgeRow[]).map(edgeRowToDomain),
  };
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

  const nodeIds = bundle.nodes.map((n) => n.id);
  const edgeIds = bundle.edges.map((e) => e.id);

  // Upsert the CURRENT children first (nodes before edges, for the edge->node FK),
  // THEN delete only the rows no longer in the bundle. Ordering this way means a
  // mid-sequence failure can only leave EXTRA (stale) rows on the server — never
  // missing ones — so a half-finished push can't truncate a session and have that
  // loss propagate to the user's other devices via the next download. (The previous
  // delete-then-insert order left a wipe-then-crash window.)
  if (bundle.nodes.length > 0) {
    const nodeRes = await client.from("node").upsert(bundle.nodes.map(nodeToRow));
    if (nodeRes.error) throw nodeRes.error;
  }
  if (bundle.edges.length > 0) {
    const edgeRes = await client.from("edge").upsert(bundle.edges.map(edgeToRow));
    if (edgeRes.error) throw edgeRes.error;
  }

  // Remove stale rows (edges before nodes for the FK). With an empty current set,
  // delete all of that kind for the session.
  const staleEdges = client.from("edge").delete().eq("session_id", sessionId);
  const edgeDel = await (edgeIds.length > 0
    ? staleEdges.not("id", "in", `(${edgeIds.join(",")})`)
    : staleEdges);
  if (edgeDel.error) throw edgeDel.error;

  const staleNodes = client.from("node").delete().eq("session_id", sessionId);
  const nodeDel = await (nodeIds.length > 0
    ? staleNodes.not("id", "in", `(${nodeIds.join(",")})`)
    : staleNodes);
  if (nodeDel.error) throw nodeDel.error;
}
