import type { Page, Locator } from "@playwright/test";

export class YieldPage {
  readonly page: Page;
  readonly tab: Locator;
  readonly valueInput: Locator;
  readonly unitSelect: Locator;
  readonly notesInput: Locator;
  readonly logButton: Locator;
  readonly valueError: Locator;
  readonly historyList: Locator;
  readonly emptyHistory: Locator;
  readonly predictorPaywall: Locator;
  readonly harvestDateInput: Locator;
  readonly predictButton: Locator;
  readonly predictionCard: Locator;
  readonly predictionValue: Locator;
  readonly predictionConfidence: Locator;
  readonly predictionReasoning: Locator;
  readonly predictionTips: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tab = page.getByTestId("instance-modal-tab-yield");
    this.valueInput = page.getByTestId("yield-value-input");
    this.unitSelect = page.getByTestId("yield-unit-select");
    this.notesInput = page.getByTestId("yield-notes-input");
    this.logButton = page.getByTestId("yield-log-button");
    this.valueError = page.getByTestId("yield-value-error");
    this.historyList = page.getByTestId("yield-history-list");
    this.emptyHistory = page.getByTestId("yield-empty-history");
    this.predictorPaywall = page.getByTestId("yield-predictor-paywall");
    this.harvestDateInput = page.getByTestId("yield-harvest-date-input");
    this.predictButton = page.getByTestId("yield-predict-button");
    this.predictionCard = page.getByTestId("yield-prediction-card");
    this.predictionValue = page.getByTestId("yield-prediction-value");
    this.predictionConfidence = page.getByTestId("yield-prediction-confidence");
    this.predictionReasoning = page.getByTestId("yield-prediction-reasoning");
    this.predictionTips = page.getByTestId("yield-prediction-tips");
  }

  async openForInstance(instanceText: string) {
    await this.page.locator("h3, p").filter({ hasText: instanceText }).first().click();
    await this.tab.click();
  }
}
