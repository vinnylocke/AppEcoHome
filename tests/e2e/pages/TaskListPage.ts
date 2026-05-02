import type { Page, Locator } from "@playwright/test";

export class TaskListPage {
  readonly page: Page;

  readonly pendingTab: Locator;
  readonly completedTab: Locator;
  readonly emptyState: Locator;
  readonly bulkEditButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pendingTab = page.getByRole("button", { name: /Pending/ });
    this.completedTab = page.getByRole("button", { name: /Completed/ });
    this.emptyState = page.getByText("No tasks!");
    this.bulkEditButton = page.getByRole("button", { name: /Bulk Edit/i });
  }

  taskCheckbox(taskTitle: string): Locator {
    const escaped = taskTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("button", {
      name: new RegExp(`Mark task "${escaped}" as`),
    });
  }

  taskCard(taskTitle: string): Locator {
    const escaped = taskTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("button", {
      name: new RegExp(`View task: ${escaped}`),
    });
  }

  /** The postpone button for a specific task (aria-label: "Postpone task: {title}"). */
  postponeButton(taskTitle: string): Locator {
    return this.page.getByLabel(`Postpone task: ${taskTitle}`);
  }

  /** The delete/remove button for a specific task (aria-label: "Remove task: {title}"). */
  deleteButton(taskTitle: string): Locator {
    return this.page.getByLabel(`Remove task: ${taskTitle}`);
  }

  /**
   * The task row container for a given title — useful for asserting overdue styling.
   * Overdue tasks (Pending, due < today) get bg-red-100 border-red-300 on their card.
   */
  overdueCard(taskTitle: string): Locator {
    return this.page.locator(".bg-red-100").filter({ hasText: taskTitle });
  }

  /**
   * A type badge span for a specific task type.
   * Task badges use `uppercase` CSS class; DOM text is the type string (e.g. "Watering").
   */
  typeBadge(type: string): Locator {
    return this.page.locator("span.uppercase").filter({ hasText: type }).first();
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }
}
