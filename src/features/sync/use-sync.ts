import { useEffect, useRef } from "react";

import { signInWithGoogle } from "@/src/features/auth/api";
import {
  flushPendingPushes,
  scheduleBackgroundPush,
  syncOnSignIn,
} from "@/src/features/sync/orchestrator";
import { sessionKeys } from "@/src/features/sessions/queries";
import { queryClient } from "@/src/lib/query-client";
import { syncBus } from "@/src/lib/sync-bus";
import { useSession } from "@/src/providers/session-provider";

/**
 * Begin sync for a signed-in user: subscribe the sync-bus (every change notification
 * schedules a debounced push) and run the full sign-in merge once. Returns a cleanup
 * that unsubscribes and flushes any pending pushes. Sync failures are logged, not thrown.
 */
export function startSyncForUser(userId: string): () => void {
  const unsubscribe = syncBus.subscribe((sessionId) => {
    scheduleBackgroundPush(userId, sessionId);
  });

  void syncOnSignIn(userId)
    .then(() => {
      // Invalidate the sessions list so the UI picks up newly downloaded sessions.
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    })
    .catch((error) => {
      console.warn("[sync] syncOnSignIn failed", error);
    });

  return () => {
    unsubscribe();
    void flushPendingPushes();
  };
}

/**
 * Kick off Google sign-in from the "Sign in to sync" button or the (auth) flow.
 * Sync itself starts reactively in useSync when `user` becomes non-null (covering
 * both the web redirect-callback path and native in-app completion).
 *
 * E2E seam: if `__WIKICANVAS_FAKE_USER__` is set on globalThis (injected by the e2e
 * test via addInitScript), skip the real OAuth redirect and start sync directly so
 * headless-chromium tests can exercise the full local-first → sync handoff without a
 * Google round-trip.  The production path is unchanged when the flag is absent.
 */
export async function runSyncSignIn(): Promise<void> {
  const fakeUser = (globalThis as { __WIKICANVAS_FAKE_USER__?: string }).__WIKICANVAS_FAKE_USER__;
  if (fakeUser) {
    // e2e/test seam: skip the real OAuth redirect and start sync directly.
    startSyncForUser(fakeUser);
    return;
  }
  await signInWithGoogle();
}

/** Mount once high in the tree: starts/stops sync as auth state flips. */
export function useSync(): void {
  const { user } = useSession();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    cleanupRef.current = startSyncForUser(user.id);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [user]);
}
