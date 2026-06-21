// src/lib/local-store/index.ts  (WEB — Metro default resolution)
import type { LocalStore } from "@/src/lib/local-store/types";
import { createIndexedDBLocalStore } from "@/src/lib/local-store/indexeddb-store";

let instance: LocalStore | null = null;

/** Web LocalStore singleton (IndexedDB). */
export function getLocalStore(): LocalStore {
  if (!instance) {
    instance = createIndexedDBLocalStore();
  }
  return instance;
}

/** Test-only: drop the cached singleton so each test gets a fresh store. */
export function __resetLocalStoreForTests(): void {
  instance = null;
}
