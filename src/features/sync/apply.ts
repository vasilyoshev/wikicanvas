import { getLocalStore } from "@/src/lib/local-store";
import { pushBundle } from "@/src/features/sync/remote";
import type { MergeResult } from "@/src/features/sync/types";

/**
 * Persist a merge outcome on both sides:
 * - toDownload: tombstone -> deleteSessionDeep; live -> replaceBundle (atomic wholesale).
 * - toUpload: pushBundle to remote.
 * - unchanged: no-op.
 */
export async function applyMergeResult(result: MergeResult): Promise<void> {
  const store = getLocalStore();

  for (const bundle of result.toDownload) {
    if (bundle.session.deletedAt) {
      await store.deleteSessionDeep(bundle.session.id);
    } else {
      await store.replaceBundle(bundle);
    }
  }

  for (const bundle of result.toUpload) {
    await pushBundle(bundle);
  }
}
