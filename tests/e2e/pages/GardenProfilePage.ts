import type { Page, Locator } from "@playwright/test";

export class GardenProfilePage {
  readonly page: Page;

  readonly heading: Locator;
  readonly quizTab: Locator;
  readonly swipeTab: Locator;
  readonly progressBar: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly finishButton: Locator;
  readonly completionHeading: Locator;
  readonly resetButton: Locator;

  // Preferences section (shown after quiz completion)
  readonly preferencesHeading: Locator;
  readonly deletePreferenceButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Garden Profile" });
    this.quizTab = page.getByRole("button", { name: /Quiz/i });
    this.swipeTab = page.getByRole("button", { name: /Swipe/i });
    this.progressBar = page.getByRole("progressbar");
    this.nextButton = page.getByRole("button", { name: /Next/i });
    this.backButton = page.getByRole("button", { name: /Back/i });
    this.finishButton = page.getByRole("button", { name: /Finish/i });
    this.completionHeading = page.getByText(/Quiz complete!/);
    this.resetButton = page.getByRole("button", { name: /Reset/i });
    this.preferencesHeading = page.getByText("Your garden preferences");
    this.deletePreferenceButton = page.getByLabel("Remove preference").first();
  }

  async goto() {
    await this.page.goto("/profile");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  /** Click a quiz option by its visible label text. */
  optionButton(label: string): Locator {
    return this.page.getByRole("button", { name: new RegExp(label, "i") });
  }
}
