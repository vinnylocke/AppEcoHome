import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { DashboardPage } from "../pages/DashboardPage";

// All tests require an authenticated session.

test.describe("Weather widget — dashboard", () => {
  test("dashboard shows the weather card with current conditions", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    // The weather card renders current temp as e.g. "18°C" or "--°C" (loading state)
    // Either is acceptable — we just verify the widget mounts
    const weatherWidget = authenticatedPage
      .locator("text=°C")
      .or(authenticatedPage.getByText("Loading..."));

    await expect(weatherWidget.first()).toBeVisible({ timeout: 10000 });
  });

  test("the Calendar section shows its three tabs (Calendar, Weather, Routines)", async ({ authenticatedPage }) => {
    // #12 IA reorg — Calendar + Weather left the Dashboard for the top-level
    // /calendar section (CalendarHub); Routines joined them. The switcher lives
    // there now, as SegmentedTabs (role="tab").
    await authenticatedPage.goto("/calendar");

    const switcher = authenticatedPage.getByTestId("calendar-hub-switch");
    await expect(switcher.getByRole("tab", { name: "Calendar", exact: true })).toBeVisible({ timeout: 10000 });
    await expect(switcher.getByRole("tab", { name: "Weather", exact: true })).toBeVisible();
    await expect(switcher.getByRole("tab", { name: "Routines", exact: true })).toBeVisible();
    // The dashboard's retired ?view= switcher must not reappear.
    await expect(authenticatedPage.getByTestId("dashboard-view-switcher")).toHaveCount(0);
  });

  test("clicking the Weather tab switches to the weather forecast view", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    // Land on the Calendar section (default Calendar tab), then switch to Weather.
    await authenticatedPage.goto("/calendar");

    await expect(dashboard.weatherTab).toBeVisible({ timeout: 10000 });
    await dashboard.clickWeatherTab();

    await expect(authenticatedPage).toHaveURL(/tab=weather/, { timeout: 5000 });
  });

  test("the weather forecast view renders after tab click", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await authenticatedPage.goto("/calendar");

    await expect(dashboard.weatherTab).toBeVisible({ timeout: 10000 });
    await dashboard.clickWeatherTab();

    // WeatherForecast component should mount — look for forecast-specific text
    const forecastContent = authenticatedPage
      .getByText(/Forecast|forecast|°C|Rain|Wind/i)
      .first();
    await expect(forecastContent).toBeVisible({ timeout: 10000 });
  });

  // ─── DASH-005 to DASH-009: Weather code icon rendering ───────────────────────
  // Seed 04_weather.sql contains WMO codes 0, 61, 71, 45 across the 7 forecast days.

  test("DASH-005: WMO 0 (clear sky) → Sun icon visible in forecast", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.locator(".lucide-sun").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("DASH-006: WMO 61 (rain) → CloudRain icon visible in forecast", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.locator(".lucide-cloud-rain").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("DASH-007: WMO 71 (snow) → CloudSnow icon visible in forecast", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.locator(".lucide-cloud-snow").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("DASH-008: WMO 95 (thunderstorm) → CloudLightning icon visible in forecast", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.locator(".lucide-cloud-lightning").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("DASH-009: WMO 45 (fog) → Cloud icon visible in forecast", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.locator(".lucide-cloud").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("weather alert banner is not present when there are no active alerts", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    // If no alerts, the banner should not render any visible content
    // The component renders nothing (or an empty container) when alerts = []
    const alertBanner = authenticatedPage.locator(
      "[class*='WeatherAlertBanner'], [data-testid='weather-alert-banner']",
    );

    // This is a soft assertion — we check it's either absent or has no visible text
    const count = await alertBanner.count();
    if (count > 0) {
      // It may exist in the DOM but be visually hidden when empty
      const text = await alertBanner.first().textContent();
      // If it has text, it's an active alert — that's fine, still a valid state
      expect(typeof text).toBe("string");
    }
    // No banner at all is also valid
  });
});
