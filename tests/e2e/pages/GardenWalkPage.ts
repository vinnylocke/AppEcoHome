import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Garden Walk (`/walk`) focus-mode flow.
 * Covers the plant card, the Snap/Note sheets, and the empty/error exits.
 */
export class GardenWalkPage {
  readonly page: Page;

  readonly loading: Locator;
  readonly empty: Locator;
  readonly error: Locator;
  readonly card: Locator;
  readonly stopButton: Locator;

  // Action bar
  readonly snapAction: Locator;
  readonly noteAction: Locator;
  readonly allGoodAction: Locator;
  readonly skipAction: Locator;

  // Snap sheet (RHO-6)
  readonly snapSheet: Locator;
  readonly snapSheetBody: Locator;

  // Note sheet
  readonly noteSheet: Locator;
  readonly noteSheetBody: Locator;

  // Empty / error exit buttons (RHO-8 — label is now "Back")
  readonly emptyBackButton: Locator;
  readonly errorBackButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loading = page.getByTestId("garden-walk-loading");
    this.empty = page.getByTestId("garden-walk-empty");
    this.error = page.getByTestId("garden-walk-error");
    this.card = page.getByTestId("walk-card");
    this.stopButton = page.getByTestId("walk-card-stop");

    this.snapAction = page.getByTestId("walk-action-snap");
    this.noteAction = page.getByTestId("walk-action-note");
    this.allGoodAction = page.getByTestId("walk-action-all-good");
    this.skipAction = page.getByTestId("walk-action-skip");

    this.snapSheet = page.getByTestId("walk-snap-sheet");
    this.snapSheetBody = page.getByTestId("walk-snap-sheet-body");

    this.noteSheet = page.getByTestId("walk-note-sheet");
    this.noteSheetBody = page.getByTestId("walk-note-sheet-body");

    this.emptyBackButton = page.getByTestId("garden-walk-empty-back");
    this.errorBackButton = page.getByTestId("garden-walk-error-back");
  }

  /** Launch a walk from the dashboard launcher (preserves origin state). */
  async startFromDashboard() {
    await this.page.goto("/dashboard?view=overview");
    const launcher = this.page.getByTestId("dash-garden-walk");
    await launcher.waitFor({ state: "visible", timeout: 15000 });
    await launcher.click();
  }

  async waitForCardOrEmpty() {
    await this.page
      .getByTestId("garden-walk-loading")
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {});
    await Promise.race([
      this.card.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      this.empty.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
    ]);
  }
}
