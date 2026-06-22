import type { Page, Locator } from "@playwright/test";

type ManagerTab = "overview" | "brief" | "year" | "insights" | "ask";

/** Page Object for the Head Gardener AI manager tab (`/manager`). */
export class HeadGardenerPage {
  readonly page: Page;
  readonly root: Locator;
  readonly heading: Locator;
  readonly tabBar: Locator;
  readonly chatInput: Locator;
  readonly chatSend: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("head-gardener-page");
    this.heading = page.getByText("Head Gardener", { exact: true });
    this.tabBar = page.getByTestId("head-gardener-tabs");
    this.chatInput = page.getByTestId("chat-input");
    this.chatSend = page.getByTestId("chat-send");
  }

  async goto(tab?: ManagerTab) {
    await this.page.goto(tab ? `/manager?tab=${tab}` : "/manager");
  }

  async waitForLoad() {
    await this.root.waitFor({ state: "visible", timeout: 10000 });
  }

  tab(id: ManagerTab): Locator { return this.page.getByTestId(`head-gardener-tab-${id}`); }
  panel(id: ManagerTab): Locator { return this.page.getByTestId(`head-gardener-panel-${id}`); }

  async openTab(id: ManagerTab) {
    await this.tab(id).click();
    await this.panel(id).waitFor({ state: "visible", timeout: 8000 });
  }

  // Overview
  reportPanel(): Locator { return this.page.getByTestId("report-panel"); }
  managerLog(): Locator { return this.page.getByTestId("manager-log"); }

  // Brief
  briefCard(): Locator { return this.page.getByTestId("brief-card"); }
  briefEmpty(): Locator { return this.page.getByTestId("brief-empty"); }
  briefEditButton(): Locator { return this.page.getByTestId("brief-edit"); }

  // Year plan
  yearPlanPanel(): Locator { return this.page.getByTestId("yearplan-panel"); }
}
