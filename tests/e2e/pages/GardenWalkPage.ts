import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Garden Walk (`/walk`) focus-mode flow.
 *
 * RHO-17: the walk is a hierarchical route — Home section card →
 * per-Location cards → per-Area cards → plant cards → unassigned
 * plants → summary. Section cards share the plant card's stop/progress
 * testids (`walk-card-stop`, `walk-card-progress`) so exit flows are
 * uniform; section-specific controls live under `walk-section-*`.
 */
export class GardenWalkPage {
  readonly page: Page;

  readonly loading: Locator;
  readonly empty: Locator;
  readonly error: Locator;
  /** Plant card (one per plant, the pre-RHO-17 experience). */
  readonly card: Locator;
  /** Section card (home / location / area — RHO-17). */
  readonly sectionCard: Locator;
  readonly stopButton: Locator;
  readonly progress: Locator;

  // Plant-card action bar
  readonly snapAction: Locator;
  readonly noteAction: Locator;
  readonly allGoodAction: Locator;
  readonly skipAction: Locator;

  // Section-card controls (RHO-17)
  readonly sectionTitle: Locator;
  readonly sectionContinue: Locator;
  readonly sectionSkip: Locator;
  readonly sectionNote: Locator;
  readonly sectionSnap: Locator;
  readonly sectionNoteSheet: Locator;
  readonly sectionNoteInput: Locator;
  readonly sectionNoteSave: Locator;

  // Section-card telemetry + readings (RHO-17 Phase 2)
  readonly sectionDevices: Locator;
  readonly logReadingButton: Locator;
  readonly readingSheet: Locator;
  readonly readingMoisture: Locator;
  readonly readingTemp: Locator;
  readonly readingEc: Locator;
  readonly profileToggle: Locator;
  readonly profilePh: Locator;
  readonly profileWater: Locator;
  readonly readingSave: Locator;

  // Watchlist + plans weaving (RHO-17 Phase 3)
  readonly watchlistPanel: Locator;
  readonly watchlistGuidance: Locator;
  readonly sectionPlans: Locator;

  // Resume prompt (RHO-17)
  readonly resumePrompt: Locator;
  readonly resumeContinue: Locator;
  readonly resumeFresh: Locator;

  // Summary
  readonly summary: Locator;
  readonly summaryDone: Locator;
  readonly summaryFullWalk: Locator;
  readonly emptyAgain: Locator;

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
    this.sectionCard = page.getByTestId("walk-section-card");
    this.stopButton = page.getByTestId("walk-card-stop");
    this.progress = page.getByTestId("walk-card-progress");

    this.snapAction = page.getByTestId("walk-action-snap");
    this.noteAction = page.getByTestId("walk-action-note");
    this.allGoodAction = page.getByTestId("walk-action-all-good");
    this.skipAction = page.getByTestId("walk-action-skip");

    this.sectionTitle = page.getByTestId("walk-section-title");
    this.sectionContinue = page.getByTestId("walk-section-continue");
    this.sectionSkip = page.getByTestId("walk-section-skip");
    this.sectionNote = page.getByTestId("walk-section-note");
    this.sectionSnap = page.getByTestId("walk-section-snap");
    this.sectionNoteSheet = page.getByTestId("walk-section-note-sheet");
    this.sectionNoteInput = page.getByTestId("walk-section-note-input");
    this.sectionNoteSave = page.getByTestId("walk-section-note-save");

    this.sectionDevices = page.getByTestId("walk-section-devices");
    this.logReadingButton = page.getByTestId("walk-log-reading");
    this.readingSheet = page.getByTestId("walk-reading-sheet");
    this.readingMoisture = page.getByTestId("walk-reading-moisture");
    this.readingTemp = page.getByTestId("walk-reading-temp");
    this.readingEc = page.getByTestId("walk-reading-ec");
    this.profileToggle = page.getByTestId("walk-bed-profile-toggle");
    this.profilePh = page.getByTestId("walk-profile-ph");
    this.profileWater = page.getByTestId("walk-profile-water");
    this.readingSave = page.getByTestId("walk-reading-save");

    this.watchlistPanel = page.getByTestId("walk-watchlist-panel");
    this.watchlistGuidance = page.getByTestId("walk-watchlist-guidance");
    this.sectionPlans = page.getByTestId("walk-section-plans");

    this.resumePrompt = page.getByTestId("garden-walk-resume");
    this.resumeContinue = page.getByTestId("walk-resume-continue");
    this.resumeFresh = page.getByTestId("walk-resume-fresh");

    this.summary = page.getByTestId("walk-summary");
    this.summaryDone = page.getByTestId("walk-summary-done");
    this.summaryFullWalk = page.getByTestId("walk-summary-full-walk");
    this.emptyAgain = page.getByTestId("garden-walk-empty-again");

    this.snapSheet = page.getByTestId("walk-snap-sheet");
    this.snapSheetBody = page.getByTestId("walk-snap-sheet-body");

    this.noteSheet = page.getByTestId("walk-note-sheet");
    this.noteSheetBody = page.getByTestId("walk-note-sheet-body");

    this.emptyBackButton = page.getByTestId("garden-walk-empty-back");
    this.errorBackButton = page.getByTestId("garden-walk-error-back");
  }

  /** Any walk card — section or plant. */
  get anyCard(): Locator {
    return this.card.or(this.sectionCard);
  }

  /** Launch a walk from the dashboard launcher (preserves origin state). */
  async startFromDashboard() {
    await this.page.goto("/dashboard?view=overview");
    const launcher = this.page.getByTestId("dash-garden-walk");
    await launcher.waitFor({ state: "visible", timeout: 15000 });
    await launcher.click();
  }

  /** Wait for the walk to settle on a card (section OR plant), the empty
   *  state, or the resume prompt (which is dismissed via Start fresh so
   *  tests always begin from a clean session). */
  async waitForCardOrEmpty() {
    await this.page
      .getByTestId("garden-walk-loading")
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {});
    await Promise.race([
      this.anyCard.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      this.empty.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      this.resumePrompt.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
    ]);
    if (await this.resumePrompt.isVisible().catch(() => false)) {
      await this.resumeFresh.click();
      await this.page
        .getByTestId("garden-walk-loading")
        .waitFor({ state: "hidden", timeout: 15000 })
        .catch(() => {});
      await Promise.race([
        this.anyCard.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
        this.empty.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      ]);
    }
  }

  /** Continue through section cards until a plant card (or the end of the
   *  walk) is reached. Returns true when a plant card is showing. */
  async advanceToPlantCard(maxSteps = 15): Promise<boolean> {
    for (let i = 0; i < maxSteps; i++) {
      if (await this.card.isVisible().catch(() => false)) return true;
      if (!(await this.sectionCard.isVisible().catch(() => false))) return false;
      await this.sectionContinue.click();
      await this.page.waitForTimeout(150);
    }
    return this.card.isVisible().catch(() => false);
  }

  /** Step through the walk (Continue on section cards, Skip on plant
   *  cards) until `target` is visible on the current card. Returns true
   *  when found (RHO-17 Phase 3 — hunting a specific banner/task row). */
  async advanceUntilVisible(target: Locator, maxSteps = 20): Promise<boolean> {
    for (let i = 0; i < maxSteps; i++) {
      if (await target.isVisible().catch(() => false)) return true;
      if (await this.sectionCard.isVisible().catch(() => false)) {
        await this.sectionContinue.click();
      } else if (await this.card.isVisible().catch(() => false)) {
        await this.skipAction.click();
      } else {
        return false;
      }
      await this.page.waitForTimeout(150);
    }
    return target.isVisible().catch(() => false);
  }

  /** Continue through section cards until the first AREA card. Returns
   *  true when an area card is showing (RHO-17 Phase 2 — readings). */
  async advanceToAreaCard(maxSteps = 15): Promise<boolean> {
    for (let i = 0; i < maxSteps; i++) {
      if (!(await this.sectionCard.isVisible().catch(() => false))) return false;
      const kind = await this.sectionCard.getAttribute("data-section-kind");
      if (kind === "area") return true;
      await this.sectionContinue.click();
      await this.page.waitForTimeout(150);
    }
    return false;
  }

  /**
   * WALK-027 — press through the ENTIRE walk (section Continue / plant
   * All-good) until the summary card appears. Bounded so a regression
   * can't loop forever. Returns true when the summary was reached.
   */
  async completeEntireWalk(maxSteps = 60): Promise<boolean> {
    for (let i = 0; i < maxSteps; i++) {
      if (await this.summary.isVisible().catch(() => false)) return true;
      if (await this.sectionCard.isVisible().catch(() => false)) {
        await this.sectionContinue.click();
      } else if (await this.allGoodAction.isVisible().catch(() => false)) {
        await this.allGoodAction.click();
      } else {
        await this.page.waitForTimeout(200);
        continue;
      }
      await this.page.waitForTimeout(150);
    }
    return await this.summary.isVisible().catch(() => false);
  }
}
