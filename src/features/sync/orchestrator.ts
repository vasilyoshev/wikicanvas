import { getLocalStore } from "@/src/lib/local-store";
import { mergeSessions } from "@/src/features/sync/merge";
import { applyMergeResult } from "@/src/features/sync/apply";
import { adoptAnonSessions, fetchRemoteBundles, pushBundle } from "@/src/features/sync/remote";
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

/** On opening a session while signed in: pull that session, merge, apply. */
export async function syncSessionOnOpen(userId: string, sessionId: string): Promise<void> {
  const remoteAll = await fetchRemoteBundles(userId);
  const remote = remoteAll.filter((bundle) => bundle.session.id === sessionId);

  const localBundle = await getLocalStore().getBundle(sessionId);
  const local = localBundle ? [localBundle] : [];

  const result = mergeSessions(local, remote);
  await applyMergeResult(result);
}

export const BACKGROUND_PUSH_DEBOUNCE_MS = 1500;

/** Per-session debounce state: the pending timer plus the userId to push as. */
interface PendingPush {
  timer: ReturnType<typeof setTimeout>;
  userId: string;
}

const pendingPushes = new Map<string, PendingPush>();

/** Load a session's bundle and push it; never throws (logs and returns). */
async function runPush(sessionId: string): Promise<void> {
  try {
    const bundle = await getLocalStore().getBundle(sessionId);
    if (bundle) await pushBundle(bundle);
  } catch (error) {
    // Background push is best-effort: a failure must not surface to the caller.
    console.warn(`[sync] background push failed for ${sessionId}`, error);
  }
}

/** Debounced background push of a changed session (no-op when signed out). */
export function scheduleBackgroundPush(userId: string | null, sessionId: string): void {
  if (!userId) return;

  const existing = pendingPushes.get(sessionId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingPushes.delete(sessionId);
    void runPush(sessionId);
  }, BACKGROUND_PUSH_DEBOUNCE_MS);

  pendingPushes.set(sessionId, { timer, userId });
}

/** Flush any pending debounced pushes immediately (e.g. on sign-out / app background). */
export async function flushPendingPushes(): Promise<void> {
  const entries = Array.from(pendingPushes.entries());
  pendingPushes.clear();
  await Promise.all(
    entries.map(([sessionId, pending]) => {
      clearTimeout(pending.timer);
      return runPush(sessionId);
    }),
  );
}
