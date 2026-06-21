// src/lib/local-store/index.test.ts
import "fake-indexeddb/auto";
import { getLocalStore, __resetLocalStoreForTests } from "@/src/lib/local-store/index";

describe("getLocalStore (web entry)", () => {
  beforeEach(() => __resetLocalStoreForTests());

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getLocalStore();
    const b = getLocalStore();
    expect(a).toBe(b);
  });

  it("exposes the LocalStore surface", () => {
    const store = getLocalStore();
    expect(typeof store.listSessions).toBe("function");
    expect(typeof store.upsertSession).toBe("function");
    expect(typeof store.adoptAnonymousSessions).toBe("function");
  });
});
