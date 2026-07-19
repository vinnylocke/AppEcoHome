import type { Page, Locator } from "@playwright/test";

export class PlannerPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly newPlanButton: Locator;
  readonly pendingTab: Locator;
  readonly completedTab: Locator;
  readonly archivedTab: Locator;
  readonly emptyState: Locator;

  // Staging view
  readonly stagingBackButton: Locator;

  // Confirm dialog
  readonly confirmButton: Locator;
  readonly deleteConfirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /Planner/i });
    this.newPlanButton = page.getByRole("button", { name: /New Plan/i });
    // Tab labels read "Active (N)", "Completed (N)", "Archived (N)" in
    // the live UI (the underlying state value for Active is still
    // "Pending"). Match the user-visible label.
    this.pendingTab = page.getByRole("tab", { name: /Active/i });
    this.completedTab = page.getByRole("tab", { name: /Completed/i });
    this.archivedTab = page.getByRole("tab", { name: /Archived/i });
    this.emptyState = page.getByText(/New Plan.*let the AI design|no plans/i).first();
    // Filter by text content (not ARIA name) to avoid SVG icon interference
    this.stagingBackButton = page.locator("button").filter({ hasText: /^Plans$/ }).first();
    this.confirmButton = page.getByRole("button", { name: "Confirm" });
    // exact: the substring "Delete" also matched cards' Sun-tracker buttons
    // ("Open <plan name> in Sun Tracker") when a plan name contained "Delete".
    this.deleteConfirmButton = page.getByRole("button", { name: "Delete", exact: true });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
  }

  /** Plan card h3 element — click to open staging view. */
  planCard(name: string): Locator {
    return this.page.locator("h3").filter({ hasText: name }).first();
  }

  /** Options menu button — returns the first visible menu button (scope by navigating to the right tab first). */
  planMenuButton(): Locator {
    return this.page.locator('[aria-label="Plan options"]').first();
  }

  /** A menu action item (e.g. "Archive Plan", "Delete Plan", "Restore Plan"). */
  planOption(action: string): Locator {
    return this.page.getByRole("button", { name: new RegExp(action, "i") }).first();
  }

  async goto() {
    await this.page.goto("/planner");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }
}
