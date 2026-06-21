// Namespace prefixes that never spawn a node (canonical names + common aliases),
// lower-cased for case-insensitive matching. Includes talk variants.
const NON_MAIN_NAMESPACES = new Set<string>([
  "file",
  "image", // File alias
  "special",
  "help",
  "talk",
  "category",
  "category talk",
  "wikipedia",
  "wp", // Wikipedia alias
  "project", // Wikipedia alias
  "portal",
  "template",
  "template talk",
  "user",
  "user talk",
  "media",
  "help talk",
  "portal talk",
  "file talk",
  "image talk",
]);

/** Percent-decode, drop Parsoid './' prefix, '_'->space, strip ?query and #fragment, trim. */
export function normalizeTitle(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("./")) {
    value = value.slice(2);
  }
  // Strip a single leading ":" (the [[:NS:X]] wikitext form) before any other processing.
  if (value.startsWith(":")) {
    value = value.slice(1);
  }
  // Strip query string before percent-decoding (must come before #fragment strip).
  const queryIndex = value.indexOf("?");
  if (queryIndex !== -1) {
    value = value.slice(0, queryIndex);
  }
  const hashIndex = value.indexOf("#");
  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex);
  }
  value = value.replace(/_/g, " ");
  try {
    value = decodeURIComponent(value);
  } catch {
    // Leave malformed percent sequences untouched.
  }
  return value.trim();
}

/** True if the title's prefix is a known non-main (File:/Special:/Talk:/… + aliases). */
export function isNonMainNamespace(title: string): boolean {
  const colonIndex = title.indexOf(":");
  if (colonIndex <= 0) {
    return false;
  }
  const prefix = title.slice(0, colonIndex).trim().toLowerCase();
  return NON_MAIN_NAMESPACES.has(prefix);
}

/** Discriminated union returned by classifyLink. Only 'article' ever spawns a node. */
export type LinkClassification =
  | { kind: "article"; lang: string; title: string }
  | { kind: "external"; href: string }
  | { kind: "ignore" };

const WIKI_PATH = "/wiki/";

/** Parse the {lang} from a wikipedia host like "en.wikipedia.org"; null if not a wikipedia host. */
function wikipediaLangFromHost(host: string): string | null {
  const match = /^([a-z-]{2,12})\.wikipedia\.org$/.exec(host);
  return match ? match[1] : null;
}

/** True if host is any Wikimedia project (wiktionary, wikidata, commons, etc.) */
function isWikimediaHost(host: string): boolean {
  return (
    /(?:^|\.)wikimedia\.org$/.test(host) ||
    /(?:^|\.)wiktionary\.org$/.test(host) ||
    /(?:^|\.)wikidata\.org$/.test(host) ||
    /(?:^|\.)wikisource\.org$/.test(host) ||
    /(?:^|\.)wikibooks\.org$/.test(host) ||
    /(?:^|\.)wikinews\.org$/.test(host) ||
    /(?:^|\.)wikiversity\.org$/.test(host) ||
    /(?:^|\.)wikivoyage\.org$/.test(host) ||
    /(?:^|\.)wikiquote\.org$/.test(host)
  );
}

export function classifyLink(href: string, pageLang: string): LinkClassification {
  const raw = href.trim();
  if (raw === "" || raw.startsWith("#")) {
    return { kind: "ignore" };
  }

  // Relative same-wiki forms: "/wiki/Title" or Parsoid "./Title".
  if (raw.startsWith(WIKI_PATH) || raw.startsWith("./")) {
    const titlePart = raw.startsWith(WIKI_PATH) ? raw.slice(WIKI_PATH.length) : raw;
    return articleOrIgnore(pageLang, titlePart);
  }
  // Protocol-relative URLs "//host/..." must fall through to URL parsing, NOT be
  // treated as single-slash relative paths. Handle them before the blanket "/" guard.
  // (new URL("//en.wikipedia.org/...", base) correctly resolves with https: protocol.)
  if (!raw.startsWith("//") && raw.startsWith("/")) {
    // Relative non-article paths (edit endpoints etc.) never spawn.
    return { kind: "ignore" };
  }

  let url: URL;
  try {
    url = new URL(raw, `https://${pageLang}.wikipedia.org/`);
  } catch {
    return { kind: "external", href: raw };
  }

  // Non-http schemes (mailto:, tel:) -> external.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "external", href: raw };
  }

  const linkLang = wikipediaLangFromHost(url.host);
  if (linkLang === null) {
    // Other Wikimedia projects (wiktionary, commons, wikidata, etc.) -> ignore (interwiki).
    if (isWikimediaHost(url.host)) {
      return { kind: "ignore" };
    }
    // Non-Wikimedia external host -> external.
    return { kind: "external", href: raw };
  }
  // Other-language wikipedia: v1 stays same-language -> ignore (not external, not spawn).
  if (linkLang !== pageLang) {
    return { kind: "ignore" };
  }
  // edit/redlink endpoints on /w/index.php are ignored.
  if (!url.pathname.startsWith(WIKI_PATH)) {
    return { kind: "ignore" };
  }
  return articleOrIgnore(pageLang, url.pathname.slice(WIKI_PATH.length) + url.hash);
}

function articleOrIgnore(lang: string, rawTitle: string): LinkClassification {
  const title = normalizeTitle(rawTitle);
  if (title === "" || isNonMainNamespace(title)) {
    return { kind: "ignore" };
  }
  return { kind: "article", lang, title };
}

/**
 * Accept a pasted Wikipedia article URL OR a plain title and resolve it to
 * { lang, title }. Returns null for namespaced/non-article URLs or empty input.
 */
export function parseArticleInput(
  input: string,
  defaultLang: string,
): { lang: string; title: string } | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  // Looks like a URL -> reuse classifyLink to enforce article-only, same rules.
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    const classified = classifyLink(trimmed, defaultLang);
    if (classified.kind === "article") {
      return { lang: classified.lang, title: classified.title };
    }
    // For a paste of an OTHER-language article URL, classifyLink ignores it
    // (v1 same-language rule), but a deliberate paste should still resolve.
    try {
      const url = new URL(trimmed, `https://${defaultLang}.wikipedia.org/`);
      const match = /^([a-z-]{2,12})\.wikipedia\.org$/.exec(url.host);
      if (match && url.pathname.startsWith("/wiki/")) {
        const title = normalizeTitle(url.pathname.slice("/wiki/".length));
        if (title !== "" && !isNonMainNamespace(title)) {
          return { lang: match[1], title };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  // Plain title.
  const title = normalizeTitle(trimmed);
  if (title === "" || isNonMainNamespace(title)) {
    return null;
  }
  return { lang: defaultLang, title };
}
