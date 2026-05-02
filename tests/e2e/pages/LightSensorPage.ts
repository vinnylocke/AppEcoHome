import type { Page, Locator } from "@playwright/test";

export class LightSensorPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly calibrateButton: Locator;
  readonly scanAgainButton: Locator;
  readonly saveReadingButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Page heading is "Light Meter" (NOT "Light Sensor")
    this.heading = page.getByRole("heading", { name: "Light Meter" });
    this.calibrateButton = page.getByRole("button", { name: /Calibrate/i });
    this.scanAgainButton = page.getByRole("button", { name: /Scan Again/i });
    this.saveReadingButton = page.getByRole("button", { name: /Save Reading/i });
  }

  async goto() {
    await this.page.goto("/lightsensor");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }
}
