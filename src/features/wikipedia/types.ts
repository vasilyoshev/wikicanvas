/** Normalized result of wiki-proxy /with_html, returned by getArticle. */
export interface ArticleResult {
  lang: string;
  requestedTitle: string; // title as asked for
  canonicalTitle: string; // authoritative title from the API response (de-dupe key)
  html: string; // Parsoid body HTML (NOT yet wrapped in srcdoc)
  license: string; // human-readable license string from the API (e.g. "CC BY-SA 4.0")
  sourceUrl: string; // https://{lang}.wikipedia.org/wiki/{canonicalTitle}
  fetchedAt: number; // epoch ms when fetched/revalidated
  etag: string | null;
  fromCache: boolean;
}

/** One search-as-you-type suggestion (wiki-proxy search mode). */
export interface SearchResult {
  lang: string;
  title: string; // canonical title
  description: string | null; // short description if present
  thumbnailUrl: string | null;
}

/** Raw upstream shape from /page/{title}/with_html (subset we consume). */
export interface WithHtmlResponse {
  title: string; // canonical title
  key: string;
  html: string;
  license?: { url?: string; title?: string } | null;
}

/** Raw upstream shape from /search/title. */
export interface SearchTitleResponse {
  pages: {
    id: number;
    key: string;
    title: string;
    description?: string | null;
    thumbnail?: { url?: string | null } | null;
  }[];
}
