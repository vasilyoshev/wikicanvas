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
      return typeof value.href === "string";
    case "fragment":
      return typeof value.fragment === "string";
    default:
      return false;
  }
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
