// src/features/sessions/session-summary.test.ts
import { summarizeSession } from "@/src/features/sessions/session-summary";
import type { SessionSummary } from "@/src/features/sessions/types";

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s1",
    title: "Octopus",
    nodeCount: 3,
    updatedAt: "2026-06-20T12:00:00.000Z",
    previewNodes: [],
    ...overrides,
  };
}

describe("summarizeSession", () => {
  const now = Date.parse("2026-06-20T12:00:00.000Z");

  it("returns the node count as windowCount", () => {
    expect(summarizeSession(makeSummary({ nodeCount: 0 }), now).windowCount).toBe(0);
    expect(summarizeSession(makeSummary({ nodeCount: 7 }), now).windowCount).toBe(7);
  });

  it("labels sub-minute edits as 'just now'", () => {
    const s = makeSummary({ updatedAt: "2026-06-20T11:59:30.000Z" });
    expect(summarizeSession(s, now).editedLabel).toBe("just now");
  });

  it("labels minutes, hours and days", () => {
    expect(
      summarizeSession(makeSummary({ updatedAt: "2026-06-20T11:55:00.000Z" }), now).editedLabel,
    ).toBe("5m ago");
    expect(
      summarizeSession(makeSummary({ updatedAt: "2026-06-20T09:00:00.000Z" }), now).editedLabel,
    ).toBe("3h ago");
    expect(
      summarizeSession(makeSummary({ updatedAt: "2026-06-18T12:00:00.000Z" }), now).editedLabel,
    ).toBe("2d ago");
  });

  it("falls back to an ISO date for edits older than 7 days", () => {
    const s = makeSummary({ updatedAt: "2026-06-01T12:00:00.000Z" });
    expect(summarizeSession(s, now).editedLabel).toBe("2026-06-01");
  });

  it("clamps future timestamps to 'just now'", () => {
    const s = makeSummary({ updatedAt: "2026-06-20T12:05:00.000Z" });
    expect(summarizeSession(s, now).editedLabel).toBe("just now");
  });

  it("defaults now to Date.now() when omitted", () => {
    const s = makeSummary({ updatedAt: new Date().toISOString() });
    expect(summarizeSession(s).editedLabel).toBe("just now");
  });
});
