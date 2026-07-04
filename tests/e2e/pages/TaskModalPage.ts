import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/TaskModal.tsx`. Hosts both the legacy
 * footer (Complete / Postpone / Delete) and the Wave-20 HarvestWindow
 * footers (in-window 4-button grid + closed-window 2-button).
 */
export class TaskModalPage {
  readonly page: Page;

  readonly root: Locator;

  // Wave 20 — harvest window pills
  readonly windowOpenPill: Locator;
  readonly windowClosedPill: Locator;

  // Wave 20 — in-window 4-button footer
  readonly harvestedButton: Locator;
  readonly pickedSomeButton: Locator;
  readonly notYetButton: Locator;
  readonly checkAiButton: Locator;
  readonly runningTotal: Locator;
  readonly snoozePopover: Locator;
  readonly snooze3: Locator;
  readonly snooze5: Locator;
  readonly snooze7: Locator;

  // Wave 20 — closed-window footer
  readonly closedLogYieldButton: Locator;
  readonly closedMarkMissedButton: Locator;

  // Harvest yield sheet (final mode — shown on "Harvested" / "Log yield anyway")
  readonly yieldValueInput: Locator;
  readonly yieldCompleteButton: Locator;
  readonly yieldSkipButton: Locator;
  readonly yieldModeTotal: Locator;
  readonly yieldModePerPlant: Locator;
  readonly yieldPerPlantList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.locator('[data-testid="task-modal"]');

    this.windowOpenPill = page.locator('[data-testid="task-harvest-window-pill"]');
    this.windowClosedPill = page.locator('[data-testid="task-harvest-window-closed"]');

    this.harvestedButton = page.locator('[data-testid="harvest-action-harvested"]');
    this.pickedSomeButton = page.locator('[data-testid="harvest-action-picked-some"]');
    this.notYetButton = page.locator('[data-testid="harvest-action-not-yet"]');
    this.checkAiButton = page.locator('[data-testid="harvest-action-check-ai"]');
    this.runningTotal = page.locator('[data-testid="harvest-running-total"]');
    this.snoozePopover = page.locator('[data-testid="harvest-snooze-popover"]');
    this.snooze3 = page.locator('[data-testid="harvest-snooze-3"]');
    this.snooze5 = page.locator('[data-testid="harvest-snooze-5"]');
    this.snooze7 = page.locator('[data-testid="harvest-snooze-7"]');

    this.closedLogYieldButton = page.locator('[data-testid="harvest-closed-log-yield"]');
    this.closedMarkMissedButton = page.locator('[data-testid="harvest-closed-mark-missed"]');

    this.yieldValueInput = page.locator('[data-testid="harvest-partial-value"]');
    this.yieldCompleteButton = page.locator('[data-testid="harvest-yield-complete"]');
    this.yieldSkipButton = page.locator('[data-testid="harvest-yield-skip"]');
    this.yieldModeTotal = page.locator('[data-testid="harvest-yield-mode-total"]');
    this.yieldModePerPlant = page.locator('[data-testid="harvest-yield-mode-perplant"]');
    this.yieldPerPlantList = page.locator('[data-testid="harvest-yield-perplant-list"]');
  }
}
