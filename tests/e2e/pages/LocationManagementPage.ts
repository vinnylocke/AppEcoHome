import type { Page, Locator } from "@playwright/test";

export class LocationManagementPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly newLocationButton: Locator;
  readonly createLocationForm: Locator;
  readonly locationNameInput: Locator;
  readonly saveLocationButton: Locator;
  readonly cancelLocationButton: Locator;

  // Advanced area settings modal
  readonly advancedSettingsModal: Locator;
  readonly phInput: Locator;
  readonly saveAreaMetricsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Location Management" });
    this.newLocationButton = page.getByRole("button", { name: /New Location/i });
    this.createLocationForm = page.getByText("Create New Location");
    this.locationNameInput = page.getByPlaceholder(/Location Name/i);
    this.saveLocationButton = page.getByRole("button", { name: /Save Location/i });
    this.cancelLocationButton = page.getByRole("button", { name: /Cancel/i });

    this.advancedSettingsModal = page.getByRole("heading", { name: "Area Metrics" });
    // The pH label is not associated via htmlFor — use placeholder instead
    this.phInput = page.getByPlaceholder("e.g. 6.5");
    this.saveAreaMetricsButton = page.getByRole("button", { name: /Save Area Metrics/i });
  }

  async goto() {
    await this.page.goto("/management");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  locationCard(name: string): Locator {
    return this.page.locator("input").filter({ hasValue: name }).locator("..");
  }

  addAreaButton(locationName: string): Locator {
    return this.page.getByRole("button", { name: /Add Area/i }).first();
  }

  advancedSettingsButton(): Locator {
    return this.page.getByTitle("Advanced Metrics").first();
  }

  deleteAreaButton(): Locator {
    return this.page.getByRole("button", { name: /Delete/i }).last();
  }
}
