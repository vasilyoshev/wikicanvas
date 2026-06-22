import type { SyncBundle, MergeResult } from "@/src/features/sync/types";

/**
 * Session-level last-write-wins by updatedAt.
 * local-only -> toUpload; remote-only -> toDownload; both -> newer updatedAt wins wholesale
 * (its nodes/edges replace the other's); equal timestamps -> remote wins (converge);
 * deleted_at participates in LWW like any other field (it lives on session, so a newer
 * tombstone simply wins as the newer bundle).
 * Pure: never mutates its inputs; bundles are passed through by reference unchanged.
 */
export function mergeSessions(local: SyncBundle[], remote: SyncBundle[]): MergeResult {
  const result: MergeResult = { toUpload: [], toDownload: [], unchanged: [] };

  const remoteById = new Map<string, SyncBundle>();
  for (const bundle of remote) {
    remoteById.set(bundle.session.id, bundle);
  }
  const seenRemote = new Set<string>();

  for (const localBundle of local) {
    const id = localBundle.session.id;
    const remoteBundle = remoteById.get(id);

    if (!remoteBundle) {
      result.toUpload.push(localBundle);
      continue;
    }

    seenRemote.add(id);
    const localMs = Date.parse(localBundle.session.updatedAt);
    const remoteMs = Date.parse(remoteBundle.session.updatedAt);

    if (localMs > remoteMs) {
      result.toUpload.push(localBundle);
    } else if (remoteMs > localMs) {
      result.toDownload.push(remoteBundle);
    } else if (bundlesEqual(localBundle, remoteBundle)) {
      // Identical timestamps AND identical content: a true no-op.
      result.unchanged.push(id);
    } else {
      // Equal timestamps but diverged content: converge on remote.
      result.toDownload.push(remoteBundle);
    }
  }

  for (const remoteBundle of remote) {
    if (!seenRemote.has(remoteBundle.session.id)) {
      result.toDownload.push(remoteBundle);
    }
  }

  return result;
}

/** Structural equality of two bundles for the equal-timestamp tie-break. */
function bundlesEqual(a: SyncBundle, b: SyncBundle): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Deterministic, order-independent shape for comparison (nodes/edges sorted by id). */
function canonical(bundle: SyncBundle) {
  return {
    session: bundle.session,
    nodes: [...bundle.nodes].sort((x, y) => x.id.localeCompare(y.id)),
    edges: [...bundle.edges].sort((x, y) => x.id.localeCompare(y.id)),
  };
}
