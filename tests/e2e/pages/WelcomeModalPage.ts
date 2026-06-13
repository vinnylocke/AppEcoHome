import type { Page, Locator } from "@playwright/test";

/**
 * Page object for /src/components/WelcomeModal.tsx — the first-run 4-slide
 * carousel. Renders against the test id contract added with Wave 23
 * onboarding (`welcome-modal`, `welcome-prev`, `welcome-next`,
 * `welcome-start-quiz`, `welcome-skip`, `welcome-dot-{N}`).
 */
export class WelcomeModalPage {
  readonly page: Page;

  readonly root: Locator;
  readonly title: Locator;
  readonly closeButton: Locator;
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly startQuizButton: Locator;
  readonly skipButton: Locator;
  readonly personaNew: Locator;
  readonly personaExperienced: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("welcome-modal");
    this.title = page.locator("#welcome-modal-title");
    this.closeButton = page.getByTestId("welcome-modal-close");
    this.prevButton = page.getByTestId("welcome-prev");
    this.nextButton = page.getByTestId("welcome-next");
    this.startQuizButton = page.getByTestId("welcome-start-quiz");
    this.skipButton = page.getByTestId("welcome-skip");
    this.personaNew = page.getByTestId("welcome-persona-new");
    this.personaExperienced = page.getByTestId("welcome-persona-experienced");
  }

  dot(index: number): Locator {
    return this.page.getByTestId(`welcome-dot-${index}`);
  }

  async waitForOpen() {
    await this.root.waitFor({ state: "visible" });
  }

  async waitForClosed() {
    await this.root.waitFor({ state: "hidden" });
  }

  async advance(times: number) {
    for (let i = 0; i < times; i++) {
      await this.nextButton.click();
    }
  }
}
