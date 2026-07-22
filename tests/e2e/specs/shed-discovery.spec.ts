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

  test("SHED-DSC-002: the Seed box sheet hosts the nursery (Stage D — tabs collapsed to two)", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Two-tab hub: no nursery/senescence tabs.
    await expect(authenticatedPage.getByTestId("garden-hub-tab-nursery")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("garden-hub-tab-senescence")).toHaveCount(0);

    await shed.openOverflowMenu();
    await authenticatedPage.getByTestId("shed-open-seed-box").click();
    await expect(authenticatedPage.getByTestId("seed-box-sheet")).toBeVisible({ timeout: 10000 });
    // NurseryTab renders `nursery-tab` only in its loaded/favourites states —
    // the empty-packets state (the common case for a freshly-seeded worker)
    // has no such wrapper. `nursery-add-seeds-btn` is present in every state.
    await expect(authenticatedPage.getByTestId("nursery-add-seeds-btn")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("seed-box-close").click();
    await expect(authenticatedPage.getByTestId("seed-box-sheet")).toHaveCount(0);
  });

  test("SHED-DSC-003: search by scientific name (Solanum) matches the owned Tomato (one-search takeover)", async ({
    authenticatedPage,
  }) => {
    // Stage 3: the landing grid-filter died — scientific-name lookup lives in
    // the takeover's "In your garden" section (same matching rules).
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("Solanum");

    const owned = authenticatedPage.getByTestId("search-owned-section");
    await expect(owned).toBeVisible({ timeout: 10000 });
    // Tomato has scientific_name = ["Solanum lycopersicum"] in the seed.
    await expect(owned.getByText("Tomato").first()).toBeVisible();
    await expect(owned.getByText("Boston Fern")).toHaveCount(0);
  });

  test("SHED-DSC-004: sort A-Z orders cards alphabetically (first < last)", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // The default sort is already "alphabetical" — assert it directly.
    await shed.openFilters();
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

    await shed.openFilters();

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
    await shed.openFilters();
    await shed.sourceFilterSelect.selectOption("api");
    await expect(shed.plantCard("Tomato")).toBeHidden();

    // Reset back to All Sources → manual plants reappear
    await shed.openFilters();
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

  test("SHED-E1: a library result row from the search takeover opens the detail modal with the three-verb footer", async ({
    authenticatedPage,
  }) => {
    // Search unification (Stage E) — the "In your garden" owned section and
    // the library results coexist; tapping a LIBRARY row's body opens the
    // shared detail modal, and — because it was opened from the shed search
    // takeover — the footer carries the three quick-add verbs.
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("Tomato");

    await expect(authenticatedPage.getByTestId("search-owned-section")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("search-owned-section").getByText("In your garden")).toBeVisible();

    const libraryRow = authenticatedPage
      .locator('button[data-testid^="plant-search-result-library-"]:not([data-testid$="-add"])')
      .first();
    await expect(libraryRow).toBeVisible({ timeout: 10000 });
    await libraryRow.click();

    await expect(shed.bulkDetailModal).toBeVisible({ timeout: 8000 });
    const actions = authenticatedPage.getByTestId("plant-detail-actions");
    await expect(actions).toBeVisible({ timeout: 8000 });
    await expect(authenticatedPage.getByTestId("plant-detail-plant-it")).toBeVisible();
    await expect(authenticatedPage.getByTestId("plant-detail-sow-seeds")).toBeVisible();
    await expect(authenticatedPage.getByTestId("plant-detail-save-later")).toBeVisible();

    await shed.bulkDetailClose.click();
    await expect(shed.bulkDetailModal).toHaveCount(0);
  });
});
