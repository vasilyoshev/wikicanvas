// test/e2e/link-spawn.e2e.test.ts
import { expect, test } from "@playwright/test";

import { seedBundle, type SeedBundle } from "./canvas-helpers";

// ── constants ────────────────────────────────────────────────────────────────
const NOW = "2026-06-20T00:00:00.000Z";
const SESSION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ROOT_NODE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

// CAT_HTML: a minimal article fragment containing two internal links to "Dog"
// (both use ./Dog form so the interceptor classifies them as wikilinks).
const CAT_HTML = `
  <p>The <b>cat</b> is a domestic species.</p>
  <p>See also <a href="./Dog" title="Dog" id="link-dog-1">dogs</a>.</p>
  <p>Also <a href="./Dog" title="Dog" id="link-dog-2">canines</a>.</p>
`;

// DOG_HTML: body returned when the Dog node fetches its article.
const DOG_HTML = `<p>The <b>dog</b> is a domesticated descendant of the wolf.</p>`;

// ── seed data ────────────────────────────────────────────────────────────────
const BUNDLE: SeedBundle = {
  session: {
    id: SESSION_ID,
    user_id: null,
    title: "Cat exploration",
    viewport_x: 0,
    viewport_y: 0,
    viewport_zoom: 1,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  nodes: [
    {
      id: ROOT_NODE_ID,
      session_id: SESSION_ID,
      article_title: "Cat",
      lang: "en",
      x: 100,
      y: 100,
      width: 380,
      height: 520,
      parent_node_id: null,
      created_at: NOW,
    },
  ],
  edges: [],
};

// ── suite ────────────────────────────────────────────────────────────────────
test.describe("link spawning + de-dupe", () => {
  test.beforeEach(async ({ page }) => {
    // Mock wiki-proxy: serve Cat HTML with internal Dog links; serve Dog HTML for Dog.
    await page.route("**/functions/v1/wiki-proxy**", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("mode") === "search") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ pages: [] }),
        });
      }
      const title = url.searchParams.get("title") ?? "Article";
      const html = title === "Dog" ? DOG_HTML : CAT_HTML;
      const body = {
        title,
        key: title.replace(/ /g, "_"),
        html,
        license: { title: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", etag: `"etag-${title}"` },
        body: JSON.stringify(body),
      });
    });

    // Stub Supabase auth to avoid connection-refused errors.
    await page.route("**/auth/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
    );

    // Navigate to the sessions-list so the SPA initialises (same pattern as canvas.e2e.test.ts).
    await page.goto("/");
    await page.getByTestId("sessions-list-screen").waitFor({ timeout: 15_000 });

    // Now seed the IndexedDB with our Cat session + root node.
    await seedBundle(page, BUNDLE);
  });

  test("clicking an internal link spawns a connected window; re-clicking the same title adds only an edge", async ({
    page,
  }) => {
    await page.goto(`/canvas/${SESSION_ID}`);

    // Wait for the canvas board and the seeded Cat node to render.
    await expect(page.getByTestId("canvas-board")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`canvas-node-${ROOT_NODE_ID}`)).toBeVisible({ timeout: 15_000 });

    // The seeded Cat window iframe should render the CAT_HTML body with the "cat" bold text.
    const catFrame = page.frameLocator(`[data-testid="article-frame-${ROOT_NODE_ID}"]`);
    await expect(catFrame.locator("b", { hasText: "cat" })).toBeVisible({ timeout: 20_000 });

    // STEP 1: Click the first internal "Dog" link inside the Cat iframe.
    // The interceptor captures the click, prevents default, posts a wikilink message.
    // useLinkSpawn → getArticle("en","Dog") → decideSpawn → spawns Dog node + edge.
    await catFrame.locator("#link-dog-1").click();

    // Assert: a new Dog window title appears on the canvas.
    await expect(page.getByTestId("canvas-node-title-Dog")).toBeVisible({ timeout: 20_000 });

    // Assert: exactly one edge is tracked in the DOM overlay.
    await expect(page.getByTestId("canvas-edge")).toHaveCount(1, { timeout: 10_000 });

    // STEP 2: Re-click the SAME title via the second Dog link in the Cat iframe.
    // decideSpawn → "edge-only" (Dog node already exists) → only addEdge is called.
    await catFrame.locator("#link-dog-2").click();

    // De-dupe: still exactly ONE Dog node (no duplicate window).
    await expect(page.getByTestId("canvas-node-title-Dog")).toHaveCount(1, { timeout: 10_000 });

    // De-dupe: now TWO edges (Cat→Dog spawned + Cat→Dog re-click).
    await expect(page.getByTestId("canvas-edge")).toHaveCount(2, { timeout: 10_000 });
  });
});
