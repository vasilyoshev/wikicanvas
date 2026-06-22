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
 */
export async function runSyncSignIn(): Promise<void> {
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
