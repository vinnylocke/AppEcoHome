import type { Page, Locator } from "@playwright/test";

export class LightTabPage {
  readonly page: Page;

  // Tab button on instance modal
  readonly tab: Locator;
  // Tab button on plant modal (TheShed) — uses plant-modal-tab-light
  readonly plantModalTab: Locator;

  // LightTab content
  readonly optimalRangeCard: Locator;
  readonly noDataCard: Locator;
  readonly getReadingButton: Locator;

  // PlantLightReader overlay
  readonly fitnessBadge: Locator;
  readonly luxDisplay: Locator;
  readonly categoryLabel: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tab = page.getByTestId("instance-modal-tab-light");
    this.plantModalTab = page.getByTestId("plant-modal-tab-light");
    this.optimalRangeCard = page.getByTestId("light-tab-optimal-range");
    this.noDataCard = page.getByTestId("light-tab-no-data");
    this.getReadingButton = page.getByTestId("light-tab-get-reading-button");
    this.fitnessBadge = page.getByTestId("plant-light-reader-fitness-badge");
    this.luxDisplay = page.getByTestId("plant-light-reader-lux");
    this.categoryLabel = page.getByTestId("plant-light-reader-category");
    this.backButton = page.getByTestId("plant-light-reader-back");
  }
}
