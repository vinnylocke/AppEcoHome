import type { Page, Locator } from "@playwright/test";

/**
 * Page object for the NEW main dashboard ("Dashboard" sub-tab, ?view=home)
 * — docs/plans/new-home-dashboard.md. The classic dashboard's page object
 * is DashboardPage (now at ?view=overview).
 */
export class HomeMainPage {
  readonly page: Page;

  readonly root: Locator;
  readonly statusStrip: Locator;
  readonly overviewGrid: Locator;
  readonly quickActions: Locator;
  readonly todaysTasks: Locator;
  readonly tasksSeeAll: Locator;
  readonly densitySimple: Locator;
  readonly densityDetailed: Locator;
  readonly viewSwitcher: Locator;
  readonly emptyGarden: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("home-main");
    this.statusStrip = page.getByTestId("home-status-strip");
    this.overviewGrid = page.getByTestId("home-overview-grid");
    this.quickActions = page.getByTestId("home-quick-actions");
    this.todaysTasks = page.getByTestId("home-todays-tasks");
    this.tasksSeeAll = page.getByTestId("home-tasks-see-all");
    this.densitySimple = page.getByTestId("home-density-simple");
    this.densityDetailed = page.getByTestId("home-density-detailed");
    this.viewSwitcher = page.getByTestId("dashboard-view-switcher");
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

  quickTile(id: string): Locator {
    return this.page.getByTestId(`home-quick-tile-${id}`);
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
