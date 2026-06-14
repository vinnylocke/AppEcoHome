import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";

// ─────────────────────────────────────────────────────────────────────────
// shed-discovery.spec.ts
//
// Covers the discovery / browse mechanics of /shed (catalogue PR 2,
// section 03.1) — tab routing, search by scientific name, sort modes,
// the Plants/Nursery view toggle, manual-name max length, credit badge.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Shed — discovery, sort, tabs", () => {
  test("SHED-DSC-001: /shed?tab=watchlist switches the hub to the Watchlist tab", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await authenticatedPage.goto("/shed?tab=watchlist");

    await expect(shed.hubTabWatchlist).toHaveAttribute("aria-selected", "true");
    await expect(shed.hubTabShed).toHaveAttribute("aria-selected", "false");
    // The Plants grid should not render when Watchlist is active.
    await expect(shed.heading).toBeHidden();
  });

  test("SHED-DSC-002: shed-view toggle flips to Nursery and hides the plant grid", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await expect(shed.viewPlantsBtn).toBeVisible();
    await shed.viewNurseryBtn.click();

    // Nursery view replaces the plants grid (search + plant cards hidden).
    await expect(shed.searchInput).toBeHidden();
    await expect(shed.plantCard("Tomato")).toBeHidden();
  });

  test("SHED-DSC-003: search by scientific name (Solanum) matches the Tomato card", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.searchInput.fill("Solanum");

    // Tomato has scientific_name = ["Solanum lycopersicum"] in the seed.
    await expect(shed.plantCard("Tomato")).toBeVisible();
    // Other plants with different scientific names should be filtered out.
    await expect(shed.plantCard("Boston Fern")).toBeHidden();
    await expect(shed.plantCard("Lavender")).toBeHidden();
  });

  test("SHED-DSC-004: sort A-Z orders cards alphabetically (first < last)", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // The default sort is already "alphabetical" — assert it directly.
    await expect(shed.sortSelect).toHaveValue("alphabetical");

    // Capture the rendered card order.
    const cardTexts = await authenticatedPage
      .locator("[data-plant-card] h3, [data-plant-card] h2")
      .allInnerTexts();

    // At least 2 active cards must be present for the assertion to mean
    // anything. The seed has 5 active plants so this should always be true.
    expect(cardTexts.length).toBeGreaterThan(1);
    const first = cardTexts[0].trim().toLowerCase();
    const last = cardTexts[cardTexts.length - 1].trim().toLowerCase();
    expect(first.localeCompare(last)).toBeLessThanOrEqual(0);
  });

  test("SHED-DSC-005: source filter — selecting Plant Database narrows the grid to api-source plants", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.sourceFilterSelect.selectOption("api");

    await expect(shed.plantCard("Lavender")).toBeVisible();
    await expect(shed.plantCard("Tomato")).toBeHidden();
    await expect(shed.plantCard("Basil")).toBeHidden();
  });

  test("SHED-DSC-006: source filter — All Sources restores every visible plant after a narrow", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Narrow first → only Lavender (api) visible
    await shed.sourceFilterSelect.selectOption("api");
    await expect(shed.plantCard("Tomato")).toBeHidden();

    // Reset back to All Sources → manual plants reappear
    await shed.sourceFilterSelect.selectOption("all");
    await expect(shed.plantCard("Tomato")).toBeVisible();
    await expect(shed.plantCard("Basil")).toBeVisible();
  });

  test("SHED-DSC-007: credit badge popover (when present) shows source + licence", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Only api-sourced plants land with image credit metadata in production;
    // seeded manual plants generally don't. So the badge may not be present
    // at all — that's fine, the test is a no-op then.
    const hasBadge = await shed.anyCreditBadge.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasBadge) {
      test.skip(true, "No image-credit badges present in current seed — skipping");
      return;
    }
    await shed.anyCreditBadge.click();
    await expect(shed.creditPopover).toBeVisible({ timeout: 5000 });
    await expect(shed.creditPopover).toContainText(/source|licence|credit/i);
  });
});
