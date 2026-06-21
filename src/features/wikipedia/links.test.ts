import { normalizeTitle, isNonMainNamespace } from "./links";

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
