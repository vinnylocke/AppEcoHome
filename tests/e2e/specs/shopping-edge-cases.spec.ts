import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShoppingPage } from "../pages/ShoppingPage";

// ─────────────────────────────────────────────────────────────────────────
// shopping-edge-cases.spec.ts
//
// Gaps left by the existing shopping.spec.ts (27 tests). Tightly scoped
// to render-time invariants for the completed section + add-to-shed
// surface, plus a sanity check on the Add Item sheet tabs.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Shopping — edge cases", () => {
  test("SHOP-E-001: Add Item sheet shows BOTH Plant and Product tabs", async ({
    authenticatedPage,
  }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = authenticatedPage
      .locator('[data-testid^="shopping-list-card-"]')
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });
    // Expand the active list to reveal the Add Item button.
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();

    await expect(shopping.sheet()).toBeVisible({ timeout: 8000 });
    await expect(shopping.plantTab()).toBeVisible();
    await expect(shopping.productTab()).toBeVisible();
  });

  test("SHOP-E-002: Product tab — product name input + category select + confirm button render", async ({
    authenticatedPage,
  }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    const card = authenticatedPage
      .locator('[data-testid^="shopping-list-card-"]')
      .first();
    await card.locator("button").first().click();
    await shopping.addItemBtnInCard(card).click();
    await expect(shopping.sheet()).toBeVisible();
    await shopping.productTab().click();

    await expect(shopping.productNameInput()).toBeVisible({ timeout: 5000 });
    await expect(shopping.productCategorySelect()).toBeVisible();
    await expect(shopping.addProductConfirm()).toBeVisible();
  });

  test("SHOP-E-003: completed section toggle is rendered (seed has ≥1 completed list)", async ({
    authenticatedPage,
  }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    // The toggle only renders when completedLists.length > 0 — its presence
    // confirms the seed's completed list is loaded.
    await expect(shopping.completedToggle).toBeVisible({ timeout: 10000 });
  });

  test("SHOP-E-004: Add-to-Shed button surfaces on a list with checked plant items (after expand)", async ({
    authenticatedPage,
  }) => {
    const shopping = new ShoppingPage(authenticatedPage);
    await shopping.goto();
    await shopping.waitForLoad();

    // The Add-to-Shed button lives inside the list's expanded body. Walk
    // through each visible card and expand it; the button will appear on
    // the list that has the seeded pre-checked plant items.
    const cards = authenticatedPage.locator('[data-testid^="shopping-list-card-"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await cards.nth(i).locator("button").first().click().catch(() => {});
    }

    const anyAddToShed = authenticatedPage
      .locator('[data-testid^="shopping-add-to-shed-btn-"]')
      .first();
    await expect(anyAddToShed).toBeVisible({ timeout: 10000 });
  });
});
