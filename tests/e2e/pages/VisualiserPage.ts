import type { Page, Locator } from "@playwright/test";

export class VisualiserPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly openVisualiserButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Plant Visualiser" });
    this.openVisualiserButton = page.getByRole("button", { name: /Continue to Sprites/i });
    this.emptyState = page.getByText(/Add plants to your shed first/i);
  }

  async goto() {
    await this.page.goto("/visualiser");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  /** Button to add a plant to the visualiser stage. */
  addPlantButton(commonName: string): Locator {
    return this.page.getByLabel(`Add ${commonName} to visualiser`);
  }

  /** Button to remove a plant from the visualiser stage. */
  removePlantButton(commonName: string): Locator {
    return this.page.getByLabel(`Remove ${commonName} from visualiser`);
  }

  /** Remove a plant from the stage panel (different button from the card). */
  removeFromStageButton(commonName: string): Locator {
    return this.page.getByLabel(`Remove ${commonName}`);
  }
}
