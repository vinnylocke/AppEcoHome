import type { Page, Locator } from "@playwright/test";

/**
 * Page object for the Integrations → Automations builder (unified condition
 * builder). Targets the stable data-testids on AutomationsSection /
 * AutomationBuilderModal.
 */
export class AutomationsPage {
  readonly page: Page;
  readonly newButton: Locator;
  readonly builderModal: Locator;
  readonly nameInput: Locator;
  readonly summary: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newButton = page.getByTestId("automation-new");
    this.builderModal = page.getByTestId("automation-builder-modal");
    this.nameInput = page.getByTestId("automation-name");
    this.summary = page.getByTestId("automation-summary");
    this.saveButton = page.getByTestId("automation-save");
  }

  async goto() {
    await this.page.goto("/integrations?tab=automations");
  }

  async openBuilder() {
    await this.newButton.click({ timeout: 10000 });
    await this.builderModal.waitFor({ state: "visible", timeout: 10000 });
  }

  template(id: string): Locator {
    return this.page.getByTestId(`template-${id}`);
  }
}
