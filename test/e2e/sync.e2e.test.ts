// test/e2e/sync.e2e.test.ts
import { test, expect, type Page } from "@playwright/test";

import { seedSessions, type SeedSessionRow, type SeedNodeRow } from "./sessions-seed";

const FAKE_USER_ID = "user-xyz";

const ANON_SESSION: SeedSessionRow = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: null,
  title: "Local Roman Empire",
  viewport_x: 0,
  viewport_y: 0,
  viewport_zoom: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};
const ANON_NODE: SeedNodeRow = {
  id: "00000000-0000-0000-0000-0000000000a1",
  session_id: ANON_SESSION.id,
  article_title: "Roman Empire",
  lang: "en",
  x: 0,
  y: 0,
  width: 380,
  height: 520,
  parent_node_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
};
const REMOTE_SESSION: SeedSessionRow = {
  id: "00000000-0000-0000-0000-000000000002",
  user_id: FAKE_USER_ID,
  title: "Remote Byzantine Empire",
  viewport_x: 0,
  viewport_y: 0,
  viewport_zoom: 1,
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  deleted_at: null,
};

/** Build a synthesized supabase-js v2 session payload for localStorage seeding. */
function makeFakeSupabaseSession() {
  return {
    access_token: "fake-access-token",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 999_999_999,
    expires_in: 999_999_999,
    refresh_token: "fake-refresh-token",
    user: {
      id: FAKE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "test@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2024-01-01T00:00:00Z",
    },
  };
}

/**
 * Intercept Supabase REST and auth so the fake session works end-to-end.
 * Seeds a synthesized supabase-js v2 session into localStorage["wikicanvas-auth"]
 * BEFORE app code runs, so supabase.auth.getSession() hydrates it and SessionProvider
 * reports the signed-in user via its real path (session?.user).
 */
async function mockSupabase(page: Page) {
  const fakeSession = makeFakeSupabaseSession();

  // Seed the supabase-js session into localStorage BEFORE app code runs.
  await page.addInitScript((sessionJson) => {
    localStorage.setItem("wikicanvas-auth", JSON.stringify(sessionJson));
  }, fakeSession);

  // Auth endpoint: return the same session so token refresh/validation succeeds.
  await page.route("**/auth/v1/**", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 200 });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fakeSession),
    });
  });

  // REST mocks: remote returns one extra session (owned by FAKE_USER_ID); upserts succeed.
  await page.route("**/rest/v1/session**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([REMOTE_SESSION]),
      });
    }
    // upserts (POST/PATCH/DELETE) just succeed
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/node**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/rest/v1/edge**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

test.describe("auth-gated sync", () => {
  test("anonymous session is adopted and remote session is downloaded on sign-in", async ({
    page,
  }) => {
    // mockSupabase seeds auth into localStorage (runs before app) and stubs REST/auth endpoints.
    await mockSupabase(page);

    // Navigate first so the app opens IndexedDB (establishing the schema).
    await page.goto("/");
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });

    // Seed the anonymous local session after the DB is ready.
    await seedSessions(page, { sessions: [ANON_SESSION], nodes: [ANON_NODE] });

    // Reload so the app reads both the seeded IndexedDB data and the pre-seeded auth session.
    await page.reload();
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });

    // Anonymous local session is visible (adopted by the signed-in user on sync).
    await expect(page.getByText("Local Roman Empire")).toBeVisible({ timeout: 10_000 });

    // After merge: the remote-only session is now present locally too.
    await expect(page.getByText("Remote Byzantine Empire")).toBeVisible({ timeout: 15_000 });
    // The adopted anonymous session is still present.
    await expect(page.getByText("Local Roman Empire")).toBeVisible();
  });
});
