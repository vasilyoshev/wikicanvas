import { expect, test } from "@playwright/test";

import { mockWikiProxy, readNodeRow, seedBundle, type SeedBundle } from "./canvas-helpers";

const NOW = "2026-06-20T00:00:00.000Z";
const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const NODE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NODE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const BUNDLE: SeedBundle = {
  session: {
    id: SESSION_ID,
    user_id: null,
    title: "Octopus exploration",
    viewport_x: 0,
    viewport_y: 0,
    viewport_zoom: 1,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  nodes: [
    {
      id: NODE_A,
      session_id: SESSION_ID,
      article_title: "Octopus",
      lang: "en",
      x: 100,
      y: 100,
      width: 380,
      height: 520,
      parent_node_id: null,
      created_at: NOW,
    },
    {
      id: NODE_B,
      session_id: SESSION_ID,
      article_title: "Cephalopod",
      lang: "en",
      x: 560,
      y: 100,
      width: 380,
      height: 520,
      parent_node_id: NODE_A,
      created_at: NOW,
    },
  ],
  edges: [
    {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      session_id: SESSION_ID,
      source_node_id: NODE_A,
      target_node_id: NODE_B,
      clicked_link_text: "Cephalopod",
      created_at: NOW,
    },
  ],
};

test.describe("canvas board", () => {
  test.beforeEach(async ({ page }) => {
    await mockWikiProxy(page);
    // Stub Supabase auth so connection-refused errors don't linger or redirect.
    await page.route("**/auth/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
    );
    // Visit the sessions list so the SPA initialises. Wait for the screen to
    // be visible, then wait for the page to become idle before seeding IndexedDB
    // so that no in-flight SPA navigation destroys the evaluate execution context.
    await page.goto("/");
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });
    // Seed now: our seedBundle includes an onupgradeneeded handler that creates
    // the object stores if the app's own openDB hasn't run yet, so this is safe
    // to call as soon as the page JS has executed (DOM is visible above).
    await seedBundle(page, BUNDLE);
  });

  test("renders seeded windows and the mocked article body", async ({ page }) => {
    await page.goto(`/canvas/${SESSION_ID}`);
    await expect(page.getByTestId("canvas-board")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`canvas-node-${NODE_A}`)).toBeVisible();
    await expect(page.getByTestId(`canvas-node-${NODE_B}`)).toBeVisible();
    // The mocked article HTML lands inside the node's iframe.
    const frame = page.frameLocator(`[data-testid="article-frame-${NODE_A}"]`);
    await expect(frame.getByRole("heading", { name: "Octopus" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("zoom controls update the percentage label", async ({ page }) => {
    await page.goto(`/canvas/${SESSION_ID}`);
    await expect(page.getByTestId("zoom-reset")).toContainText("100%");
    await page.getByTestId("zoom-in").click();
    await expect(page.getByTestId("zoom-reset")).not.toContainText("100%");
    await page.getByTestId("zoom-reset").click();
    await expect(page.getByTestId("zoom-reset")).toContainText("100%");
  });

  test("dragging a node persists its new position across reload", async ({ page }) => {
    await page.goto(`/canvas/${SESSION_ID}`);
    const before = await readNodeRow(page, NODE_A);
    expect(before?.x).toBe(100);

    const handle = page.getByTestId(`canvas-node-drag-${NODE_A}`);
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, {
        steps: 8,
      });
      await page.mouse.up();
    }

    // Geometry is debounced/persisted; wait for the row to change.
    await expect
      .poll(async () => (await readNodeRow(page, NODE_A))?.x ?? 100, { timeout: 10_000 })
      .toBeGreaterThan(100);

    await page.reload();
    await expect(page.getByTestId(`canvas-node-${NODE_A}`)).toBeVisible({ timeout: 15_000 });
    const after = await readNodeRow(page, NODE_A);
    expect(after?.x).toBeGreaterThan(100);
  });
});
