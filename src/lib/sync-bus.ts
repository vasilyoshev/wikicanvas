// src/lib/sync-bus.ts

type SyncListener = (sessionId: string) => void;

/**
 * In-process notification channel decoupling local writes (queries.ts mutations, Phase 2)
 * from background sync (Phase 7). With no subscribers, notify() is a no-op so the app works
 * fully offline/signed-out. A throwing subscriber never breaks the writer or other subscribers.
 */
function createSyncBus() {
  const listeners = new Set<SyncListener>();
  return {
    notify(sessionId: string): void {
      for (const fn of listeners) {
        try {
          fn(sessionId);
        } catch {
          // Subscriber errors must not break the local write that triggered the notify.
        }
      }
    },
    subscribe(fn: SyncListener): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export const syncBus = createSyncBus();
