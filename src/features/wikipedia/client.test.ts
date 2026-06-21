import { buildProxyUrl, getArticle, __resetInFlightForTests } from "./client";

jest.mock("@/src/lib/env", () => ({
  appEnv: { supabaseUrl: "https://proj.supabase.co" },
}));

const mockGetCacheEntry = jest.fn();
const mockPutCacheEntry = jest.fn();
jest.mock("@/src/lib/local-store", () => ({
  getLocalStore: () => ({
    getCacheEntry: (...a: unknown[]) => mockGetCacheEntry(...a),
    putCacheEntry: (...a: unknown[]) => mockPutCacheEntry(...a),
  }),
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

const WITH_HTML = {
  title: "Albert Einstein",
  key: "Albert_Einstein",
  html: "<p>Physicist</p>",
  license: { title: "Creative Commons Attribution-ShareAlike 4.0", url: "https://x" },
};

function okJson(body: unknown, etag = '"v1"') {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "etag" ? etag : null) },
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

describe("getArticle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetInFlightForTests();
    mockGetCacheEntry.mockResolvedValue(null);
    mockPutCacheEntry.mockResolvedValue(undefined);
    jest.spyOn(Date, "now").mockReturnValue(1_000);
  });
  afterEach(() => jest.restoreAllMocks());

  it("fetches via proxy on cache miss and stores the entry", async () => {
    global.fetch = jest.fn().mockReturnValue(okJson(WITH_HTML)) as unknown as typeof fetch;
    const result = await getArticle("en", "Albert Einstein");
    expect(result.canonicalTitle).toBe("Albert Einstein");
    expect(result.requestedTitle).toBe("Albert Einstein");
    expect(result.html).toBe("<p>Physicist</p>");
    expect(result.lang).toBe("en");
    expect(result.fromCache).toBe(false);
    expect(result.etag).toBe('"v1"');
    expect(result.sourceUrl).toBe("https://en.wikipedia.org/wiki/Albert%20Einstein");
    expect(mockPutCacheEntry).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a fresh cache entry without fetching", async () => {
    mockGetCacheEntry.mockResolvedValue({
      key: "en:albert einstein",
      lang: "en",
      requestedTitle: "Albert Einstein",
      canonicalTitle: "Albert Einstein",
      html: "<p>cached</p>",
      license: "CC BY-SA 4.0",
      fetchedAt: 1_000, // == Date.now() -> fresh
      etag: '"v1"',
    });
    global.fetch = jest.fn() as unknown as typeof fetch;
    const result = await getArticle("en", "Albert Einstein");
    expect(result.fromCache).toBe(true);
    expect(result.html).toBe("<p>cached</p>");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("revalidates a stale entry with If-None-Match and serves cache on 304", async () => {
    mockGetCacheEntry.mockResolvedValue({
      key: "en:albert einstein",
      lang: "en",
      requestedTitle: "Albert Einstein",
      canonicalTitle: "Albert Einstein",
      html: "<p>stale</p>",
      license: "CC BY-SA 4.0",
      fetchedAt: 1_000 - 86_400_001, // older than TTL -> stale
      etag: '"v1"',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 304,
      headers: { get: () => '"v1"' },
      json: () => Promise.reject(new Error("no body")),
    } as unknown as Response) as unknown as typeof fetch;

    const result = await getArticle("en", "Albert Einstein");
    expect(result.html).toBe("<p>stale</p>");
    expect(result.fromCache).toBe(true);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["If-None-Match"]).toBe('"v1"');
  });

  it("de-dupes concurrent identical requests into one fetch", async () => {
    global.fetch = jest.fn().mockReturnValue(okJson(WITH_HTML)) as unknown as typeof fetch;
    const [a, b] = await Promise.all([
      getArticle("en", "Albert Einstein"),
      getArticle("en", "Albert_Einstein"),
    ]);
    expect(a.canonicalTitle).toBe(b.canonicalTitle);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
