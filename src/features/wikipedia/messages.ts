/** Posted when an in-article internal article link is clicked. */
export interface WikiLinkMessage {
  type: "wikilink";
  lang: string;
  title: string; // pre-canonical title parsed from the href
  text: string; // visible link text (-> edge.clickedLinkText)
}

/** Posted for any non-article link (external site, File:, Special:, edit, citation host, etc.). */
export interface ExternalMessage {
  type: "external";
  href: string; // absolute URL the parent opens
}

/** Posted for a bare in-page #fragment; handled inside the frame, never spawns. */
export interface FragmentMessage {
  type: "fragment";
  fragment: string; // the #id (without '#')
}

export type InterceptorMessage = WikiLinkMessage | ExternalMessage | FragmentMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Allowlist for external hrefs that may be handed to `Linking.openURL`. Only http(s)
 * and mailto are permitted; `javascript:`, `data:`, `file:`, and custom app schemes
 * (deep-link injection) are rejected at this trust boundary.
 */
export function isSafeExternalHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

export function isInterceptorMessage(value: unknown): value is InterceptorMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "wikilink":
      return (
        typeof value.lang === "string" &&
        typeof value.title === "string" &&
        typeof value.text === "string"
      );
    case "external":
      return typeof value.href === "string" && isSafeExternalHref(value.href);
    case "fragment":
      return typeof value.fragment === "string";
    default:
      return false;
  }
}

/**
 * Parse a scroll-position report from the frame. Kept separate from the spawn-message
 * union above: scroll is a private host<->frame protocol for persisting reading position,
 * not a link/navigation event that should ever reach the link-spawn handler. Returns the
 * scrollY (px) or null if the payload isn't a valid scroll message.
 */
export function parseScrollMessage(data: unknown): number | null {
  let value: unknown = data;
  if (typeof data === "string") {
    try {
      value = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (
    isRecord(value) &&
    value.type === "scroll" &&
    typeof value.scrollY === "number" &&
    Number.isFinite(value.scrollY)
  ) {
    return value.scrollY;
  }
  return null;
}

/** Parse+validate an incoming postMessage payload (string or object). Returns null if invalid. */
export function parseInterceptorMessage(data: unknown): InterceptorMessage | null {
  let value: unknown = data;
  if (typeof data === "string") {
    try {
      value = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!isInterceptorMessage(value)) {
    return null;
  }
  // Re-build to the known shape (strip extras).
  switch (value.type) {
    case "wikilink":
      return { type: "wikilink", lang: value.lang, title: value.title, text: value.text };
    case "external":
      return { type: "external", href: value.href };
    case "fragment":
      return { type: "fragment", fragment: value.fragment };
  }
}
