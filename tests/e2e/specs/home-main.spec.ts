import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { HomeMainPage } from "../pages/HomeMainPage";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// New main dashboard (?view=home) — docs/plans/new-home-dashboard.md.
// Relevant seeds:
//   00_bootstrap.sql        — user, home
//   01_locations_areas.sql  — Outside Garden + Indoor Space, 5 areas
//   02_plants_shed.sql      — 6 plants / inventory items
//   03_tasks_blueprints.sql — today's + overdue tasks

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
const LOC_GARDEN_ID = `0000000${workerNum}-0000-0000-0001-000000000001`;
const LOC_INDOOR_ID = `0000000${workerNum}-0000-0000-0001-000000000002`;

test.describe("Home dashboard (Section 30)", () => {
  test("HOME-001: plain /dashboard lands on the Home view with the 4-tab switcher", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(home.root).toBeVisible();
    await expect(home.viewSwitcher.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(home.viewSwitcher.getByRole("button", { name: "Locations" })).toBeVisible();
    await expect(home.viewSwitcher.getByRole("button", { name: "Calendar" })).toBeVisible();
    await expect(home.viewSwitcher.getByRole("button", { name: "Weather" })).toBeVisible();
    // Phase 4.2: the Overview tab was merged into Home.
    await expect(home.viewSwitcher.getByRole("button", { name: "Overview" })).toHaveCount(0);
  });

  test("HOME-002: garden overview grid renders both seeded locations with area rows", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(home.overviewGrid).toBeVisible({ timeout: 15000 });
    await expect(home.locationCard(LOC_GARDEN_ID)).toBeVisible();
    await expect(home.locationCard(LOC_INDOOR_ID)).toBeVisible();
    // Seeded areas inside Outside Garden.
    await expect(home.areaRow("Raised Bed A")).toBeVisible();
    await expect(home.areaRow("South Border")).toBeVisible();
  });

  test("HOME-003: legacy ?view=dashboard deep link lands on the new Home view", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.gotoLegacyViewParam();
    await home.waitForLoad();
    await expect(home.root).toBeVisible();
  });

  test("HOME-004: legacy ?view=overview deep link falls through to the merged Home view", async ({ authenticatedPage }) => {
    // Phase 4.2: the Overview tab no longer exists — the unknown view param
    // resolves to home, exactly like the legacy ?view=dashboard alias.
    await authenticatedPage.goto("/dashboard?view=overview");
    await expect(authenticatedPage.getByTestId("home-main")).toBeVisible({ timeout: 20000 });
  });

  test("HOME-005: quick actions render the default launcher tiles", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(home.quickActions).toBeVisible();
    // Default (non-experienced) pin set: doctor, today, capture, shed.
    await expect(home.quickTile("doctor")).toBeVisible();
    await expect(home.quickTile("today")).toBeVisible();
    await expect(home.quickTile("capture")).toBeVisible();
    await expect(home.quickTile("shed")).toBeVisible();
  });

  test("HOME-006: density toggle persists the user's choice", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await home.densityDetailed.click();
    const stored = await authenticatedPage.evaluate(() =>
      localStorage.getItem("rhozly:home:density"),
    );
    expect(stored).toBe("detailed");
  });

  test("HOME-007: today's tasks section links through to the calendar", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(home.todaysTasks).toBeVisible();
    await home.tasksSeeAll.click();
    await expect(authenticatedPage).toHaveURL(/view=calendar/);
  });
});

test.describe("Home dashboard — telemetry (Phase 2)", () => {
  const AREA_BED_A = `0000000${workerNum}-0000-0000-0002-000000000001`;
  const AREA_BORDER = `0000000${workerNum}-0000-0000-0002-000000000002`;

  test("HOME-008: sensor, valve and attention chips render from the home-overview payload", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "home-overview", {
      locations: [
        {
          id: LOC_GARDEN_ID,
          name: "Outside Garden",
          is_outside: true,
          hazard: null,
          tasksToday: 2,
          areas: [
            {
              id: AREA_BED_A,
              name: "Raised Bed A",
              plants: { total: 2, byGrowthState: { Vegetative: 2 }, unplanted: 0 },
              sensor: { moisture: 45, tempC: 18.5, ec: 1.2, batteryPercent: 82, readingAgeMin: 12 },
              valve: null,
              tasksToday: 1,
            },
            {
              id: AREA_BORDER,
              name: "South Border",
              plants: { total: 1, byGrowthState: {}, unplanted: 1 },
              sensor: null,
              valve: { state: "running", runningUntil: new Date(Date.now() + 5 * 60_000).toISOString(), lastRunAt: null, nextRunAt: null },
              tasksToday: 0,
            },
          ],
        },
      ],
      attention: [
        {
          kind: "soil_dry",
          title: "Greenhouse is dry (18%)",
          body: "Soil moisture is below the comfortable band.",
          route: "/dashboard?view=locations",
          rank: 4,
        },
      ],
    });

    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(authenticatedPage.getByTestId("home-sensor-chip").first()).toBeVisible({ timeout: 15000 });
    await expect(authenticatedPage.getByTestId("home-valve-chip").first()).toBeVisible();
    await expect(authenticatedPage.getByTestId("home-attention-soil_dry")).toBeVisible();
    await expect(authenticatedPage.getByText("Greenhouse is dry (18%)")).toBeVisible();
  });
});
