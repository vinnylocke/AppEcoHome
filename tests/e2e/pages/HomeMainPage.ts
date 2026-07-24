import type { Page, Locator } from "@playwright/test";

/**
 * Page object for the main dashboard ("Dashboard" sub-tab, ?view=home)
 * — docs/plans/new-home-dashboard.md. The classic dashboard's page object
 * is DashboardPage, which now targets the same merged home in DETAILED
 * density (the old Overview tab was merged in — Phase 4.2).
 */
export class HomeMainPage {
  readonly page: Page;

  readonly root: Locator;
  readonly statusStrip: Locator;
  readonly overviewGrid: Locator;
  readonly gardenWalk: Locator;
  readonly todaysTasks: Locator;
  readonly tasksSeeAll: Locator;
  readonly densitySimple: Locator;
  readonly densityDetailed: Locator;
  readonly emptyGarden: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("home-main");
    this.statusStrip = page.getByTestId("home-status-strip");
    this.overviewGrid = page.getByTestId("home-overview-grid");
    this.gardenWalk = page.getByTestId("dash-garden-walk");
    this.todaysTasks = page.getByTestId("home-todays-tasks");
    this.tasksSeeAll = page.getByTestId("home-tasks-see-all");
    this.densitySimple = page.getByTestId("home-density-simple");
    this.densityDetailed = page.getByTestId("home-density-detailed");
    this.emptyGarden = page.getByTestId("home-empty-garden");
  }

  locationCard(locationId: string): Locator {
    return this.page.getByTestId(`home-location-card-${locationId}`);
  }

  areaRow(areaName: string): Locator {
    return this.page.getByTestId(
      `home-area-row-${areaName.toLowerCase().replace(/\s+/g, "-")}`,
    );
  }

  async goto() {
    await this.page.goto("/dashboard");
  }

  async gotoLegacyViewParam() {
    await this.page.goto("/dashboard?view=dashboard");
  }

  async waitForLoad() {
    await this.root.waitFor({ state: "visible", timeout: 15000 });
    await this.page
      .waitForFunction(
        () => document.querySelectorAll(".animate-spin").length === 0,
        { timeout: 10000 },
      )
      .catch(() => {});
  }
}
