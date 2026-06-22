import {
  sessionRowToDomain,
  nodeRowToDomain,
  edgeRowToDomain,
  type SessionRow,
  type NodeRow,
  type EdgeRow,
} from "@/src/lib/local-store/row-mapping";
import { requireSupabase } from "@/src/lib/supabase";
import type { SyncBundle } from "@/src/features/sync/types";

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
