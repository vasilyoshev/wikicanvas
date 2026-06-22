import { buildInterceptorScript } from "@/src/features/wikipedia/interceptor";

// Reproduce Wikipedia's (Vector 2022) content look in both light and "night" themes,
// driven by a `theme-dark` / `theme-light` class set on <html> before the body paints.
// The article HTML we inject is the bare parser output (with inline TemplateStyles for
// infoboxes), so the palette + component rules below give it Wikipedia's appearance
// without loading the live skin CSS — which keeps the sandbox self-contained and lets
// the reader follow the app's light/dark theme.
export const READABLE_STYLESHEET = `
  :root {
    --wc-bg: #ffffff;
    --wc-text: #202122;
    --wc-text-muted: #54595d;
    --wc-link: #3366cc;
    --wc-link-visited: #795cb2;
    --wc-link-red: #d33;
    --wc-border: #a2a9b1;
    --wc-border-light: #c8ccd1;
    --wc-surface: #f8f9fa;
    --wc-surface-header: #eaecf0;
    --wc-img-bg: transparent;
    color-scheme: light;
  }
  html.theme-dark {
    --wc-bg: #101418;
    --wc-text: #eaecf0;
    --wc-text-muted: #a2a9b1;
    --wc-link: #6699ff;
    --wc-link-visited: #a98fe0;
    --wc-link-red: #ff8a8a;
    --wc-border: #54595d;
    --wc-border-light: #43464a;
    --wc-surface: #27292d;
    --wc-surface-header: #2e3136;
    /* Light backing so transparent line-art diagrams stay legible on a dark page. */
    --wc-img-bg: #ffffff;
    color-scheme: dark;
  }

  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    color: var(--wc-text);
    background-color: var(--wc-bg);
    padding: 16px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .mw-parser-output, body > * { max-width: 100%; }
  main, article, .mw-body-content { max-width: 760px; margin: 0 auto; }
  img, video { max-width: 100%; height: auto; }

  a { color: var(--wc-link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:visited { color: var(--wc-link-visited); }
  a.new, a.new:visited { color: var(--wc-link-red); }

  h1, h2, h3, h4, h5, h6 { color: var(--wc-text); font-weight: 600; line-height: 1.3; }
  h1, h2 { border-bottom: 1px solid var(--wc-border-light); padding-bottom: 0.25em; }
  p { margin: 0.5em 0 1em; }

  /* Hatnotes / disambiguation lines. */
  .hatnote, .dablink, .rellink { color: var(--wc-text-muted); font-style: italic; padding: 0.2em 0; }

  /* Infoboxes (right-floated summary card). */
  .infobox {
    background-color: var(--wc-surface);
    color: var(--wc-text);
    border: 1px solid var(--wc-border);
    font-size: 0.88em;
    float: right;
    clear: right;
    margin: 0 0 1em 1em;
    max-width: 320px;
  }
  .infobox caption, .infobox-title, .infobox-above { font-weight: 600; }
  .infobox th, .infobox td { border-color: var(--wc-border-light); }

  /* Standard content tables. */
  table.wikitable {
    background-color: var(--wc-surface);
    color: var(--wc-text);
    border: 1px solid var(--wc-border);
    border-collapse: collapse;
  }
  table.wikitable > * > tr > th { background-color: var(--wc-surface-header); }
  table.wikitable > * > tr > th,
  table.wikitable > * > tr > td { border: 1px solid var(--wc-border-light); padding: 0.3em 0.6em; }
  table { max-width: 100%; }

  /* Thumbnails / figures. */
  .thumbinner, figure { background-color: var(--wc-surface); border: 1px solid var(--wc-border-light); padding: 3px; }
  .thumbcaption, figcaption { font-size: 0.85em; color: var(--wc-text-muted); padding: 0.3em; }
  html.theme-dark .infobox img,
  html.theme-dark .thumb img,
  html.theme-dark figure img { background-color: var(--wc-img-bg); }

  /* References / citations. */
  .reference { font-size: 0.8em; }
  .references, ol.references { font-size: 0.9em; }
  sup.reference a { color: var(--wc-link); }

  code, pre { background-color: var(--wc-surface); color: var(--wc-text); }
  pre { padding: 0.6em; overflow-x: auto; border: 1px solid var(--wc-border-light); }
  blockquote { border-left: 3px solid var(--wc-border); margin: 1em 0; padding-left: 1em; color: var(--wc-text); }

  /* Collapsibles are inert in the sandbox, so render their content expanded. */
  .mw-collapsible, .mw-collapsible-content, .collapsible {
    display: block !important;
    visibility: visible !important;
    height: auto !important;
    max-height: none !important;
  }
  .mw-collapsible-toggle, .navbar, .editsection, .mw-editsection, .mw-jump-link,
  #siteSub, .noprint, .mw-empty-elt { display: none !important; }
`;

export interface BuildSrcDocOptions {
  /** Theme the article renders in; mirrors the app's resolved color scheme. */
  theme?: "light" | "dark";
  /** Scroll offset (px) to restore on load — see the interceptor's restore handler. */
  initialScrollY?: number;
}

/**
 * Wrap article HTML into a self-contained document for srcdoc/WebView with a
 * <base>, the readable stylesheet, the theme class, and the interceptor script.
 *
 * Input may be either:
 *   - A bare HTML fragment (e.g. "<p>Body</p>") — wrapped in a new full document.
 *   - A full <!DOCTYPE html> document (as returned by the Wikipedia REST API
 *     with_html endpoint) — injected into by inserting the <base>, viewport meta,
 *     stylesheet <style>, and interceptor <script> at the start of <head> and
 *     before </body>, respectively.
 *
 * This ensures base href, styles, theme, and interceptor take effect regardless of
 * whether the Wikipedia API returns a fragment or a complete document.
 */
export function buildSrcDoc(html: string, lang: string, opts: BuildSrcDocOptions = {}): string {
  const { theme = "light", initialScrollY = 0 } = opts;
  const baseTag = `<base href="https://${lang}.wikipedia.org/" />`;
  const viewportMeta = `<meta name="viewport" content="width=device-width, initial-scale=1" />`;
  const styleTag = `<style>${READABLE_STYLESHEET}</style>`;
  const scriptTag = `<script>${buildInterceptorScript(lang, initialScrollY)}</script>`;
  // Set the theme class before the body paints so there's no light-to-dark flash.
  const themeScript = `<script>document.documentElement.classList.add(${JSON.stringify(
    theme === "dark" ? "theme-dark" : "theme-light",
  )});</script>`;
  const headInject = `<meta charset="utf-8" />\n${viewportMeta}\n${baseTag}\n${themeScript}\n${styleTag}`;

  const isFullDocument = /<!DOCTYPE\s+html/i.test(html);

  if (isFullDocument) {
    // Inject base + viewport + theme + style at the start of <head>.
    // Inject interceptor script before </body>.
    // If either anchor is missing, fall through to the fragment-wrapping path so
    // injection is guaranteed (silently dropping injects would break link interception).
    const headRe = /(<head[^>]*>)/i;
    const bodyCloseRe = /<\/body>/i;

    if (!headRe.test(html) || !bodyCloseRe.test(html)) {
      // Fall through to fragment path below.
    } else {
      let result = html;

      // Use FUNCTION replacers so `$`-sequences inside the injected interceptor script
      // / styles (e.g. `$&`, `$1`) are inserted literally, not interpreted as
      // replacement patterns (which would silently corrupt the injected code).
      result = result.replace(headRe, (match) => `${match}\n${headInject}`);

      result = result.replace(bodyCloseRe, () => `${scriptTag}\n</body>`);

      return result;
    }
  }

  // Fragment path: build a clean document around the content.
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${headInject}
</head>
<body>
${html}
${scriptTag}
</body>
</html>`;
}
