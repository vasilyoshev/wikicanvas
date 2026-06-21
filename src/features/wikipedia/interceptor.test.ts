import { buildInterceptorScript } from "./interceptor";

describe("buildInterceptorScript", () => {
  const script = buildInterceptorScript("en");

  it("embeds the page lang", () => {
    expect(script).toContain('"en"');
  });
  it("captures clicks and preventsDefault", () => {
    expect(script).toContain("addEventListener");
    expect(script).toContain("click");
    expect(script).toContain("preventDefault");
  });
  it("posts to both web parent and native ReactNativeWebView", () => {
    expect(script).toContain("ReactNativeWebView");
    expect(script).toContain("parent.postMessage");
  });
  it("references the wikilink/external/fragment message types", () => {
    expect(script).toContain("wikilink");
    expect(script).toContain("external");
    expect(script).toContain("fragment");
  });

  // Execute the embedded pure classifier to prove it mirrors links.ts.
  // The script defines a global function __wcClassify(href, lang) for testability.
  function runClassify(href: string): unknown {
    const fn = new Function(`${script}; return __wcClassify;`)() as (
      href: string,
      lang: string,
    ) => unknown;
    return fn(href, "en");
  }

  it("classifies a /wiki/Title as a wikilink", () => {
    expect(runClassify("/wiki/Albert_Einstein")).toEqual({
      type: "wikilink",
      lang: "en",
      title: "Albert Einstein",
    });
  });
  it("classifies a non-main namespace as external (opens out)", () => {
    expect(runClassify("/wiki/File:X.jpg")).toEqual({
      type: "external",
      href: "/wiki/File:X.jpg",
    });
  });
  it("classifies a bare #fragment as fragment", () => {
    expect(runClassify("#History")).toEqual({ type: "fragment", fragment: "History" });
  });
  it("classifies an external site as external", () => {
    expect(runClassify("https://example.com/p")).toEqual({
      type: "external",
      href: "https://example.com/p",
    });
  });
  it("classifies another-language wikipedia as external (opened out, never spawns)", () => {
    expect(runClassify("https://de.wikipedia.org/wiki/Physik")).toEqual({
      type: "external",
      href: "https://de.wikipedia.org/wiki/Physik",
    });
  });
});
