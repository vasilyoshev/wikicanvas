// Runtime-agnostic helpers for the wiki-proxy edge function. No Deno globals so
// jest can unit-test these directly (the Deno entry in index.ts owns I/O).

export const USER_AGENT =
  "WikiCanvas/1.0 (https://github.com/vasilyoshev/wikicanvas; vasil.yoshev@gmail.com)";

export const LANG_PATTERN = /^[a-z-]{2,12}$/;
export const MAX_TITLE_LENGTH = 512;

export function validateLang(lang: unknown): lang is string {
  return typeof lang === "string" && LANG_PATTERN.test(lang);
}

export function validateTitle(title: unknown): title is string {
  return typeof title === "string" && title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH;
}

export function buildArticleUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(title)}/with_html`;
}

export function buildSearchUrl(lang: string, q: string, limit: number): string {
  return `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(
    q,
  )}&limit=${limit}`;
}

export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

export function isOriginAllowed(origin: string | null, allowlist: string[]): boolean {
  return origin !== null && allowlist.includes(origin);
}
