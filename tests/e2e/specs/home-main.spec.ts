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
  test("HOME-001: plain /dashboard is home-only — the old ?view= switcher is gone (#12 IA reorg)", async ({ authenticatedPage }) => {
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(home.root).toBeVisible();
    // #12 IA reorg — Calendar + Weather left the Dashboard for the top-level
    // /calendar section, so the dashboard's 3-pill ?view= switcher no longer
    // exists. The Calendar section is reached from the primary nav instead.
    await expect(authenticatedPage.getByTestId("dashboard-view-switcher")).toHaveCount(0);
    await expect(
      authenticatedPage.getByRole("button", { name: "Calendar" }).first(),
    ).toBeVisible({ timeout: 10000 });
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

  test("HOME-005: the quick-actions launcher grid is gone; only the Garden Walk tile remains (Stage 1)", async ({ authenticatedPage }) => {
    // dashboard-nav-tasks-tray redesign Stage 1 (2026-07-21): the customisable
    // launcher grid was removed from the home — every tile but Garden Walk
    // duplicated a nav destination. The pin picker still lives at
    // /gardener?section=quick-launcher, just not on the dashboard.
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    // The grid, its tiles, and the Customise link are all gone.
    await expect(authenticatedPage.getByTestId("home-quick-actions")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("home-quick-actions-customise")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("home-quick-tile-doctor")).toHaveCount(0);
    // The seeded home has 6 plants (>= 5) → the Garden Walk tile survives.
    await expect(home.gardenWalk).toBeVisible({ timeout: 15000 });
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
    // #12 IA reorg — the calendar now lives at the top-level /calendar section.
    await expect(authenticatedPage).toHaveURL(/\/calendar/);
  });

  test("HOME-014: the home's compact today list exposes inline complete + postpone without leaving the home (redesign Stage 3)", async ({ authenticatedPage }) => {
    // Q3 of the stats+locations redesign: daily task actions are reachable
    // directly on the home so the round-trip to the Calendar is only for
    // management. The compact TaskList already carries per-row complete /
    // postpone / delete — this guards that they stay present on the home.
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(home.todaysTasks).toBeVisible();
    const firstRow = authenticatedPage.locator('[data-testid^="task-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    // Inline complete (the left checkbox) + inline postpone (the CalendarClock
    // button) both live on the row, scoped to it.
    await expect(firstRow.getByRole("button", { name: /Mark task .* as (complete|incomplete)/i })).toBeVisible();
    await expect(firstRow.getByRole("button", { name: /Postpone task/i }).first()).toBeVisible();
    // The task-board entry point is a real button (Stage 3 D#5), not a faint link.
    await expect(home.tasksSeeAll).toBeVisible();
  });

  test("HOME-015: owner can add a location inline on the grid and delete it (full round trip)", async ({ authenticatedPage }) => {
    // Stats+locations redesign Stage 4b: the garden grid manages locations in
    // place. Owner (seeded test account) → create + delete round-trips through
    // the same locationMutations path as /management, with the grid refetching.
    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    const name = `E2E Grid Loc ${Date.now()}`;

    await authenticatedPage.getByTestId("home-add-location-btn").click();
    const nameInput = authenticatedPage.getByTestId("home-add-location-name-input");
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(name);
    await authenticatedPage.getByTestId("home-add-location-save").click();

    // The refetch surfaces the new card.
    const newCard = authenticatedPage
      .locator('[data-testid^="home-location-card-"]')
      .filter({ hasText: name });
    await expect(newCard).toBeVisible({ timeout: 10000 });

    // Delete it via the card's own manage kebab → confirm (self-cleanup).
    await newCard.locator('[data-testid^="location-manage-"]').click();
    await authenticatedPage.getByTestId("location-manage-delete").click();
    await authenticatedPage.getByTestId("confirm-modal-confirm").click();
    await expect(newCard).toHaveCount(0, { timeout: 10000 });
  });

  test("HOME-016: a viewer sees NO add-location button and NO manage kebab (permission gating)", async ({ authenticatedPage }) => {
    // Security: RLS enforces only home membership, not the spatial permission
    // keys — the client `can()` gate is the only guard. Force the role query to
    // "viewer" (no locations.* keys) and assert the mutate affordances vanish.
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
    await authenticatedPage.route(/\/rest\/v1\/home_members\?select=role/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ role: "viewer", permissions: {} }]),
      }),
    );

    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    // The grid still renders (viewers can look) …
    await expect(home.overviewGrid).toBeVisible({ timeout: 15000 });
    // … but none of the create / manage affordances.
    await expect(authenticatedPage.getByTestId("home-add-location-btn")).toHaveCount(0);
    await expect(authenticatedPage.locator('[data-testid^="location-manage-"]')).toHaveCount(0);
    expect(supabaseUrl).toBeTruthy();
  });
});

test.describe("Home dashboard — telemetry (Phase 2)", () => {
  const AREA_BED_A = `0000000${workerNum}-0000-0000-0002-000000000001`;
  const AREA_BORDER = `0000000${workerNum}-0000-0000-0002-000000000002`;

  // Shared mocked home-overview payload: two areas (one with a sensor, one
  // with a running valve) + one soil_dry attention item. Used by HOME-008
  // (workbench attention inbox) and HOME-013 (porch Next Best Action) — the
  // same payload surfaces differently per posture (redesign Stage 4).
  const OVERVIEW_PAYLOAD = {
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
        route: "/dashboard",
        rank: 4,
      },
    ],
  };

  test("HOME-008: sensor, valve and attention chips render from the home-overview payload", async ({ authenticatedPage }) => {
    // The attention inbox is a Workbench-only surface (redesign Stage 4 — the
    // Porch shows a single Next Best Action instead; see HOME-013). Seed the
    // workbench posture so the attention row renders. The sensor/valve chips
    // live on the garden grid in BOTH postures.
    await authenticatedPage.addInitScript(() =>
      localStorage.setItem("rhozly:home:preset", "workbench"),
    );
    await mockEdgeFunction(authenticatedPage, "home-overview", OVERVIEW_PAYLOAD);

    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    await expect(authenticatedPage.getByTestId("home-sensor-chip").first()).toBeVisible({ timeout: 15000 });
    await expect(authenticatedPage.getByTestId("home-valve-chip").first()).toBeVisible();
    await expect(authenticatedPage.getByTestId("home-attention-soil_dry")).toBeVisible();
    await expect(authenticatedPage.getByText("Greenhouse is dry (18%)")).toBeVisible();
  });

  test("HOME-013: on the Porch, the top attention item surfaces as the Next Best Action", async ({ authenticatedPage }) => {
    // The Porch (persona new/null — the default) deliberately omits the
    // attention inbox and instead leads with ONE guided action (redesign
    // Stage 4). The same soil_dry payload that fills the Workbench inbox
    // becomes the Porch's Next Best Action headline.
    await authenticatedPage.addInitScript(() =>
      localStorage.setItem("rhozly:home:preset", "porch"),
    );
    await mockEdgeFunction(authenticatedPage, "home-overview", OVERVIEW_PAYLOAD);

    const home = new HomeMainPage(authenticatedPage);
    await home.goto();
    await home.waitForLoad();

    const nba = authenticatedPage.getByTestId("next-best-action");
    await expect(nba).toBeVisible({ timeout: 15000 });
    await expect(nba).toContainText("Greenhouse is dry (18%)");
    // The Porch shows no attention-row chips.
    await expect(authenticatedPage.getByTestId("home-attention-soil_dry")).toHaveCount(0);
  });
});
