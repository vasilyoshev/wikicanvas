import {
  sessionKeys,
  useCreateSession,
  useDeleteSession,
  useRenameSession,
  useSessionsList,
} from "@/src/features/sessions/queries";

describe("sessionKeys (Phase 6 consumption contract)", () => {
  it("exposes the canonical key factories Phase 6 depends on", () => {
    expect(sessionKeys.all).toEqual(["sessions"]);
    expect(sessionKeys.list(null)).toEqual(["sessions", "list", "anonymous"]);
    expect(sessionKeys.list("u1")).toEqual(["sessions", "list", "u1"]);
    expect(sessionKeys.bundle("s1")).toEqual(["sessions", "bundle", "s1"]);
  });

  it("re-exports the list/create/rename/delete hooks used by the sessions list", () => {
    expect(typeof useSessionsList).toBe("function");
    expect(typeof useCreateSession).toBe("function");
    expect(typeof useRenameSession).toBe("function");
    expect(typeof useDeleteSession).toBe("function");
  });
});
