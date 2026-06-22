import { useEffect, useRef } from "react";
import { AppState } from "react-native";

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
 *
 * Also registers early-flush triggers so edits within the debounce window aren't lost
 * when the browser tab is hidden / the native app is backgrounded.
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

  // --- Early-flush listeners (one set per signed-in session) ---
  let removeEarlyFlushListeners: () => void;

  if (typeof document !== "undefined") {
    // Web: flush when the tab becomes hidden (visibilitychange) or is unloaded (pagehide).
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingPushes();
      }
    };
    const handlePageHide = () => {
      void flushPendingPushes();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pagehide", handlePageHide);
    removeEarlyFlushListeners = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pagehide", handlePageHide);
    };
  } else {
    // Native: flush when the app is backgrounded or goes inactive.
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        void flushPendingPushes();
      }
    });
    removeEarlyFlushListeners = () => {
      appStateSubscription.remove();
    };
  }

  return () => {
    removeEarlyFlushListeners();
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
  const userId = user?.id ?? null;
  const cleanupRef = useRef<(() => void) | null>(null);

  // Keyed on the user id (not the user object) so a token refresh that yields a new
  // user object identity with the same id does not tear down + re-run the full merge.
  useEffect(() => {
    if (!userId) return;

    cleanupRef.current = startSyncForUser(userId);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [userId]);
}
