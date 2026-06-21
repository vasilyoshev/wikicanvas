import { buildInterceptorScript } from "@/src/features/wikipedia/interceptor";

export const READABLE_STYLESHEET = `
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    padding: 16px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .mw-parser-output, body > * { max-width: 100%; }
  main, article, .mw-body-content { max-width: 720px; margin: 0 auto; }
  img, video, table { max-width: 100%; height: auto; }
  table { display: block; overflow-x: auto; border-collapse: collapse; }
  a { color: #3366cc; }
  /* Collapsibles are inert in the sandbox, so render them expanded. */
  .mw-collapsible, .mw-collapsible-content, .collapsible, .navbox, .infobox {
    display: block !important;
    visibility: visible !important;
    height: auto !important;
    max-height: none !important;
  }
  .mw-collapsible-toggle, .navbar, .editsection, .mw-editsection { display: none !important; }
`;

/**
 * Wrap article HTML into a self-contained document for srcdoc/WebView with a
 * <base>, the readable stylesheet, and the interceptor script.
 *
 * Input may be either:
 *   - A bare HTML fragment (e.g. "<p>Body</p>") — wrapped in a new full document.
 *   - A full <!DOCTYPE html> document (as returned by the Wikipedia REST API
 *     with_html endpoint) — injected into by inserting the <base>, viewport meta,
 *     stylesheet <style>, and interceptor <script> at the start of <head> and
 *     before </body>, respectively.
 *
 * This ensures base href, styles, and interceptor take effect regardless of
 * whether the Wikipedia API returns a fragment or a complete document.
 */
export function buildSrcDoc(html: string, lang: string): string {
  const baseTag = `<base href="https://${lang}.wikipedia.org/" />`;
  const viewportMeta = `<meta name="viewport" content="width=device-width, initial-scale=1" />`;
  const styleTag = `<style>${READABLE_STYLESHEET}</style>`;
  const scriptTag = `<script>${buildInterceptorScript(lang)}</script>`;

  const isFullDocument = /<!DOCTYPE\s+html/i.test(html);

  if (isFullDocument) {
    // Inject base + viewport + style at the start of <head>.
    // Inject interceptor script before </body>.
    let result = html;

    result = result.replace(
      /(<head[^>]*>)/i,
      `$1\n<meta charset="utf-8" />\n${viewportMeta}\n${baseTag}\n${styleTag}`,
    );

    result = result.replace(/<\/body>/i, `${scriptTag}\n</body>`);

    return result;
  }

  // Fragment path: build a clean document around the content.
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
${viewportMeta}
${baseTag}
${styleTag}
</head>
<body>
${html}
${scriptTag}
</body>
</html>`;
}
