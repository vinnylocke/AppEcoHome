import type { Page, Locator } from "@playwright/test";

export class InstanceStatsTabPage {
  readonly page: Page;

  readonly tab: Locator;

  readonly plantInfoSection: Locator;
  readonly yieldSection: Locator;
  readonly yieldCount: Locator;
  readonly yieldLastDate: Locator;
  readonly yieldTotal: Locator;
  readonly pruneSection: Locator;
  readonly pruneCount: Locator;
  readonly pruneLastDate: Locator;
  readonly tasksSection: Locator;
  readonly taskTotal: Locator;
  readonly taskPending: Locator;
  readonly taskCompleted: Locator;
  readonly issuesSection: Locator;
  readonly issuesNone: Locator;
  readonly issueItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tab = page.getByTestId("instance-modal-tab-stats");

    this.plantInfoSection = page.getByTestId("stats-plant-info");
    this.yieldSection = page.getByTestId("stats-yield-section");
    this.yieldCount = page.getByTestId("stats-yield-count");
    this.yieldLastDate = page.getByTestId("stats-yield-last-date");
    this.yieldTotal = page.getByTestId("stats-yield-total");
    this.pruneSection = page.getByTestId("stats-prune-section");
    this.pruneCount = page.getByTestId("stats-prune-count");
    this.pruneLastDate = page.getByTestId("stats-prune-last-date");
    this.tasksSection = page.getByTestId("stats-tasks-section");
    this.taskTotal = page.getByTestId("stats-task-total");
    this.taskPending = page.getByTestId("stats-task-pending");
    this.taskCompleted = page.getByTestId("stats-task-completed");
    this.issuesSection = page.getByTestId("stats-issues-section");
    this.issuesNone = page.getByTestId("stats-issues-none");
    this.issueItems = page.getByTestId("stats-issue-item");
  }
}
