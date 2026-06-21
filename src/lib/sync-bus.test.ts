// src/lib/sync-bus.test.ts
import { syncBus } from "@/src/lib/sync-bus";

describe("syncBus", () => {
  it("notify is a no-op with no subscribers (does not throw)", () => {
    expect(() => syncBus.notify("s-1")).not.toThrow();
  });

  it("delivers session ids to a subscriber", () => {
    const seen: string[] = [];
    const unsub = syncBus.subscribe((id) => seen.push(id));
    syncBus.notify("s-1");
    syncBus.notify("s-2");
    expect(seen).toEqual(["s-1", "s-2"]);
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const unsub = syncBus.subscribe((id) => seen.push(id));
    syncBus.notify("s-1");
    unsub();
    syncBus.notify("s-2");
    expect(seen).toEqual(["s-1"]);
  });

  it("fans out to multiple subscribers and isolates one subscriber's throw", () => {
    const a: string[] = [];
    const b: string[] = [];
    const unsubA = syncBus.subscribe(() => {
      throw new Error("boom");
    });
    const unsubB = syncBus.subscribe((id) => b.push(id));
    const unsubC = syncBus.subscribe((id) => a.push(id));
    expect(() => syncBus.notify("s-1")).not.toThrow();
    expect(b).toEqual(["s-1"]);
    expect(a).toEqual(["s-1"]);
    unsubA();
    unsubB();
    unsubC();
  });
});
