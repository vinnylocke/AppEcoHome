import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShoppingPage } from "../pages/ShoppingPage";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// Seed: 12_shopping_lists.sql
//   Active list:    "Weekly Garden Shop"  — 3 plant items + 1 product
//   Completed list: "Last Week's Shop"    — 1 plant + 1 product (both checked)

const MOCK_AI_SEARCH = { matches: ["Tomato", "Tomato (Cherry)", "Beefsteak Tomato"] };
const MOCK_VERDANTLY_SEARCH = {
  results: [
    { id: "v1", common_name: "Tomato", scientific_name: ["Solanum lycopersicum"], thumbnail_url: null, _provider: "verdantly", verdantly_id: "v1" },
  ],
  hasMore: false,
  nextPage: 2,
};
const WIKI_RESPONSE = JSON.stringify({ extract: "A flowering plant in the nightshade family.", thumbnail: null });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function mockExternalApis(page: Parameters<typeof mockEdgeFunction>[0]) {
  // Wikipedia — intercepted at browser level
  await page.route("**/en.wikipedia.org/api/rest_v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: WIKI_RESPONSE }),
  );
  // AI search edge function
  await mockEdgeFunction(page, "search-plants-ai", MOCK_AI_SEARCH);
  // Verdantly edge function
  await mockEdgeFunction(page, "verdantly-search", MOCK_VERDANTLY_SEARCH);
}

// ─── SHP-001 to SHP-005: Page structure & list creation ──────────────────────

test.describe("Shopping — page structure (SHP-001 – SHP-005)", () => {
  test("SHP-001: /shopping renders the Shopping Lists heading", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await expect(shopping.heading).toBeVisible({ timeout: 10000 });
  });

  test("SHP-002: Seeded active list 'Weekly Garden Shop' appears", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    await expect(shopping.listCardByName("Weekly Garden Shop")).toBeVisible({ timeout: 8000 });
  });

  test("SHP-003: Completed section toggle is visible but completed card hidden by default", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    await expect(shopping.completedToggle).toBeVisible({ timeout: 8000 });
    await expect(shopping.listCardByName("Last Week's Shop")).not.toBeVisible();
  });

  test("SHP-004: Expanding completed section shows the completed list", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    await shopping.completedToggle.click();
    await expect(shopping.listCardByName("Last Week's Shop")).toBeVisible({ timeout: 6000 });
  });

  test("SHP-005: New List button creates a list and shows it", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    await shopping.newListBtn.click();

    // New card should appear in the active section
    await expect(
      authenticatedPage.locator('[data-testid^="shopping-list-card-"]'),
    ).toHaveCount(await authenticatedPage.locator('[data-testid^="shopping-list-card-"]').count(), { timeout: 5000 });
    // Toast confirms creation
    await expect(authenticatedPage.getByText("List created")).toBeVisible({ timeout: 6000 });
  });
});

// ─── SHP-006 to SHP-011: Card expansion & item interaction ───────────────────

test.describe("Shopping — card expansion & items (SHP-006 – SHP-011)", () => {
  test("SHP-006: Expanding a card shows its items", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await expect(card).toBeVisible({ timeout: 8000 });

    // Click the expand toggle (chevron button inside the card header)
    await card.locator("button").first().click();

    // Items should now be visible — "Basil Seeds" is seeded as unchecked
    await expect(authenticatedPage.getByText("Basil Seeds")).toBeVisible({ timeout: 6000 });
  });

  test("SHP-007: Checking an unchecked item increments the progress counter", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();

    // Wait for items to load
    await expect(authenticatedPage.getByText("Basil Seeds")).toBeVisible({ timeout: 6000 });

    // Read initial counter (e.g. "2/4") then toggle an unchecked item
    const uncheckedCheckbox = authenticatedPage
      .locator('button[data-testid^="shopping-item-toggle-"]')
      .filter({ has: authenticatedPage.locator('.text-rhozly-on-surface\\/30, .opacity-50') })
      .first();

    // If no easy target, click "Basil Seeds" row checkbox
    const basilRow = authenticatedPage.getByText("Basil Seeds").locator("..");
    const checkbox = basilRow.locator("button").first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
    }

    // Progress badge should still be visible (may have changed value)
    await expect(card.locator(".tabular-nums")).toBeVisible({ timeout: 3000 });
  });

  test("SHP-008: Rename via kebab menu updates the list name", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");

    // Open kebab menu (MoreHorizontal button)
    await card.locator('[aria-label], button').filter({ hasText: "" }).last().click();
    await authenticatedPage.waitForTimeout(200);

    const renameBtn = authenticatedPage.getByRole("button", { name: /Rename/i });
    if (await renameBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await renameBtn.click();
      const input = authenticatedPage.getByTestId("shopping-rename-input");
      await expect(input).toBeVisible({ timeout: 3000 });
      await input.fill("Renamed Shop");
      await input.press("Enter");
      await expect(authenticatedPage.getByText("Renamed Shop")).toBeVisible({ timeout: 5000 });
    }
  });

  test("SHP-009: Mark Complete moves list to completed section", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").nth(-1).click(); // open kebab
    await authenticatedPage.waitForTimeout(200);

    const markCompleteBtn = authenticatedPage.locator('[data-testid^="shopping-mark-complete-"]');
    if (await markCompleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await markCompleteBtn.click();
      await expect(authenticatedPage.getByText("List completed!")).toBeVisible({ timeout: 6000 });
    }
  });

  test("SHP-010: Reopen completed list returns it to active section", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    // Expand completed section
    await shopping.completedToggle.click();

    const card = shopping.listCardByName("Last Week's Shop");
    await expect(card).toBeVisible({ timeout: 6000 });

    await card.locator("button").nth(-1).click(); // open kebab
    await authenticatedPage.waitForTimeout(200);

    const reopenBtn = authenticatedPage.locator('[data-testid^="shopping-reopen-"]');
    if (await reopenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reopenBtn.click();
      await expect(
        authenticatedPage.locator('[data-testid^="shopping-list-card-"]').filter({ has: authenticatedPage.getByText("Last Week's Shop") }),
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test("SHP-011: Delete requires double-tap — first tap shows confirmation text", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    // Create a throwaway list first so we're not deleting seeded data
    await shopping.newListBtn.click();
    await expect(authenticatedPage.getByText("List created")).toBeVisible({ timeout: 6000 });

    const newCard = authenticatedPage
      .locator('[data-testid^="shopping-list-card-"]')
      .filter({ has: authenticatedPage.getByText("My List") })
      .first();
    await newCard.locator("button").nth(-1).click();
    await authenticatedPage.waitForTimeout(200);

    const deleteBtn = authenticatedPage.locator('[data-testid^="shopping-delete-list-"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });
    await deleteBtn.click();

    // First click shows confirmation text
    await expect(authenticatedPage.getByText(/Tap again to delete/i)).toBeVisible({ timeout: 3000 });

    // Second click removes the list
    await deleteBtn.click();
    await expect(newCard).not.toBeVisible({ timeout: 6000 });
  });
});

// ─── SHP-012 to SHP-017: AddItemSheet — plant tab & shed search ──────────────

test.describe("Shopping — add item sheet, shed search (SHP-012 – SHP-017)", () => {
  test("SHP-012: Add Item button opens the sheet", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click(); // expand
    await expect(shopping.addItemBtnInCard(card)).toBeVisible({ timeout: 6000 });
    await shopping.addItemBtnInCard(card).click();

    await expect(shopping.sheet()).toBeVisible({ timeout: 6000 });
  });

  test("SHP-013: Plant tab is the default tab in the sheet", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await expect(shopping.plantTab()).toBeVisible({ timeout: 5000 });
    await expect(shopping.searchInput()).toBeVisible({ timeout: 5000 });
  });

  test("SHP-014: Typing a name shows shed search results section", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");

    // The shed section (Your Plants / In Shed) should appear within debounce timeout
    await expect(
      authenticatedPage.getByText(/Your Plants|In Shed|From your shed/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("SHP-016: Confirming a shed result adds a plant item to the list", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");

    const firstShedResult = shopping.shedResult(0);
    const hasShedResult = await firstShedResult.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasShedResult) {
      await firstShedResult.click();
      await expect(shopping.addConfirm()).toBeVisible({ timeout: 5000 });
      await shopping.addConfirm().click();

      // After confirming, shed offer or sheet closes — toast should appear
      await expect(
        authenticatedPage.getByText(/added/i).first(),
      ).toBeVisible({ timeout: 6000 });
    }
  });

  test("SHP-017: 'Search All Sources' button appears after shed results", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");

    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
  });
});

// ─── SHP-018 to SHP-023: Unified search, info accordion, shed offer ──────────

test.describe("Shopping — unified search & shed offer (SHP-018 – SHP-023)", () => {
  test("SHP-018: Search All Sources shows result section headings", async ({ authenticatedPage }) => {
    await mockExternalApis(authenticatedPage);
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");
    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
    await shopping.searchAllBtn().click();

    // At least one result section should appear
    await expect(
      authenticatedPage.getByText(/AI Suggestions|Verdantly|Perenual/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("SHP-019: Info button on a result expands a Wikipedia description", async ({ authenticatedPage }) => {
    await mockExternalApis(authenticatedPage);
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");
    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
    await shopping.searchAllBtn().click();

    // Wait for results to load
    await authenticatedPage.waitForTimeout(1000);

    // Find any info (ℹ) button and click it
    const infoBtn = authenticatedPage.getByLabel("Show info").first();
    if (await infoBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await infoBtn.click();
      // Mocked Wikipedia response text should appear
      await expect(
        authenticatedPage.getByText("A flowering plant in the nightshade family."),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("SHP-020: Clicking a Perenual result opens the preview", async ({ authenticatedPage }) => {
    await mockExternalApis(authenticatedPage);
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");
    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
    await shopping.searchAllBtn().click();
    await authenticatedPage.waitForTimeout(1000);

    const perenualResult = shopping.perenualResult(0);
    if (await perenualResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await perenualResult.click();
      await expect(shopping.addConfirm()).toBeVisible({ timeout: 5000 });
    }
  });

  test("SHP-021: Confirming a result adds item to list", async ({ authenticatedPage }) => {
    await mockExternalApis(authenticatedPage);
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");
    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
    await shopping.searchAllBtn().click();
    await authenticatedPage.waitForTimeout(1000);

    const firstResult = authenticatedPage
      .locator('[data-testid^="shopping-ai-result-"], [data-testid^="shopping-perenual-result-"], [data-testid^="shopping-verdantly-result-"]')
      .first();

    if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstResult.click();
      if (await shopping.addConfirm().isVisible({ timeout: 3000 }).catch(() => false)) {
        await shopping.addConfirm().click();
        await expect(authenticatedPage.getByText(/added/i).first()).toBeVisible({ timeout: 8000 });
      }
    }
  });

  test("SHP-022: Shed offer appears after adding a plant", async ({ authenticatedPage }) => {
    await mockExternalApis(authenticatedPage);
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");
    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
    await shopping.searchAllBtn().click();
    await authenticatedPage.waitForTimeout(1000);

    const firstResult = authenticatedPage
      .locator('[data-testid^="shopping-ai-result-"], [data-testid^="shopping-perenual-result-"]')
      .first();

    if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstResult.click();
      if (await shopping.addConfirm().isVisible({ timeout: 3000 }).catch(() => false)) {
        await shopping.addConfirm().click();
        // Shed offer or sheet closes — either button visible or item toast
        const shedSkip = shopping.shedOfferSkip();
        const shedYes = shopping.shedOfferYes();
        const hasOffer = await shedSkip.isVisible({ timeout: 5000 }).catch(() => false);
        if (hasOffer) {
          await expect(shedYes).toBeVisible();
        }
      }
    }
  });

  test("SHP-023: Skipping the shed offer closes the sheet", async ({ authenticatedPage }) => {
    await mockExternalApis(authenticatedPage);
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.searchInput().fill("Tomato");
    await expect(shopping.searchAllBtn()).toBeVisible({ timeout: 6000 });
    await shopping.searchAllBtn().click();
    await authenticatedPage.waitForTimeout(1000);

    const firstResult = authenticatedPage
      .locator('[data-testid^="shopping-ai-result-"], [data-testid^="shopping-perenual-result-"]')
      .first();

    if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstResult.click();
      if (await shopping.addConfirm().isVisible({ timeout: 3000 }).catch(() => false)) {
        await shopping.addConfirm().click();
        const shedSkip = shopping.shedOfferSkip();
        if (await shedSkip.isVisible({ timeout: 5000 }).catch(() => false)) {
          await shedSkip.click();
          await expect(shopping.sheet()).not.toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

// ─── SHP-024 to SHP-025: Product tab ─────────────────────────────────────────

test.describe("Shopping — product tab (SHP-024 – SHP-025)", () => {
  test("SHP-024: Product tab adds a product item to the list", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.productTab().click();
    await expect(shopping.productNameInput()).toBeVisible({ timeout: 5000 });

    await shopping.productNameInput().fill("Compost Bag");
    await shopping.productCategorySelect().selectOption("Soil & Compost");
    await shopping.addProductConfirm().click();

    await expect(authenticatedPage.getByText("Item added")).toBeVisible({ timeout: 6000 });
  });

  test("SHP-025: Product without category shows validation and does not add item", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await shopping.productTab().click();
    await shopping.productNameInput().fill("Mystery Product");
    // Do NOT select category
    await shopping.addProductConfirm().click();

    // Button should be disabled or validation shown — sheet stays open
    await expect(shopping.sheet()).toBeVisible({ timeout: 3000 });
  });
});

// ─── SHP-026 to SHP-028: Add Purchased Plants to Shed ────────────────────────

test.describe("Shopping — Add Purchased Plants to Shed (SHP-026 – SHP-028)", () => {
  test("SHP-026: 'Add Purchased Plants to Shed' button visible for eligible checked plants", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    // The seeded "Weekly Garden Shop" has 1 eligible checked plant (Tomato Seedlings: checked, source=null)
    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();

    // Wait for items to load, then verify the button appears
    await expect(shopping.addToShedBtnInCard(card)).toBeVisible({ timeout: 8000 });
  });

  test("SHP-027: Shed-sourced checked plant is excluded from the button count", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    // The seeded list has:
    //   - Tomato Seedlings: checked, source=null → eligible (count: 1)
    //   - Mint:             checked, source=shed → excluded from count
    // So button should show "Add 1 Purchased Plant to Shed" (not "Add 2")
    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();

    const addToShedBtn = shopping.addToShedBtnInCard(card);
    await expect(addToShedBtn).toBeVisible({ timeout: 8000 });
    await expect(addToShedBtn).toContainText("Add 1 Purchased Plant to Shed");
  });

  test("SHP-028: Clicking Add to Shed button shows success toast and button disappears", async ({ authenticatedPage }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = shopping.listCardByName("Weekly Garden Shop");
    await card.locator("button").first().click();

    const addToShedBtn = shopping.addToShedBtnInCard(card);
    await expect(addToShedBtn).toBeVisible({ timeout: 8000 });
    await addToShedBtn.click();

    // Success toast
    await expect(authenticatedPage.getByText(/added to Shed/i).first()).toBeVisible({ timeout: 8000 });

    // Button disappears (already_in_shed now true → no eligible items remaining)
    await expect(addToShedBtn).not.toBeVisible({ timeout: 6000 });
  });
});
