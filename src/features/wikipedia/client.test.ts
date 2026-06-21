import { buildProxyUrl } from "./client";

jest.mock("@/src/lib/env", () => ({
  appEnv: { supabaseUrl: "https://proj.supabase.co" },
}));

describe("buildProxyUrl", () => {
  it("builds an article URL", () => {
    expect(buildProxyUrl({ lang: "en", title: "Albert Einstein" })).toBe(
      "https://proj.supabase.co/functions/v1/wiki-proxy?lang=en&title=Albert+Einstein",
    );
  });
  it("encodes reserved chars in the title", () => {
    expect(buildProxyUrl({ lang: "en", title: "AC/DC" })).toBe(
      "https://proj.supabase.co/functions/v1/wiki-proxy?lang=en&title=AC%2FDC",
    );
  });
  it("builds a search URL with default-ish params", () => {
    expect(buildProxyUrl({ lang: "en", mode: "search", q: "ein", limit: 5 })).toBe(
      "https://proj.supabase.co/functions/v1/wiki-proxy?lang=en&mode=search&q=ein&limit=5",
    );
  });
  it("omits title when search mode", () => {
    const url = buildProxyUrl({ lang: "de", mode: "search", q: "phys", limit: 10 });
    expect(url).toContain("mode=search");
    expect(url).not.toContain("title=");
  });
});
