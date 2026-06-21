import { normalizeTitle, isNonMainNamespace, classifyLink, parseArticleInput } from "./links";

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
  // Fix 1: query string stripping
  it("strips a ?query string", () => {
    expect(normalizeTitle("Physics?action=edit")).toBe("Physics");
  });
  it("strips ?query before #fragment when both present", () => {
    expect(normalizeTitle("Foo?oldid=123#Section")).toBe("Foo");
  });
  // Fix 5: leading-colon (:[[:NS:X]] form) stripping
  it("strips a single leading colon before namespace check", () => {
    expect(normalizeTitle(":File:Example.jpg")).toBe("File:Example.jpg");
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

  // Fix 1: query string must be stripped — /wiki/ and ./ relative forms with ?query
  // The key invariant is that relative and absolute forms produce the SAME result.
  // Before the fix, "/wiki/Foo?action=edit" gave title "Foo?action=edit" (broken).
  // After the fix, the query is stripped and the title is "Foo" (same as absolute URL).
  it("strips ?action=edit from a /wiki/ link and classifies as article (consistent with absolute)", () => {
    expect(classifyLink("/wiki/Foo?action=edit", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Foo",
    });
  });
  it("strips ?oldid= from a ./ link and classifies as article (consistent with absolute)", () => {
    expect(classifyLink("./Foo?oldid=1", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Foo",
    });
  });
  it("classifies /wiki/Physics?section=0 consistently with the absolute URL form", () => {
    // Both relative (query-stripped → title "Physics") and absolute give article.
    const absolute = classifyLink("https://en.wikipedia.org/wiki/Physics", "en");
    const relative = classifyLink("/wiki/Physics?section=0", "en");
    expect(relative).toEqual(absolute);
    expect(relative).toEqual({ kind: "article", lang: "en", title: "Physics" });
  });

  // Fix 3: protocol-relative URLs
  it("classifies a same-lang protocol-relative URL as article", () => {
    expect(classifyLink("//en.wikipedia.org/wiki/Physics", "en")).toEqual({
      kind: "article",
      lang: "en",
      title: "Physics",
    });
  });
  it("ignores other-lang protocol-relative URLs (v1 same-language rule)", () => {
    expect(classifyLink("//fr.wikipedia.org/wiki/Physique", "en")).toEqual({ kind: "ignore" });
  });
  it("ignores a single-slash non-wiki path (not protocol-relative)", () => {
    expect(classifyLink("/w/index.php?title=Foo&action=edit", "en")).toEqual({ kind: "ignore" });
  });

  // Fix 5: leading-colon namespace bypass
  it("ignores /wiki/:File:Example.jpg (leading-colon namespace)", () => {
    expect(classifyLink("/wiki/:File:Example.jpg", "en")).toEqual({ kind: "ignore" });
  });
  it("ignores /wiki/:Special:Random (leading-colon special)", () => {
    expect(classifyLink("/wiki/:Special:Random", "en")).toEqual({ kind: "ignore" });
  });
});

describe("parseArticleInput", () => {
  it("accepts a plain title with the default lang", () => {
    expect(parseArticleInput("Albert Einstein", "en")).toEqual({
      lang: "en",
      title: "Albert Einstein",
    });
  });
  it("normalizes an underscored plain title", () => {
    expect(parseArticleInput("Quantum_mechanics", "en")).toEqual({
      lang: "en",
      title: "Quantum mechanics",
    });
  });
  it("extracts lang + title from a pasted same-or-other-lang article URL", () => {
    expect(parseArticleInput("https://de.wikipedia.org/wiki/Physik", "en")).toEqual({
      lang: "de",
      title: "Physik",
    });
  });
  it("percent-decodes a pasted URL title", () => {
    expect(parseArticleInput("https://en.wikipedia.org/wiki/Caf%C3%A9", "en")).toEqual({
      lang: "en",
      title: "Café",
    });
  });
  it("returns null for a namespaced URL", () => {
    expect(parseArticleInput("https://en.wikipedia.org/wiki/File:X.jpg", "en")).toBeNull();
    expect(parseArticleInput("https://en.wikipedia.org/wiki/Special:Random", "en")).toBeNull();
  });
  it("returns null for a non-wikipedia URL", () => {
    expect(parseArticleInput("https://example.com/page", "en")).toBeNull();
  });
  it("returns null for empty/whitespace input", () => {
    expect(parseArticleInput("", "en")).toBeNull();
    expect(parseArticleInput("   ", "en")).toBeNull();
  });
  it("returns null for a plain namespaced title", () => {
    expect(parseArticleInput("Category:Science", "en")).toBeNull();
  });
});
