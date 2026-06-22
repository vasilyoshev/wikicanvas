import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";

// Per-node reading position is device-local UI state — persisted here (NOT synced),
// keyed globally by node id (ids are unique, so a single blob can't collide).
const STORAGE_KEY = "wikicanvas:scroll";
const WRITE_DEBOUNCE_MS = 500;

function sanitize(parsed: unknown): Record<string, number> {
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

// Web: localStorage is synchronous, so seed the store at MODULE LOAD — before React
// renders and before any node mounts to read its initial offset. Hydrating later (in an
// effect) races node mount and is why scroll was lost on a page refresh.
if (Platform.OS === "web") {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const seed = raw ? sanitize(JSON.parse(raw)) : {};
    if (Object.keys(seed).length > 0) {
      useCanvasStore.getState().hydrateScroll(seed);
    }
  } catch {
    // corrupt/absent storage — start empty
  }
}

/** Async read for the native path (AsyncStorage). */
export async function loadPersistedScroll(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persist(map: Record<string, number>): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const value = JSON.stringify(map);
    // Use the same backend the seed/read uses on each platform so the key always matches:
    // synchronous localStorage on web, AsyncStorage on native.
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, value);
      } catch {
        // storage full/unavailable — best effort
      }
    } else {
      void AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
    }
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Hydrate saved scroll offsets into the canvas store (native; web is already seeded at
 * module load), then persist (debounced) whenever they change.
 */
export function useScrollPersistence(): void {
  useEffect(() => {
    let active = true;
    if (Platform.OS !== "web") {
      void loadPersistedScroll().then((map) => {
        if (active && Object.keys(map).length > 0) {
          useCanvasStore.getState().hydrateScroll(map);
        }
      });
    }

    // Persist only when the scroll map identity changes (setScroll/clearScroll create a
    // new object), so unrelated store updates (pans, selection) don't trigger writes.
    let last = useCanvasStore.getState().scrollByNodeId;
    const unsubscribe = useCanvasStore.subscribe((state) => {
      if (state.scrollByNodeId !== last) {
        last = state.scrollByNodeId;
        persist(last);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
