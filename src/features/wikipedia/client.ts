import { appEnv } from "@/src/lib/env";
import {
  ARTICLE_CACHE_TTL_MS,
  cacheKey,
  createInFlightMap,
  dedupe,
  isFresh,
} from "@/src/features/wikipedia/cache";
import { getLocalStore } from "@/src/lib/local-store";
import type { ArticleResult, WithHtmlResponse } from "@/src/features/wikipedia/types";
import type { CacheEntry } from "@/src/lib/local-store/types";

/** Builds the wiki-proxy URL (exported for tests). */
export function buildProxyUrl(params: {
  lang: string;
  title?: string;
  mode?: "search";
  q?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  search.set("lang", params.lang);
  if (params.mode === "search") {
    search.set("mode", "search");
    if (params.q !== undefined) search.set("q", params.q);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
  } else if (params.title !== undefined) {
    search.set("title", params.title);
  }
  return `${appEnv.supabaseUrl}/functions/v1/wiki-proxy?${search.toString()}`;
}

let inFlight = createInFlightMap();

/** Test-only: reset the module-singleton in-flight map between cases. */
export function __resetInFlightForTests(): void {
  inFlight = createInFlightMap();
}

function licenseToString(license: WithHtmlResponse["license"]): string {
  if (license && typeof license.title === "string" && license.title.length > 0) {
    return license.title;
  }
  return "CC BY-SA 4.0";
}

function entryToResult(entry: CacheEntry, requestedTitle: string): ArticleResult {
  return {
    lang: entry.lang,
    requestedTitle,
    canonicalTitle: entry.canonicalTitle,
    html: entry.html,
    license: entry.license,
    sourceUrl: `https://${entry.lang}.wikipedia.org/wiki/${encodeURIComponent(entry.canonicalTitle)}`,
    fetchedAt: entry.fetchedAt,
    etag: entry.etag,
    fromCache: true,
  };
}

/** Cache-first (24h TTL + ETag revalidate) + in-flight dedupe, then wiki-proxy. */
export function getArticle(lang: string, title: string): Promise<ArticleResult> {
  const key = cacheKey(lang, title);
  return dedupe(inFlight, key, () => fetchArticle(lang, title, key));
}

async function fetchArticle(lang: string, title: string, key: string): Promise<ArticleResult> {
  const store = getLocalStore();
  const now = Date.now();
  const cached = await store.getCacheEntry(key);

  if (cached && isFresh(cached, now, ARTICLE_CACHE_TTL_MS)) {
    return entryToResult(cached, title);
  }

  const url = buildProxyUrl({ lang, title });
  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }
  const response = await fetch(url, { headers });

  if (response.status === 304 && cached) {
    const refreshed: CacheEntry = { ...cached, fetchedAt: now };
    await store.putCacheEntry(refreshed);
    return entryToResult(refreshed, title);
  }
  if (!response.ok) {
    throw new Error(`wiki-proxy article fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as WithHtmlResponse;
  const etag = response.headers.get("ETag");
  const entry: CacheEntry = {
    key,
    lang,
    requestedTitle: title,
    canonicalTitle: body.title,
    html: body.html,
    license: licenseToString(body.license),
    fetchedAt: now,
    etag,
  };
  await store.putCacheEntry(entry);
  return {
    lang,
    requestedTitle: title,
    canonicalTitle: body.title,
    html: body.html,
    license: entry.license,
    sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(body.title)}`,
    fetchedAt: now,
    etag,
    fromCache: false,
  };
}
