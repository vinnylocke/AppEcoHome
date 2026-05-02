import type { Page, Locator } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;

  readonly dailyTasksHeading: Locator;
  readonly fullForecastButton: Locator;
  readonly signOutButton: Locator;
  readonly weatherCard: Locator;
  readonly locationsTab: Locator;
  readonly calendarTab: Locator;
  readonly weatherTab: Locator;

  // Garden Intelligence panel
  readonly giPanelHeading: Locator;

  // Calendar navigation — no aria-labels; identified by Lucide icon class
  readonly calendarMonthHeading: Locator;
  readonly calendarPrevButton: Locator;
  readonly calendarNextButton: Locator;

  // Quiz banner
  readonly quizBanner: Locator;
  readonly quizBannerDismiss: Locator;
  readonly quizBannerCta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dailyTasksHeading = page.getByText("Daily Tasks", { exact: true });
    this.fullForecastButton = page.getByRole("button", { name: "Full Forecast" });
    this.signOutButton = page.getByRole("button", { name: "Sign Out" });
    this.weatherCard = page.locator("text=°C").first();
    this.locationsTab = page.getByRole("button", { name: "Locations" }).first();
    this.calendarTab = page.getByRole("button", { name: "Calendar" }).first();
    this.weatherTab = page.getByRole("button", { name: "Weather" }).first();

    this.giPanelHeading = page.getByText("Garden Intelligence", { exact: true });
    this.calendarMonthHeading = page.locator("h3").filter({ hasText: /[A-Z][a-z]+ \d{4}/ });
    // Calendar prev/next buttons have no aria-label — target by SVG icon class
    this.calendarPrevButton = page.locator(".lucide-chevron-left").locator("..");
    this.calendarNextButton = page.locator(".lucide-chevron-right").locator("..");

    this.quizBanner = page.getByText("Set up your Garden Profile");
    // Scope dismiss to the quiz banner container (avoids matching weather alert dismiss buttons)
    this.quizBannerDismiss = page
      .locator(".from-emerald-500")
      .getByLabel("Dismiss");
    this.quizBannerCta = page.getByText("Get started");
  }

  async goto() {
    await this.page.goto("/dashboard");
  }

  async gotoCalendar() {
    await this.page.goto("/dashboard?view=calendar");
  }

  async gotoWeather() {
    await this.page.goto("/dashboard?view=weather");
  }

  async gotoLocation(locationId: string) {
    await this.page.goto(`/dashboard?locationId=${locationId}`);
  }

  async waitForLoad() {
    // Wait for initial spinner, a positive auth signal, home data resolution,
    // then any secondary spinners. Weather alerts render after home resolves,
    // so absence-only checks (no spinner, no "Select Home") pass instantly on
    // the login page — the Sign Out check prevents that silent false-pass.
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    await this.page
      .getByRole("button", { name: /sign out/i })
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {});

    await this.page
      .waitForFunction(() => !document.body.innerText.includes("Select Home"), { timeout: 10000 })
      .catch(() => {});

    await this.page
      .waitForFunction(
        () => document.querySelectorAll(".animate-spin, .animate-pulse").length === 0,
        { timeout: 10000 },
      )
      .catch(() => {});
  }

  async clickFullForecast() {
    await this.fullForecastButton.click();
  }

  async clickWeatherTab() {
    await this.weatherTab.click();
  }

  async clickSignOut() {
    await this.signOutButton.click();
  }

  /** Find a location tile by its displayed name (matches on h3 inside tile). */
  locationTile(name: string): Locator {
    return this.page.locator("h3").filter({ hasText: name }).first();
  }

  /** Find a weather alert banner by type (e.g. "heat" → "heat Alert"). */
  alertByType(type: string): Locator {
    return this.page.getByText(new RegExp(`${type} Alert`, "i")).first();
  }

  /** Find a Garden Intelligence rule row by rule name. */
  giRule(name: string): Locator {
    return this.page.getByText(new RegExp(name, "i")).first();
  }
}
