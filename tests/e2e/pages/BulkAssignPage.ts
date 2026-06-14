import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/BulkAssignModal.tsx`. Opens from the
 * Shed's bulk-action bar when ≥1 plant is selected and Assign is clicked.
 */
export class BulkAssignPage {
  readonly page: Page;

  readonly root: Locator;
  readonly locationSelect: Locator;
  readonly areaSelect: Locator;
  readonly noAreaButton: Locator;
  readonly plantedToggle: Locator;
  readonly smartSchedulesToggle: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator('[data-testid="bulk-assign-modal"]');
    this.locationSelect = page.locator('[data-testid="bulk-assign-location"]');
    this.areaSelect = page.locator('[data-testid="bulk-assign-area"]');
    this.noAreaButton = page.locator('[data-testid="bulk-assign-no-area"]');
    this.plantedToggle = page.locator('[data-testid="bulk-assign-planted"]');
    this.smartSchedulesToggle = page.locator(
      '[data-testid="bulk-assign-smart-schedules"]',
    );
    this.confirmButton = page.locator('[data-testid="bulk-assign-confirm"]');
  }

  /** Per-plant quantity input inside the modal. */
  qtyFor(plantId: string | number): Locator {
    return this.page.locator(`[data-testid="bulk-assign-qty-${plantId}"]`);
  }
}
