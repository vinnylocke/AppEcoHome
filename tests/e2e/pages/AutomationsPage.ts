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
  // Default run-window settings card (Integrations → Automations).
  readonly defaultsCard: Locator;
  readonly windowEnabled: Locator;
  readonly windowStart: Locator;
  readonly windowEnd: Locator;
  readonly windowSave: Locator;
  // Builder pickers.
  readonly taskLeafSearch: Locator;
  readonly sensorLeafSearch: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newButton = page.getByTestId("automation-new");
    this.builderModal = page.getByTestId("automation-builder-modal");
    this.nameInput = page.getByTestId("automation-name");
    this.summary = page.getByTestId("automation-summary");
    this.saveButton = page.getByTestId("automation-save");
    this.defaultsCard = page.getByTestId("automation-defaults-card");
    this.windowEnabled = page.getByTestId("automation-window-enabled");
    this.windowStart = page.getByTestId("automation-window-start");
    this.windowEnd = page.getByTestId("automation-window-end");
    this.windowSave = page.getByTestId("automation-window-save");
    this.taskLeafSearch = page.getByTestId("task-leaf-search");
    this.sensorLeafSearch = page.getByTestId("sensor-leaf-search");
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

  /** The leaf-kind <select> inside the first condition leaf. */
  leafKindSelect(): Locator {
    return this.page.getByTestId("leaf-kind").first();
  }
}
