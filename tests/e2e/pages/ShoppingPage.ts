import type { Page, Locator } from "@playwright/test";

export class ShoppingPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newListBtn: Locator;
  readonly completedToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText("Shopping Lists", { exact: true });
    this.newListBtn = page.getByTestId("shopping-new-list-btn");
    this.completedToggle = page.getByTestId("shopping-completed-section-toggle");
  }

  async goto() {
    await this.page.goto("/shopping");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
    await this.heading.waitFor({ state: "visible", timeout: 10000 });
  }

  // Find a list card by its display name (uses card container scoped to name text)
  listCardByName(name: string): Locator {
    return this.page
      .locator('[data-testid^="shopping-list-card-"]')
      .filter({ has: this.page.getByText(name) });
  }

  listCard(id: string) { return this.page.getByTestId(`shopping-list-card-${id}`); }
  listName(id: string) { return this.page.getByTestId(`shopping-list-name-${id}`); }
  markCompleteBtn(id: string) { return this.page.getByTestId(`shopping-mark-complete-${id}`); }
  deleteListBtn(id: string) { return this.page.getByTestId(`shopping-delete-list-${id}`); }
  reopenBtn(id: string) { return this.page.getByTestId(`shopping-reopen-${id}`); }
  addItemBtn(id: string) { return this.page.getByTestId(`shopping-add-item-btn-${id}`); }
  addToShedBtn(id: string) { return this.page.getByTestId(`shopping-add-to-shed-btn-${id}`); }

  // Generic scoped helpers — useful when list ID isn't known
  addItemBtnInCard(card: Locator) { return card.locator('[data-testid^="shopping-add-item-btn-"]'); }
  addToShedBtnInCard(card: Locator) { return card.locator('[data-testid^="shopping-add-to-shed-btn-"]'); }
  markCompleteBtnInCard(card: Locator) { return card.locator('[data-testid^="shopping-mark-complete-"]'); }
  deleteBtnInCard(card: Locator) { return card.locator('[data-testid^="shopping-delete-list-"]'); }

  // AddItemSheet locators
  sheet() { return this.page.getByTestId("shopping-add-item-sheet"); }
  plantTab() { return this.page.getByTestId("shopping-tab-plant"); }
  productTab() { return this.page.getByTestId("shopping-tab-product"); }
  // AddItemSheet plant tab now uses the shared <PlantSearch> component.
  searchInput() { return this.page.getByTestId("plant-search-input"); }
  searchAllBtn() { return this.page.getByTestId("plant-search-external"); }
  createWithAiBtn() { return this.page.getByTestId("plant-search-create-ai"); }
  manualAddBtn() { return this.page.getByTestId("plant-search-manual"); }
  suggestions() { return this.page.getByTestId("plant-search-suggestions"); }
  /** Any library result row. Selecting a result adds it directly (no separate confirm). */
  anyResult() { return this.page.locator('[data-testid^="plant-search-result-"]').first(); }
  libraryResult(id: number) { return this.page.getByTestId(`plant-search-result-library-${id}`); }
  shedOfferSkip() { return this.page.getByTestId("shopping-add-to-shed-skip"); }
  shedOfferYes() { return this.page.getByTestId("shopping-add-to-shed-yes"); }
  productNameInput() { return this.page.getByTestId("shopping-product-name-input"); }
  productCategorySelect() { return this.page.getByTestId("shopping-product-category-select"); }
  addProductConfirm() { return this.page.getByTestId("shopping-add-product-confirm"); }
}
