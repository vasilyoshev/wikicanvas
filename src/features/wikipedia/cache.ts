import { normalizeTitle } from "@/src/features/wikipedia/links";
import type { CacheEntry } from "@/src/lib/local-store/types";
import type { ArticleResult } from "@/src/features/wikipedia/types";

export const ARTICLE_CACHE_TTL_MS = 86_400_000; // 24h

/** `${lang}:${normalized-lowercased title}` — stable de-dupe/cache key. */
export function cacheKey(lang: string, title: string): string {
  return `${lang.toLowerCase()}:${normalizeTitle(title).toLowerCase()}`;
}

export function isFresh(
  entry: CacheEntry,
  now: number,
  ttlMs: number = ARTICLE_CACHE_TTL_MS,
): boolean {
  return now - entry.fetchedAt < ttlMs;
}

export function isStale(
  entry: CacheEntry,
  now: number,
  ttlMs: number = ARTICLE_CACHE_TTL_MS,
): boolean {
  return !isFresh(entry, now, ttlMs);
}

/** Returns the in-flight promise for `key`, else runs+stores `factory`, clearing on settle. */
export function dedupe<T>(
  map: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const promise = factory().finally(() => {
    map.delete(key);
  });
  map.set(key, promise);
  return promise;
}

export function createInFlightMap(): Map<string, Promise<ArticleResult>> {
  return new Map<string, Promise<ArticleResult>>();
}
