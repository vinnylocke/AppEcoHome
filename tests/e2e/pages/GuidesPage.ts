import type { Page, Locator } from "@playwright/test";

export class GuidesPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly tagFilterButton: Locator;
  readonly backToLibraryButton: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Rhozly Guides" });
    this.searchInput = page.getByPlaceholder("Search guides...");
    this.tagFilterButton = page.locator('[aria-expanded]').first();
    this.backToLibraryButton = page.getByRole("button", { name: /Back to Library/i });
    this.loadingState = page.getByText("Loading Library...");
    this.emptyState = page.getByText(/adjusting your search|no guides/i);
  }

  async goto() {
    await this.page.goto("/guides");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  /** Guide card h3 element — click to open the guide detail view. */
  guideCard(title: string): Locator {
    return this.page.locator("h3").filter({ hasText: title }).first();
  }

  /** A tag/label chip in the filter dropdown. */
  tagOption(label: string): Locator {
    return this.page.getByRole("option", { name: new RegExp(label, "i") }).first();
  }
}
