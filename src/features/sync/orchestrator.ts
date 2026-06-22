import { getLocalStore } from "@/src/lib/local-store";
import { mergeSessions } from "@/src/features/sync/merge";
import { applyMergeResult } from "@/src/features/sync/apply";
import { adoptAnonSessions, fetchRemoteBundles } from "@/src/features/sync/remote";
import type { MergeResult, SyncBundle } from "@/src/features/sync/types";

/** Read every local bundle (incl. tombstones) for a user, skipping any that vanished mid-read. */
async function readLocalBundles(userId: string): Promise<SyncBundle[]> {
  const store = getLocalStore();
  const sessions = await store.listSessions(userId, true);
  const bundles: SyncBundle[] = [];
  for (const session of sessions) {
    const bundle = await store.getBundle(session.id);
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}

/** Full sign-in flow: adopt -> read local -> fetch remote -> mergeSessions -> apply. */
export async function syncOnSignIn(userId: string): Promise<MergeResult> {
  await adoptAnonSessions(userId);

  const local = await readLocalBundles(userId);
  const remote = await fetchRemoteBundles(userId);

  const result = mergeSessions(local, remote);
  await applyMergeResult(result);
  return result;
}
