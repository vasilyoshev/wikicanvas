// src/lib/local-store/index.native.ts  (NATIVE — Metro .native resolution)
import type { LocalStore } from "@/src/lib/local-store/types";
import { createSqliteLocalStore } from "@/src/lib/local-store/sqlite-store";

let instance: LocalStore | null = null;

/** Native LocalStore singleton (expo-sqlite). */
export function getLocalStore(): LocalStore {
  if (!instance) {
    instance = createSqliteLocalStore();
  }
  return instance;
}

/** Test-only: drop the cached singleton so each test gets a fresh store. */
export function __resetLocalStoreForTests(): void {
  instance = null;
}
