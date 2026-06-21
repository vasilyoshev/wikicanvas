import { expect, test } from "@playwright/test";

import { seedSessions, type SeedNodeRow, type SeedSessionRow } from "./sessions-seed";

function makeSessionRow(overrides: Partial<SeedSessionRow> = {}): SeedSessionRow {
  const now = new Date().toISOString();
  return {
    id: "seed-session-1",
    user_id: null,
    title: "Octopus",
    viewport_x: 0,
    viewport_y: 0,
    viewport_zoom: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

function makeNodeRow(overrides: Partial<SeedNodeRow> = {}): SeedNodeRow {
  return {
    id: "seed-node-1",
    session_id: "seed-session-1",
    article_title: "Octopus",
    lang: "en",
    x: 0,
    y: 0,
    width: 380,
    height: 520,
    parent_node_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Mock the wiki-proxy: search mode returns a fixed result; article fetches return
// a minimal HTML fixture. Both modes must be covered so CI never reaches Wikipedia
// (spec §10) — create flow hits search first, then article fetch on canvas load.
async function mockProxySearch(page: import("@playwright/test").Page) {
  await page.route("**/functions/v1/wiki-proxy**", async (route) => {
    const url = route.request().url();
    if (url.includes("mode=search")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          pages: [
            { id: 1, key: "Cephalopod", title: "Cephalopod", description: "A class of molluscs" },
          ],
        }),
      });
      return;
    }
    // Article fetch (canvas load after create).
    const urlObj = new URL(url);
    const title = urlObj.searchParams.get("title") ?? "Article";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", etag: '"mock-etag"' },
      body: JSON.stringify({
        title,
        key: title.replace(/ /g, "_"),
        html: `<!DOCTYPE html><html><body><h1>${title}</h1><p>Body of ${title}.</p></body></html>`,
        license: { type: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      }),
    });
  });
}

test.describe("sessions list (anonymous, local-first)", () => {
  test.beforeEach(async ({ page }) => {
    // Stub Supabase auth so connection-refused errors don't linger or redirect.
    await page.route("**/auth/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
    );
    // Navigate to "/" and wait for the SPA to initialise so the DB is open before any
    // seed calls. Each test gets a fresh browser context (fresh IndexedDB) from Playwright.
    await page.goto("/");
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });
  });

  test("shows the empty state with no sessions", async ({ page }) => {
    await expect(page.getByText("Your sessions", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("No sessions yet")).toBeVisible();
    await expect(page.getByTestId("new-session-card")).toBeVisible();
    await expect(page.getByTestId("sign-in-sync")).toBeVisible();
  });

  test("creates a session from search and navigates to the canvas", async ({ page }) => {
    await mockProxySearch(page);

    await expect(page.getByText("Your sessions", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("new-session-card").click();
    await page.getByTestId("new-session-search-input").fill("cephalo");
    await page.getByTestId("new-session-result-0").click();

    // Creating a session navigates to /canvas/{id}.
    await expect(page).toHaveURL(/\/canvas\//, { timeout: 15_000 });
  });

  test("opens a seeded session via the card", async ({ page }) => {
    await seedSessions(page, { sessions: [makeSessionRow()], nodes: [makeNodeRow()] });
    await page.reload();
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });
    await expect(page.getByTestId("session-card-seed-session-1")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("session-card-seed-session-1").click();
    await expect(page).toHaveURL(/\/canvas\/seed-session-1/, { timeout: 15_000 });
  });

  test("renames a seeded session", async ({ page }) => {
    await seedSessions(page, { sessions: [makeSessionRow()], nodes: [makeNodeRow()] });
    await page.reload();
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });
    await expect(page.getByText("Octopus")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("session-menu-seed-session-1").click();
    await page.getByTestId("session-rename-seed-session-1").click();
    await page.getByTestId("rename-session-input").fill("Cephalopod study");
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect(page.getByText("Cephalopod study")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Octopus")).toHaveCount(0);
  });

  test("soft-deletes a seeded session", async ({ page }) => {
    await seedSessions(page, { sessions: [makeSessionRow()], nodes: [makeNodeRow()] });
    await page.reload();
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });
    await expect(page.getByText("Octopus")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("session-menu-seed-session-1").click();
    await page.getByTestId("session-delete-seed-session-1").click();
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect(page.getByTestId("session-card-seed-session-1")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByText("No sessions yet")).toBeVisible();
  });
});
