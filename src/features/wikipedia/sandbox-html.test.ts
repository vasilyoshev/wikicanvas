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
});
