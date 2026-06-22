// src/lib/active-user.ts
/**
 * Tiny module-level signal for the currently active user id.
 *
 * Production path: always driven by SessionProvider via Supabase auth.
 * E2E / test seam: runSyncSignIn calls setActiveUserId when __WIKICANVAS_FAKE_USER__
 * is present so that SessionProvider picks it up without a real OAuth round-trip.
 */

type Listener = (userId: string | null) => void;
const listeners = new Set<Listener>();
let currentUserId: string | null = null;

export function setActiveUserId(userId: string | null): void {
  currentUserId = userId;
  for (const fn of listeners) fn(userId);
}

export function getActiveUserId(): string | null {
  return currentUserId;
}

export function subscribeActiveUserId(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
