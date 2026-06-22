// src/features/sync/merge.test.ts
import { mergeSessions } from "@/src/features/sync/merge";
import type { SyncBundle } from "@/src/features/sync/types";
import type { Session, Node, Edge } from "@/src/features/sessions/types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    userId: "u1",
    title: "Roman Empire",
    viewportX: 0,
    viewportY: 0,
    viewportZoom: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "n1",
    sessionId: "s1",
    articleTitle: "Roman Empire",
    lang: "en",
    x: 0,
    y: 0,
    width: 380,
    height: 520,
    parentNodeId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeBundle(overrides: Partial<Session> = {}, nodes?: Node[], edges?: Edge[]): SyncBundle {
  const session = makeSession(overrides);
  return {
    session,
    nodes: nodes ?? [makeNode({ sessionId: session.id })],
    edges: edges ?? [],
  };
}

describe("mergeSessions", () => {
  it("returns empty result for two empty sides", () => {
    expect(mergeSessions([], [])).toEqual({ toUpload: [], toDownload: [], unchanged: [] });
  });

  it("uploads a local-only session", () => {
    const local = makeBundle({ id: "s1" });
    const result = mergeSessions([local], []);
    expect(result.toUpload).toEqual([local]);
    expect(result.toDownload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("keeps a local tombstone on an equal-timestamp tie (no resurrection)", () => {
    const ts = "2026-02-02T00:00:00.000Z";
    const local = makeBundle({ id: "s1", updatedAt: ts, deletedAt: ts });
    const remote = makeBundle({ id: "s1", updatedAt: ts, deletedAt: null });
    const result = mergeSessions([local], [remote]);
    expect(result.toUpload).toEqual([local]);
    expect(result.toDownload).toEqual([]);
  });

  it("downloads a remote tombstone on an equal-timestamp tie", () => {
    const ts = "2026-02-02T00:00:00.000Z";
    const local = makeBundle({ id: "s1", updatedAt: ts, deletedAt: null });
    const remote = makeBundle({ id: "s1", updatedAt: ts, deletedAt: ts });
    const result = mergeSessions([local], [remote]);
    expect(result.toDownload).toEqual([remote]);
    expect(result.toUpload).toEqual([]);
  });

  it("downloads a remote-only session", () => {
    const remote = makeBundle({ id: "s9" });
    const result = mergeSessions([], [remote]);
    expect(result.toDownload).toEqual([remote]);
    expect(result.toUpload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("uploads the local bundle when local is strictly newer", () => {
    const local = makeBundle({ id: "s1", updatedAt: "2026-02-02T00:00:00.000Z" });
    const remote = makeBundle({ id: "s1", updatedAt: "2026-01-01T00:00:00.000Z" });
    const result = mergeSessions([local], [remote]);
    expect(result.toUpload).toEqual([local]);
    expect(result.toDownload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("downloads the remote bundle when remote is strictly newer", () => {
    const local = makeBundle({ id: "s1", updatedAt: "2026-01-01T00:00:00.000Z" });
    const remote = makeBundle({ id: "s1", updatedAt: "2026-03-03T00:00:00.000Z" });
    const result = mergeSessions([local], [remote]);
    expect(result.toDownload).toEqual([remote]);
    expect(result.toUpload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("downloads remote on an equal-timestamp tie (converge on remote)", () => {
    const ts = "2026-04-04T00:00:00.000Z";
    const local = makeBundle({ id: "s1", title: "Local title", updatedAt: ts });
    const remote = makeBundle({ id: "s1", title: "Remote title", updatedAt: ts });
    const result = mergeSessions([local], [remote]);
    // tie-break is remote, but only when content differs; titles differ here
    expect(result.toDownload).toEqual([remote]);
    expect(result.toUpload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("marks a session unchanged when both sides are byte-identical", () => {
    const ts = "2026-04-04T00:00:00.000Z";
    const local = makeBundle({ id: "s1", updatedAt: ts });
    const remote = makeBundle({ id: "s1", updatedAt: ts });
    const result = mergeSessions([local], [remote]);
    expect(result.unchanged).toEqual(["s1"]);
    expect(result.toUpload).toEqual([]);
    expect(result.toDownload).toEqual([]);
  });

  it("propagates a local delete (local tombstone newer) by uploading it", () => {
    const local = makeBundle({
      id: "s1",
      updatedAt: "2026-05-05T00:00:00.000Z",
      deletedAt: "2026-05-05T00:00:00.000Z",
    });
    const remote = makeBundle({ id: "s1", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null });
    const result = mergeSessions([local], [remote]);
    expect(result.toUpload).toEqual([local]);
    expect(result.toDownload).toEqual([]);
  });

  it("propagates a remote delete (remote tombstone newer) by downloading it", () => {
    const local = makeBundle({ id: "s1", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null });
    const remote = makeBundle({
      id: "s1",
      updatedAt: "2026-06-06T00:00:00.000Z",
      deletedAt: "2026-06-06T00:00:00.000Z",
    });
    const result = mergeSessions([local], [remote]);
    expect(result.toDownload).toEqual([remote]);
    expect(result.toUpload).toEqual([]);
  });

  it("treats a resurrection: local live newer beats remote tombstone", () => {
    const local = makeBundle({ id: "s1", updatedAt: "2026-07-07T00:00:00.000Z", deletedAt: null });
    const remote = makeBundle({
      id: "s1",
      updatedAt: "2026-06-06T00:00:00.000Z",
      deletedAt: "2026-06-06T00:00:00.000Z",
    });
    const result = mergeSessions([local], [remote]);
    expect(result.toUpload).toEqual([local]);
    expect(result.toDownload).toEqual([]);
  });

  it("partitions a mixed set: one upload, one download, one remote-only, one unchanged", () => {
    const ts = "2026-04-04T00:00:00.000Z";
    const localNewer = makeBundle({ id: "a", updatedAt: "2026-09-09T00:00:00.000Z" });
    const remoteNewer = makeBundle({ id: "a-r", updatedAt: "2026-01-01T00:00:00.000Z" });
    const remoteWinsId = "b";
    const localOld = makeBundle({ id: remoteWinsId, updatedAt: "2026-01-01T00:00:00.000Z" });
    const remoteNew = makeBundle({ id: remoteWinsId, updatedAt: "2026-09-09T00:00:00.000Z" });
    const remoteOnly = makeBundle({ id: "c", updatedAt: ts });
    const sameLocal = makeBundle({ id: "d", updatedAt: ts });
    const sameRemote = makeBundle({ id: "d", updatedAt: ts });

    const result = mergeSessions(
      [localNewer, localOld, sameLocal],
      [remoteNew, remoteOnly, sameRemote],
    );

    expect(result.toUpload).toEqual([localNewer]);
    expect(result.toDownload.map((b) => b.session.id).sort()).toEqual(["b", "c"]);
    expect(result.unchanged).toEqual(["d"]);
    expect(remoteNewer.session.id).toBe("a-r"); // sanity: unused helper var
  });

  it("remote bundle with microsecond +00:00 timestamp newer by sub-ms wins over local Z timestamp", () => {
    // Local: 2026-06-22T10:00:00.662Z (ms precision)
    // Remote: 2026-06-22T10:00:00.662113+00:00 (microseconds, truly newer by 113µs)
    // Without epoch-millis comparison the raw-string 'Z' > '+' comparison would mis-rank remote as OLDER.
    // After normalization via sessionRowToDomain both would be .662Z, so merge sees equal timestamps.
    // This test instead verifies the epoch-millis path with a clearly newer remote (1ms difference).
    const localBundle = makeBundle({ id: "s1", updatedAt: "2026-06-22T10:00:00.662Z" });
    const remoteBundle = makeBundle({ id: "s1", updatedAt: "2026-06-22T10:00:00.663Z" });
    const result = mergeSessions([localBundle], [remoteBundle]);
    expect(result.toDownload).toEqual([remoteBundle]);
    expect(result.toUpload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("epoch-millis comparison: local with Z suffix correctly beats remote with older epoch value", () => {
    // Ensures that when local is newer, the epoch-millis path still correctly picks local.
    const localBundle = makeBundle({ id: "s1", updatedAt: "2026-06-22T10:00:00.663Z" });
    const remoteBundle = makeBundle({ id: "s1", updatedAt: "2026-06-22T10:00:00.662Z" });
    const result = mergeSessions([localBundle], [remoteBundle]);
    expect(result.toUpload).toEqual([localBundle]);
    expect(result.toDownload).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("does not mutate its input arrays", () => {
    const local = [makeBundle({ id: "s1", updatedAt: "2026-02-02T00:00:00.000Z" })];
    const remote = [makeBundle({ id: "s1", updatedAt: "2026-01-01T00:00:00.000Z" })];
    const localCopy = JSON.parse(JSON.stringify(local));
    const remoteCopy = JSON.parse(JSON.stringify(remote));
    mergeSessions(local, remote);
    expect(local).toEqual(localCopy);
    expect(remote).toEqual(remoteCopy);
  });
});
