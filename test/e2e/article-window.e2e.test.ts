import { expect, test } from "@playwright/test";

import { MOCK_ARTICLE_WITH_HTML } from "./fixtures/wiki-proxy";

test.describe("static article window (mocked wiki-proxy)", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept ALL wiki-proxy calls so CI never reaches Wikipedia.
    await page.route("**/functions/v1/wiki-proxy*", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"e2e-v1"' },
        body: JSON.stringify(MOCK_ARTICLE_WITH_HTML),
      });
    });
  });

  test("renders the article window with title and sandboxed body", async ({ page }) => {
    await page.goto("/(app)/article-preview");

    // Header shows the canonical title.
    await expect(page.getByText("Physics", { exact: true })).toBeVisible({ timeout: 15_000 });

    // The body renders inside a sandboxed iframe (allow-scripts, no allow-same-origin).
    const frameElement = page.locator('iframe[sandbox="allow-scripts"]');
    await expect(frameElement).toBeVisible();

    const frame = page.frameLocator('iframe[sandbox="allow-scripts"]');
    await expect(frame.locator("#lede")).toContainText("Physics is the natural science");
  });

  test("clicking an internal link posts a wikilink message to the parent", async ({ page }) => {
    await page.goto("/(app)/article-preview");
    await expect(page.getByText("Physics", { exact: true })).toBeVisible({ timeout: 15_000 });

    const frame = page.frameLocator('iframe[sandbox="allow-scripts"]');
    await frame.getByRole("link", { name: "Energy" }).click();

    // The preview screen records the last message in a testID node for assertion.
    await expect(page.getByTestId("last-message")).toHaveText(/wikilink:en:Energy/, {
      timeout: 10_000,
    });
  });
});
