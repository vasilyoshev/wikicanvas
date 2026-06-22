// test/e2e/sync.e2e.test.ts
import { test, expect, type Page } from "@playwright/test";

import { seedSessions, type SeedSessionRow, type SeedNodeRow } from "./sessions-seed";

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
  user_id: "user-xyz",
  title: "Remote Byzantine Empire",
  viewport_x: 0,
  viewport_y: 0,
  viewport_zoom: 1,
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  deleted_at: null,
};

/** Intercept Supabase REST so sign-in resolves and the remote returns one extra session. */
async function mockSupabase(page: Page) {
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
  // Stub the auth flow: pressing sign-in injects a fake signed-in session.
  await page.addInitScript(() => {
    (window as unknown as { __WIKICANVAS_FAKE_USER__?: string }).__WIKICANVAS_FAKE_USER__ =
      "user-xyz";
  });
}

test.describe("auth-gated sync", () => {
  test("anonymous session is adopted and remote session is downloaded on sign-in", async ({
    page,
  }) => {
    // Stub auth endpoints to avoid connection errors.
    await page.route("**/auth/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
    );

    await mockSupabase(page);

    // Navigate first so the app opens IndexedDB (establishing the schema).
    await page.goto("/");
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });

    // Seed the anonymous local session after the DB is ready.
    await seedSessions(page, { sessions: [ANON_SESSION], nodes: [ANON_NODE] });

    // Reload so the app reads the seeded data fresh.
    await page.reload();
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });

    // Anonymous local session is visible with no login.
    await expect(page.getByText("Local Roman Empire")).toBeVisible({ timeout: 10_000 });

    // Trigger sign-in -> sync.
    await page.getByTestId("sign-in-sync").click();

    // After merge: the remote-only session is now present locally too.
    await expect(page.getByText("Remote Byzantine Empire")).toBeVisible({ timeout: 15_000 });
    // The adopted anonymous session is still present.
    await expect(page.getByText("Local Roman Empire")).toBeVisible();
  });
});
