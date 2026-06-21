import {
  USER_AGENT,
  LANG_PATTERN,
  MAX_TITLE_LENGTH,
  validateLang,
  validateTitle,
  buildArticleUrl,
  buildSearchUrl,
  clampLimit,
  isOriginAllowed,
} from "./wiki-proxy";

describe("USER_AGENT", () => {
  it("is the exact compliant Wikimedia UA string", () => {
    expect(USER_AGENT).toBe(
      "WikiCanvas/1.0 (https://github.com/vasilyoshev/wikicanvas; vasil.yoshev@gmail.com)",
    );
  });
});

describe("LANG_PATTERN / validateLang", () => {
  it("matches 2-12 lowercase letters and hyphens", () => {
    expect(LANG_PATTERN.source).toBe("^[a-z-]{2,12}$");
  });
  it.each(["en", "de", "simple", "zh-yue", "be-tarask"])("accepts %s", (lang) => {
    expect(validateLang(lang)).toBe(true);
  });
  it.each(["", "e", "EN", "en1", "en_US", "a".repeat(13), "en ", null, undefined, 42, {}])(
    "rejects %s",
    (lang) => {
      expect(validateLang(lang)).toBe(false);
    },
  );
});

describe("validateTitle", () => {
  it("exposes a 512 cap", () => {
    expect(MAX_TITLE_LENGTH).toBe(512);
  });
  it("accepts a normal non-empty title", () => {
    expect(validateTitle("Albert Einstein")).toBe(true);
  });
  it("accepts a title of exactly MAX_TITLE_LENGTH", () => {
    expect(validateTitle("a".repeat(512))).toBe(true);
  });
  it("rejects empty, whitespace-only, over-long, and non-strings", () => {
    expect(validateTitle("")).toBe(false);
    expect(validateTitle("   ")).toBe(false);
    expect(validateTitle("a".repeat(513))).toBe(false);
    expect(validateTitle(null)).toBe(false);
    expect(validateTitle(123)).toBe(false);
  });
});

describe("buildArticleUrl", () => {
  it("targets {lang}.wikipedia.org /with_html with an encoded title", () => {
    expect(buildArticleUrl("en", "Albert Einstein")).toBe(
      "https://en.wikipedia.org/w/rest.php/v1/page/Albert%20Einstein/with_html",
    );
  });
  it("encodes slashes and reserved chars in the title segment", () => {
    expect(buildArticleUrl("en", "AC/DC")).toBe(
      "https://en.wikipedia.org/w/rest.php/v1/page/AC%2FDC/with_html",
    );
  });
});

describe("buildSearchUrl", () => {
  it("targets /search/title with encoded q + limit", () => {
    expect(buildSearchUrl("en", "ein stein", 10)).toBe(
      "https://en.wikipedia.org/w/rest.php/v1/search/title?q=ein%20stein&limit=10",
    );
  });
});

describe("clampLimit", () => {
  it("defaults to 10 for missing/invalid", () => {
    expect(clampLimit(undefined)).toBe(10);
    expect(clampLimit("nope")).toBe(10);
  });
  it("clamps into 1..10", () => {
    expect(clampLimit("0")).toBe(1);
    expect(clampLimit("5")).toBe(5);
    expect(clampLimit("50")).toBe(10);
  });
});

describe("isOriginAllowed", () => {
  it("returns true only for an exact allowlist member", () => {
    const allow = ["https://wikicanvas.app", "http://localhost:8081"];
    expect(isOriginAllowed("http://localhost:8081", allow)).toBe(true);
    expect(isOriginAllowed("https://evil.example", allow)).toBe(false);
    expect(isOriginAllowed(null, allow)).toBe(false);
  });
});
