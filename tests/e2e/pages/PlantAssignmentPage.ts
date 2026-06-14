import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/PlantAssignmentModal.tsx`. Two-step wizard:
 *   Step 1 — Location → Area → Quantity → Next  (or "Add to garden" CTA)
 *   Step 2 — Planted/Unplanted + state/date/propagation + Confirm
 */
export class PlantAssignmentPage {
  readonly page: Page;

  // Step 1
  readonly locationSelect: Locator;
  readonly areaSelect: Locator;
  readonly quantityValue: Locator;
  readonly quantityDecrement: Locator;
  readonly quantityIncrement: Locator;
  readonly nextButton: Locator;
  readonly addToGardenButton: Locator;

  // Step 2
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.locationSelect = page.locator('[data-testid="plant-assign-location"]');
    this.areaSelect = page.locator('[data-testid="plant-assign-area"]');
    this.quantityValue = page.locator('[data-testid="plant-assign-quantity-value"]');
    this.quantityDecrement = page.locator(
      '[data-testid="plant-assign-quantity-decrement"]',
    );
    this.quantityIncrement = page.locator(
      '[data-testid="plant-assign-quantity-increment"]',
    );
    this.nextButton = page.locator('[data-testid="plant-assign-next"]');
    this.addToGardenButton = page.locator(
      '[data-testid="plant-assignment-add-to-garden"]',
    );

    this.confirmButton = page.locator('[data-testid="plant-assign-confirm"]');
  }

  async currentQuantity(): Promise<number> {
    const text = (await this.quantityValue.innerText()).trim();
    return parseInt(text, 10);
  }
}
