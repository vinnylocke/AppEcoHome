import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/InstanceEditModal.tsx` — the 10-tab modal
 * for a single `inventory_items` row. Opened from PlantEditModal's Instances
 * tab via a `plant-instance-row-open-{id}` button.
 */
export class InstanceEditPage {
  readonly page: Page;

  // Tabs
  readonly tabDetails: Locator;
  readonly tabCareGuide: Locator;
  readonly tabRoutine: Locator;
  readonly tabJournal: Locator;
  readonly tabPhotos: Locator;
  readonly tabGrowGuide: Locator;
  readonly tabGuides: Locator;
  readonly tabYield: Locator;
  readonly tabLight: Locator;
  readonly tabStats: Locator;
  readonly tabCompanions: Locator;

  // Journal tab content
  readonly journalRoot: Locator;
  readonly journalNewEntryBtn: Locator;
  readonly journalSubjectInput: Locator;
  readonly journalDescriptionInput: Locator;
  readonly journalSaveBtn: Locator;

  // Routine tab content
  readonly routineList: Locator;

  // Yield tab content
  readonly yieldValueInput: Locator;
  readonly yieldUnitSelect: Locator;
  readonly yieldLogButton: Locator;
  readonly yieldHistoryList: Locator;
  readonly yieldEmptyHistory: Locator;

  constructor(page: Page) {
    this.page = page;

    this.tabDetails = page.locator('[data-testid="instance-modal-tab-details"]');
    this.tabCareGuide = page.locator('[data-testid="instance-modal-tab-care-guide"]');
    this.tabRoutine = page.locator('[data-testid="instance-modal-tab-routine"]');
    this.tabJournal = page.locator('[data-testid="instance-modal-tab-journal"]');
    this.tabPhotos = page.locator('[data-testid="instance-modal-tab-photos"]');
    this.tabGrowGuide = page.locator('[data-testid="instance-modal-tab-grow-guide"]');
    this.tabGuides = page.locator('[data-testid="instance-modal-tab-guides"]');
    this.tabYield = page.locator('[data-testid="instance-modal-tab-yield"]');
    this.tabLight = page.locator('[data-testid="instance-modal-tab-light"]');
    this.tabStats = page.locator('[data-testid="instance-modal-tab-stats"]');
    this.tabCompanions = page.locator('[data-testid="instance-modal-tab-companions"]');

    this.journalRoot = page.locator('[data-testid="plant-journal-tab"]');
    this.journalNewEntryBtn = page.locator('[data-testid="plant-journal-new-entry"]');
    this.journalSubjectInput = page.locator('[data-testid="plant-journal-subject-input"]');
    this.journalDescriptionInput = page.locator('[data-testid="plant-journal-description-input"]');
    this.journalSaveBtn = page.locator('[data-testid="plant-journal-save-entry"]');

    this.routineList = page.locator('[data-testid="instance-care-routine-list"]');

    this.yieldValueInput = page.locator('[data-testid="yield-value-input"]');
    this.yieldUnitSelect = page.locator('[data-testid="yield-unit-select"]');
    this.yieldLogButton = page.locator('[data-testid="yield-log-button"]');
    this.yieldHistoryList = page.locator('[data-testid="yield-history-list"]');
    this.yieldEmptyHistory = page.locator('[data-testid="yield-empty-history"]');
  }

  /** A single journal entry locator by its DB id. */
  journalEntry(entryId: string): Locator {
    return this.page.locator(`[data-testid="plant-journal-entry-${entryId}"]`);
  }

  /** Any journal entry — use when the DB id isn't known up front. */
  anyJournalEntry(): Locator {
    return this.page.locator('[data-testid^="plant-journal-entry-"]').first();
  }

  /** A specific yield record row by its DB id. */
  yieldRecord(recordId: string): Locator {
    return this.page.locator(`[data-testid="yield-record-${recordId}"]`);
  }

  /** First yield record row — use when the DB id isn't known up front. */
  anyYieldRecord(): Locator {
    return this.page.locator('[data-testid^="yield-record-"]').first();
  }

  /** Routine row by blueprint id. */
  routineRow(blueprintId: string): Locator {
    return this.page.locator(`[data-testid="instance-care-routine-row-${blueprintId}"]`);
  }

  /** First routine row. */
  anyRoutineRow(): Locator {
    return this.page.locator('[data-testid^="instance-care-routine-row-"]').first();
  }
}
