import {
  ARTICLE_CACHE_TTL_MS,
  cacheKey,
  isFresh,
  isStale,
  dedupe,
  createInFlightMap,
} from "./cache";
import type { CacheEntry } from "@/src/lib/local-store/types";

function entry(fetchedAt: number): CacheEntry {
  return {
    key: "en:physics",
    lang: "en",
    requestedTitle: "Physics",
    canonicalTitle: "Physics",
    html: "<p>x</p>",
    license: "CC BY-SA 4.0",
    fetchedAt,
    etag: '"abc"',
  };
}

describe("ARTICLE_CACHE_TTL_MS", () => {
  it("is 24 hours in ms", () => {
    expect(ARTICLE_CACHE_TTL_MS).toBe(86_400_000);
  });
});

describe("cacheKey", () => {
  it("lower-cases lang but preserves title case", () => {
    expect(cacheKey("EN", "Albert_Einstein")).toBe("en:Albert Einstein");
  });
  it("normalizes underscores and percent-encoding but keeps case", () => {
    expect(cacheKey("en", "Albert_Einstein")).toBe("en:Albert Einstein");
  });
  it("strips fragments in the normalized title", () => {
    expect(cacheKey("en", "Caf%C3%A9#x")).toBe("en:Café");
  });
  // Fix 2: case-distinct Wikipedia articles must not collide
  it("distinguishes case-distinct titles (PH vs Ph vs pH)", () => {
    expect(cacheKey("en", "PH")).not.toBe(cacheKey("en", "Ph"));
    expect(cacheKey("en", "Ph")).not.toBe(cacheKey("en", "pH"));
    expect(cacheKey("en", "PH")).not.toBe(cacheKey("en", "pH"));
  });
  it("treats lang case-insensitively (EN === en)", () => {
    expect(cacheKey("EN", "Foo")).toBe(cacheKey("en", "Foo"));
  });
});

describe("isFresh / isStale", () => {
  const now = 1_000_000_000_000;
  it("fresh when within TTL", () => {
    expect(isFresh(entry(now - 1000), now)).toBe(true);
    expect(isStale(entry(now - 1000), now)).toBe(false);
  });
  it("stale at exactly TTL boundary", () => {
    expect(isFresh(entry(now - ARTICLE_CACHE_TTL_MS), now)).toBe(false);
    expect(isStale(entry(now - ARTICLE_CACHE_TTL_MS), now)).toBe(true);
  });
  it("respects a custom ttl override", () => {
    expect(isFresh(entry(now - 500), now, 1000)).toBe(true);
    expect(isFresh(entry(now - 1500), now, 1000)).toBe(false);
  });
});

describe("dedupe", () => {
  it("returns the same in-flight promise for concurrent identical keys", async () => {
    const map = new Map<string, Promise<number>>();
    let calls = 0;
    const factory = () =>
      new Promise<number>((resolve) => {
        calls += 1;
        setTimeout(() => resolve(42), 5);
      });
    const a = dedupe(map, "k", factory);
    const b = dedupe(map, "k", factory);
    expect(a).toBe(b);
    await expect(a).resolves.toBe(42);
    expect(calls).toBe(1);
  });
  it("clears the key after settle so a later call re-runs", async () => {
    const map = new Map<string, Promise<number>>();
    let calls = 0;
    const factory = () => Promise.resolve(++calls);
    await dedupe(map, "k", factory);
    await dedupe(map, "k", factory);
    expect(calls).toBe(2);
    expect(map.size).toBe(0);
  });
  it("clears the key on rejection too", async () => {
    const map = new Map<string, Promise<number>>();
    const factory = () => Promise.reject(new Error("boom"));
    await expect(dedupe(map, "k", factory)).rejects.toThrow("boom");
    expect(map.size).toBe(0);
  });
});

describe("createInFlightMap", () => {
  it("returns an empty Map", () => {
    const map = createInFlightMap();
    expect(map.size).toBe(0);
  });
});
