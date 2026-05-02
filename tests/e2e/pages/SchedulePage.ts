import type { Page, Locator } from "@playwright/test";

export class SchedulePage {
  readonly page: Page;

  readonly heading: Locator;
  readonly newAutomationButton: Locator;
  readonly filtersButton: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly createFirstButton: Locator;
  readonly noMatchState: Locator;
  readonly filterDrawerHeading: Locator;
  readonly clearAllFiltersButton: Locator;

  // AddTaskModal locators (visible when creating/editing)
  readonly modalHeading: Locator;
  readonly titleInput: Locator;
  readonly saveButton: Locator;
  readonly taskTypeSelect: Locator;
  readonly titleError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /Automations/i });
    this.newAutomationButton = page.getByRole("button", { name: /New Automation/i });
    this.filtersButton = page.getByRole("button", { name: /Filters/i });
    this.searchInput = page.getByPlaceholder("Search automations...");
    this.emptyState = page.getByText("No Automations Running");
    this.createFirstButton = page.getByRole("button", { name: /Create Your First Automation/i });
    this.noMatchState = page.getByText("No matches found");
    this.filterDrawerHeading = page.getByText("Advanced Filters");
    this.clearAllFiltersButton = page.getByRole("button", { name: /Clear All/i });

    this.modalHeading = page.getByRole("heading", { name: /New Automation|Edit Automation/i });
    this.titleInput = page.getByPlaceholder("Task Name *");
    this.saveButton = page.getByRole("button", { name: /^Save$/i });
    this.taskTypeSelect = page.locator("select").first();
    this.titleError = page.getByText("Task name is required.");
  }

  async goto() {
    await this.page.goto("/schedule");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  blueprintCard(title: string): Locator {
    // Cards are clickable divs containing an h3 with the blueprint title
    return this.page.locator("h3").filter({ hasText: title });
  }

  deleteButtonFor(title: string): Locator {
    return this.page.getByLabel(`Delete ${title}`);
  }

  frequencyBadge(days: number): Locator {
    return this.page.getByText(`Every ${days} Days`).first();
  }
}
