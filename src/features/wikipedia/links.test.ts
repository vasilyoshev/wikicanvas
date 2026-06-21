import { normalizeTitle, isNonMainNamespace, classifyLink } from "./links";

describe("normalizeTitle", () => {
  it("replaces underscores with spaces", () => {
    expect(normalizeTitle("Albert_Einstein")).toBe("Albert Einstein");
  });
  it("percent-decodes", () => {
    expect(normalizeTitle("Caf%C3%A9")).toBe("Café");
    expect(normalizeTitle("AC%2FDC")).toBe("AC/DC");
  });
  it("strips a trailing #fragment", () => {
    expect(normalizeTitle("Physics#History")).toBe("Physics");
  });
  it("drops the Parsoid './' prefix", () => {
    expect(normalizeTitle("./Albert_Einstein")).toBe("Albert Einstein");
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeTitle("  Spaced  ")).toBe("Spaced");
  });
  it("handles combined underscore + percent + fragment + ./ ", () => {
    expect(normalizeTitle("./Caf%C3%A9_society#Origins")).toBe("Café society");
  });
  it("returns invalid percent sequences unchanged rather than throwing", () => {
    expect(normalizeTitle("100%_complete")).toBe("100% complete");
  });
});

describe("isNonMainNamespace", () => {
  it.each([
    "File:Example.jpg",
    "Special:Random",
    "Help:Contents",
    "Talk:Physics",
    "Category:Science",
    "Wikipedia:About",
    "Portal:Science",
    "Template:Cite",
    "User:Jdoe",
    "Media:Example.ogg",
  ])("flags %s as non-main", (title) => {
    expect(isNonMainNamespace(title)).toBe(true);
  });
  it.each([
    "Image:Old.jpg", // File alias
    "WP:NPOV", // Wikipedia alias
    "Category talk:Science", // talk variants
    "User talk:Jdoe",
    "Template talk:Cite",
  ])("flags alias/talk namespace %s as non-main", (title) => {
    expect(isNonMainNamespace(title)).toBe(true);
  });
  it("is case-insensitive on the namespace prefix", () => {
    expect(isNonMainNamespace("file:Example.jpg")).toBe(true);
    expect(isNonMainNamespace("SPECIAL:Random")).toBe(true);
  });
  it.each(["Albert Einstein", "Physics", "Apple Inc.", "C++", "Time (magazine)"])(
    "treats main-namespace title %s as main",
    (title) => {
      expect(isNonMainNamespace(title)).toBe(false);
    },
  );
  it("does not treat a colon-bearing main title without a known prefix as non-main", () => {
    expect(isNonMainNamespace("Bose: The Forgotten Hero")).toBe(false);
  });
});

describe("classifyLink", () => {
  it("classifies a same-wiki /wiki/{Title} as an article", () => {
    expect(classifyLink("/wiki/Albert_Einstein", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Albert Einstein",
    });
  });
  it("classifies an absolute same-lang URL as an article", () => {
    expect(classifyLink("https://en.wikipedia.org/wiki/Physics", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Physics",
    });
  });
  it("classifies a relative './Title' (Parsoid) as an article", () => {
    expect(classifyLink("./Quantum_mechanics", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Quantum mechanics",
    });
  });
  it("percent-decodes the article title", () => {
    expect(classifyLink("/wiki/Caf%C3%A9", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Café",
    });
  });

  it.each([
    "/wiki/File:Example.jpg",
    "/wiki/Special:Random",
    "/wiki/Help:Contents",
    "/wiki/Talk:Physics",
    "/wiki/Category:Science",
    "/wiki/Wikipedia:About",
    "/wiki/Portal:Science",
    "/wiki/Template:Cite",
    "/wiki/User:Jdoe",
    "/wiki/Media:Sound.ogg",
    "/wiki/Image:Old.jpg",
  ])("ignores non-main namespace %s", (href) => {
    expect(classifyLink(href, "en")).toEqual({ kind: "ignore" });
  });

  it("ignores an action=edit link", () => {
    expect(classifyLink("/w/index.php?title=Physics&action=edit", "en")).toEqual({
      kind: "ignore",
    });
  });
  it("ignores a redlink (missing page)", () => {
    expect(classifyLink("/w/index.php?title=Nonexistent&action=edit&redlink=1", "en")).toEqual({
      kind: "ignore",
    });
  });
  it("ignores a bare #fragment", () => {
    expect(classifyLink("#History", "en")).toEqual({ kind: "ignore" });
  });
  it("ignores an empty href", () => {
    expect(classifyLink("", "en")).toEqual({ kind: "ignore" });
  });

  it("ignores another-language wiki link (v1 stays same-language)", () => {
    expect(classifyLink("https://de.wikipedia.org/wiki/Physik", "en")).toEqual({ kind: "ignore" });
    expect(classifyLink("//fr.wikipedia.org/wiki/Physique", "en")).toEqual({ kind: "ignore" });
  });
  it("ignores an interwiki / other-project link", () => {
    expect(classifyLink("https://en.wiktionary.org/wiki/cat", "en")).toEqual({ kind: "ignore" });
    expect(classifyLink("https://commons.wikimedia.org/wiki/File:X.jpg", "en")).toEqual({
      kind: "ignore",
    });
  });

  it("classifies a non-wikipedia external link as external", () => {
    expect(classifyLink("https://example.com/page", "en")).toEqual({
      kind: "external",
      href: "https://example.com/page",
    });
  });
  it("classifies a mailto link as external", () => {
    expect(classifyLink("mailto:x@example.com", "en")).toEqual({
      kind: "external",
      href: "mailto:x@example.com",
    });
  });
});
