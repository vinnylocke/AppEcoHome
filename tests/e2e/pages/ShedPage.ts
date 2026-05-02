import type { Page, Locator } from "@playwright/test";

export class ShedPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly noMatchState: Locator;
  readonly activeTab: Locator;
  readonly archivedTab: Locator;
  readonly addButton: Locator;
  readonly clearSearchButton: Locator;
  readonly sourceFilterSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "The Shed" });
    this.searchInput = page.getByLabel("Search your plant library");
    this.emptyState = page.getByText("No plants here");
    this.noMatchState = page.getByText("No matches found");
    this.activeTab = page.getByRole("button", { name: "Active" });
    this.archivedTab = page.getByRole("button", { name: "Archived" });
    this.addButton = page.getByLabel("Add plant");
    this.clearSearchButton = page.getByLabel("Clear search");
    this.sourceFilterSelect = page.getByLabel("Filter by source");
  }

  async goto() {
    await this.page.goto("/shed");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  plantCard(name: string): Locator {
    return this.page.locator("[data-plant-card]").filter({ hasText: name });
  }

  archiveButtonFor(name: string): Locator {
    return this.page.getByLabel(`Archive ${name}`);
  }

  restoreButtonFor(name: string): Locator {
    return this.page.getByLabel(`Restore ${name}`);
  }

  deleteButtonFor(name: string): Locator {
    return this.page.getByLabel(`Delete ${name}`);
  }

  assignButtonFor(name: string): Locator {
    return this.plantCard(name).getByRole("button", { name: "Assign", exact: true });
  }
}
