import { buildSrcDoc, READABLE_STYLESHEET } from "./sandbox-html";
import { buildInterceptorScript } from "./interceptor";

describe("READABLE_STYLESHEET", () => {
  it("constrains width and expands collapsibles", () => {
    expect(READABLE_STYLESHEET).toContain("max-width");
    // Wikipedia collapsibles forced visible/expanded for a read view.
    expect(READABLE_STYLESHEET).toContain(".mw-collapsible");
  });
});

describe("buildSrcDoc", () => {
  const out = buildSrcDoc("<p>Body content</p>", "en");

  it("is a full HTML document", () => {
    expect(out).toContain("<!DOCTYPE html>");
    expect(out).toContain("<html");
    expect(out).toContain("</html>");
  });
  it("injects a <base> for the page language", () => {
    expect(out).toContain('<base href="https://en.wikipedia.org/"');
  });
  it("injects the readable stylesheet", () => {
    expect(out).toContain(READABLE_STYLESHEET);
  });
  it("injects the interceptor script for the same lang", () => {
    expect(out).toContain(buildInterceptorScript("en"));
  });
  it("includes the article body", () => {
    expect(out).toContain("<p>Body content</p>");
  });
  it("sets a viewport meta for responsive width", () => {
    expect(out).toContain('name="viewport"');
  });
  it("uses the requested lang in base for a different wiki", () => {
    expect(buildSrcDoc("<p>x</p>", "de")).toContain('<base href="https://de.wikipedia.org/"');
  });

  describe("full-document injection", () => {
    const fullDoc = `<!DOCTYPE html><html><head><title>T</title></head><body><p>content</p></body></html>`;
    const fullOut = buildSrcDoc(fullDoc, "en");

    it("injects base into an existing <head>", () => {
      expect(fullOut).toContain('<base href="https://en.wikipedia.org/"');
    });
    it("injects interceptor before </body>", () => {
      expect(fullOut).toContain(buildInterceptorScript("en"));
    });
    it("retains original body content", () => {
      expect(fullOut).toContain("<p>content</p>");
    });

    // Fix 6: fallback when full-doc anchors are missing
    it("falls back to fragment wrapping when </body> is absent — base and interceptor still injected", () => {
      const missingBody = `<!DOCTYPE html><html><head></head><p>no body close tag</p>`;
      const fallbackOut = buildSrcDoc(missingBody, "en");
      expect(fallbackOut).toContain('<base href="https://en.wikipedia.org/"');
      expect(fallbackOut).toContain(buildInterceptorScript("en"));
    });
    it("falls back to fragment wrapping when <head> is absent — base and interceptor still injected", () => {
      const missingHead = `<!DOCTYPE html><html><body><p>no head</p></body></html>`;
      const fallbackOut = buildSrcDoc(missingHead, "en");
      expect(fallbackOut).toContain('<base href="https://en.wikipedia.org/"');
      expect(fallbackOut).toContain(buildInterceptorScript("en"));
    });
  });
});
