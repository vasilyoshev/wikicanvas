import type { Session, Node, Edge } from "@/src/features/sessions/types";

/** A session plus its full node/edge payload — the atomic sync unit. */
export interface SyncBundle {
  session: Session;
  nodes: Node[];
  edges: Edge[];
}

/** Outcome of mergeSessions: what to push to remote, what to write to local. */
export interface MergeResult {
  toUpload: SyncBundle[]; // local bundles to upsert into Supabase
  toDownload: SyncBundle[]; // remote bundles to write into LocalStore
  unchanged: string[]; // session ids identical on both sides (no-op)
}
