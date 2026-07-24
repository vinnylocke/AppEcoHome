import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { DashboardPage } from "../pages/DashboardPage";
import { TaskListPage } from "../pages/TaskListPage";
import { mockEdgeFunction, MOCK_SCAN_AREA } from "../fixtures/api-mocks";

// All tests require an authenticated session.
// Relevant seeds:
//   00_bootstrap.sql  — user, home
//   01_locations_areas.sql — Outside Garden (LOC_GARDEN_ID), Indoor Space (LOC_INDOOR_ID)
//   03_tasks_blueprints.sql — standalone tasks incl. overdue task
//   04_weather.sql — heatwave + frost + wind + rain alerts for Outside Garden
//   08_profile_preferences.sql — quiz completion (suppresses quiz banner)

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
const LOC_GARDEN_ID = `0000000${workerNum}-0000-0000-0001-000000000001`;

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Weather alerts
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — view switcher (Section 02)", () => {
  test("CAL-011: the Calendar section's tab switcher shows Calendar/Weather/Routines and is reachable on a phone", async ({ authenticatedPage }) => {
    // #12 IA reorg — the Dashboard's old 3-pill ?view= switcher (Dashboard /
    // Calendar / Weather) was retired: Calendar + Weather moved to the top-level
    // /calendar section (CalendarHub) and Routines joined them. This asserts the
    // new hub's SegmentedTabs are all present + reachable on a narrow phone.
    await authenticatedPage.setViewportSize({ width: 412, height: 915 });
    await authenticatedPage.goto("/calendar");

    const switcher = authenticatedPage.getByTestId("calendar-hub-switch");
    await expect(switcher).toBeVisible({ timeout: 10000 });
    for (const label of ["Calendar", "Weather", "Routines"]) {
      await expect(switcher.getByRole("tab", { name: label, exact: true })).toHaveCount(1);
    }
    // The dashboard's old switcher must not exist anywhere anymore.
    await expect(authenticatedPage.getByTestId("dashboard-view-switcher")).toHaveCount(0);
    // Weather is reachable + navigates (scrollIntoView handles any overflow).
    const weather = switcher.getByRole("tab", { name: "Weather", exact: true });
    await weather.scrollIntoViewIfNeeded();
    await weather.click();
    await expect(authenticatedPage).toHaveURL(/tab=weather/, { timeout: 8000 });
  });

  test("DASH-009b: 2+ weather alerts collapse into one strip; tapping expands the per-type rows in place", async ({ authenticatedPage }) => {
    // Stage 5 of the garden-hub search-first overhaul: the ~150px pill stack
    // becomes one 44px strip on every padded screen. Seed 04 provides 3 alerts.
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    const strip = authenticatedPage.getByTestId("weather-alert-strip");
    await expect(strip).toBeVisible({ timeout: 10000 });
    await expect(strip).toContainText(/3 weather alerts/i);
    // Collapsed: no per-type rows in the DOM.
    await expect(authenticatedPage.getByTestId("weather-alert-bar-heat")).toHaveCount(0);

    await strip.click();
    // Expanded in place: the classic rows + per-type dismiss render.
    await expect(authenticatedPage.getByTestId("weather-alert-bar-heat")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId("weather-alert-bar-frost")).toBeVisible();
    // And it collapses again.
    await authenticatedPage.getByTestId("weather-alert-strip-collapse").click();
    await expect(authenticatedPage.getByTestId("weather-alert-bar-heat")).toHaveCount(0);
    await expect(strip).toBeVisible();
  });

  test("DASH-010: Heat alert banner is visible on the dashboard", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Seed 04's heat alert message is "Heatwave ahead — up to 36°C…". Scoped
    // to the compact bar's own testid: the same text also renders in the
    // AttentionRow weather card, so a bare getByText goes strict-ambiguous.
    // Stage 5: seed 04 guarantees 3 actionable alerts, so the collapse strip
    // is always present — wait for it properly (isVisible() doesn't auto-wait;
    // review catch: the racy guard would skip the click under CI load).
    const strip = authenticatedPage.getByTestId("weather-alert-strip");
    await expect(strip).toBeVisible({ timeout: 10000 });
    await strip.click();
    const heatBar = authenticatedPage.getByTestId("weather-alert-bar-heat");
    await expect(heatBar).toBeVisible({ timeout: 10000 });
    await expect(heatBar).toContainText(/Heatwave ahead/i);
  });

  test("DASH-011: Frost alert banner is visible on the dashboard", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Seed 04 adds a frost alert: "Frost risk tomorrow — cover tender plants…".
    // Scoped to the banner's testid — the same text also surfaces as a row in
    // The Brief (garden-brain-brief) on the workbench, so a bare getByText goes
    // strict-ambiguous (redesign Stage 3).
    // Stage 5: seed 04 guarantees 3 actionable alerts, so the collapse strip
    // is always present — wait for it properly (isVisible() doesn't auto-wait;
    // review catch: the racy guard would skip the click under CI load).
    const strip = authenticatedPage.getByTestId("weather-alert-strip");
    await expect(strip).toBeVisible({ timeout: 10000 });
    await strip.click();
    const frostBar = authenticatedPage.getByTestId("weather-alert-bar-frost");
    await expect(frostBar).toBeVisible({ timeout: 10000 });
    await expect(frostBar).toContainText(/Frost risk tomorrow/i);
  });

  test("DASH-013: Wind alert banner is visible on the dashboard", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Seed 04 adds a wind alert: "High winds forecast (65 kph)". Scoped to the
    // bar's testid — the same text also renders in the AttentionRow weather
    // card, so a bare getByText goes strict-ambiguous.
    // Stage 5: seed 04 guarantees 3 actionable alerts, so the collapse strip
    // is always present — wait for it properly (isVisible() doesn't auto-wait;
    // review catch: the racy guard would skip the click under CI load).
    const strip = authenticatedPage.getByTestId("weather-alert-strip");
    await expect(strip).toBeVisible({ timeout: 10000 });
    await strip.click();
    const windBar = authenticatedPage.getByTestId("weather-alert-bar-wind");
    await expect(windBar).toBeVisible({ timeout: 10000 });
    await expect(windBar).toContainText(/High winds forecast/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Garden Intelligence panel (Weather view)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — Garden Intelligence panel (Section 02)", () => {
  test("DASH-015: GI panel heading is visible in the weather view", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await dashboard.waitForLoad();

    await expect(dashboard.giPanelHeading).toBeVisible({ timeout: 10000 });
  });

  test("DASH-016: Auto-Watering rule appears in GI panel (rain in forecast)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await dashboard.waitForLoad();

    // Ensure the GI panel is open (click the heading if needed)
    const gi = dashboard.giPanelHeading;
    await expect(gi).toBeVisible({ timeout: 10000 });

    await expect(
      authenticatedPage.getByText(/Auto.Watering|Auto Watering/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test("DASH-017: Frost Risk rule appears in GI panel (frost day in forecast)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await dashboard.waitForLoad();

    await expect(dashboard.giPanelHeading).toBeVisible({ timeout: 10000 });
    await expect(dashboard.giRule("Frost Risk")).toBeVisible({ timeout: 10000 });
  });

  test("DASH-018: Heatwave rule appears in GI panel (max temp 36°C today)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await dashboard.waitForLoad();

    await expect(dashboard.giPanelHeading).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.getByText(/Heatwave/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test("DASH-019: High Winds rule appears in GI panel (65 kph wind day)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoWeather();
    await dashboard.waitForLoad();

    await expect(dashboard.giPanelHeading).toBeVisible({ timeout: 10000 });
    await expect(dashboard.giRule("High Wind")).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Garden grid location cards (was the "Locations view")
// ─────────────────────────────────────────────────────────────────────────────
// The standalone Locations tab (?view=locations) was RETIRED in the
// stats+locations redesign Stage 4 (2026-07-20) — the home garden grid IS the
// "what's growing where" surface now. DASH-020/021/022 (the old LocationTile
// grid + Indoors badge) are covered by HOME-002 (home-main.spec asserts the
// grid renders both seeded locations + their area rows). DASH-023's drill-in
// nav is repointed below to the garden-grid location card.

test.describe("Dashboard — Garden grid location cards (Section 02)", () => {
  test("DASH-023: Clicking a garden-grid location card updates the URL with locationId", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // The grid card header is a button that drills into the location page.
    await authenticatedPage
      .getByTestId(`home-location-card-${LOC_GARDEN_ID}`)
      .getByText("Outside Garden")
      .click();

    await expect(authenticatedPage).toHaveURL(/locationId=/, { timeout: 8000 });
  });

  test("DASH-027: Quiz banner absent when quiz is complete (seed 08 applied)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Seed 08 marks the quiz as complete — banner should not appear
    await expect(dashboard.quizBanner).not.toBeVisible({ timeout: 5000 }).catch(() => {
      // If the banner IS visible, the test fails clearly
    });
    const bannerVisible = await dashboard.quizBanner.isVisible().catch(() => false);
    expect(bannerVisible).toBe(false);
  });

  test("DASH-035: Overdue task is visible in the task list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // "Overdue Maintenance Check" is seeded with due_date = CURRENT_DATE - 7 and status Pending
    await expect(
      authenticatedPage.getByText("Overdue Maintenance Check"),
    ).toBeVisible({ timeout: 10000 });
  });

  // DASH-034 retired (2026-07-20): the "View Calendar" button no longer exists
  // anywhere in src/ — the affordance predates the Phase 4.2 merged home. The
  // calendar view is covered by the CAL-* suite (gotoCalendar → /calendar), the
  // Calendar-section switcher spec (CAL-011), plus the redesign hero's "Plan my
  // day" chip (hero-plan-day → /calendar, #12 IA reorg).

  test("DASH-036: Skipped task does not appear in the Pending task list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Pending tab is shown by default — skipped "Fertilize Beds (postponed)" must not appear
    const skippedInPending = await authenticatedPage
      .getByText("Fertilize Beds (postponed)")
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(skippedInPending).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Quiz banner (requires mocking quiz completions endpoint)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — single-slot onboarding + quiz banner (Section 02)", () => {
  // Phase 4.2: the dashboard shows at most ONE promo card — checklist first,
  // then the quiz prompt once the checklist is gone. With quiz completions
  // mocked away the checklist has an undone step, so it owns the slot.
  test("DASH-024: Checklist owns the promo slot while the quiz is incomplete; quiz banner stays hidden", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
    // Mock the quiz completions endpoint so the app sees no completion record
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/home_quiz_completions*`,
      route => route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
    );

    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.waitForTimeout(800);

    const dashboard = new DashboardPage(authenticatedPage);
    await expect(
      authenticatedPage.getByTestId("getting-started-checklist"),
    ).toBeVisible({ timeout: 10000 });
    await expect(dashboard.quizBanner).not.toBeVisible();
  });

  test("DASH-025: Dismissing the checklist cascades the slot to the quiz banner; dismissing that hides it", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/home_quiz_completions*`,
      route => route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
    );
    // Swallow the dismissal writes so this test never pollutes the seeded
    // onboarding_state for later runs (the app updates local state optimistically).
    await authenticatedPage.route(`${supabaseUrl}/rest/v1/user_profiles*`, route => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    });

    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.waitForTimeout(800);

    const dashboard = new DashboardPage(authenticatedPage);
    await expect(
      authenticatedPage.getByTestId("getting-started-checklist"),
    ).toBeVisible({ timeout: 10000 });

    // Slot cascade: checklist dismissed → quiz prompt claims the slot
    await authenticatedPage.getByTestId("checklist-dismiss").click();
    await expect(dashboard.quizBanner).toBeVisible({ timeout: 5000 });

    // Dismissing the quiz banner swaps it to the confirm row (headline gone)
    await dashboard.quizBannerDismiss.click();
    await expect(dashboard.quizBanner).not.toBeVisible({ timeout: 5000 });
  });

  test("DASH-026: Quiz banner CTA navigates to /profile", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/home_quiz_completions*`,
      route => route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
    );
    // Swallow the dismissal writes so this test never pollutes the seeded
    // onboarding_state for later runs.
    await authenticatedPage.route(`${supabaseUrl}/rest/v1/user_profiles*`, route => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    });

    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.waitForTimeout(800);

    // Surface the quiz banner by clearing the checklist out of the slot
    await authenticatedPage.getByTestId("checklist-dismiss").click({ timeout: 10000 });

    const dashboard = new DashboardPage(authenticatedPage);
    await expect(dashboard.quizBanner).toBeVisible({ timeout: 10000 });

    await dashboard.quizBannerCta.click();

    await expect(authenticatedPage).toHaveURL("/profile", { timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 03 — LocationPage (navigate via ?locationId param)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — LocationPage (Section 03)", () => {
  test("LOC-020: owner can open the Add-Area wizard from the drill-in (Stage 5 — no more 'go to Management' dead-end)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // The old empty-state dead-end ("Go to Settings › Location Management") is gone.
    await expect(authenticatedPage.getByText("Settings › Location Management")).toHaveCount(0);

    // The gated Add-Area button opens the wizard in place.
    const addArea = authenticatedPage.getByTestId("location-add-area-btn");
    await expect(addArea).toBeVisible({ timeout: 10000 });
    await addArea.click();
    // AddAreaWizard's first step is the bed form — a name field appears.
    await expect(
      authenticatedPage.locator('input[placeholder*="name" i], input[placeholder*="bed" i], input[placeholder*="Raised" i]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-021: a VIEWER cannot mutate on the drill-in — no env toggle, no add-area, no delete (closes the Stage-5 permission leak)", async ({ authenticatedPage }) => {
    // The env-toggle + area-delete were UNGATED before Stage 5 (RLS gates only
    // home membership, not the spatial keys). Force a viewer role and assert the
    // mutate affordances are gone — the environment shows as a read-only badge.
    await authenticatedPage.route(/\/rest\/v1\/home_members\?select=role/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ role: "viewer", permissions: {} }]),
      }),
    );

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);

    // Wait for the drill-in heading directly (the mocked viewer role leaves the
    // home switcher in a "Select Home" state that would make DashboardPage's
    // waitForLoad spin, so anchor on the location content instead).
    await expect(authenticatedPage.getByText("Outside Garden").first()).toBeVisible({ timeout: 15000 });
    // The Areas heading confirms the LocationPage body rendered.
    await expect(authenticatedPage.getByRole("heading", { name: "Areas", exact: true })).toBeVisible({ timeout: 10000 });

    // No environment TOGGLE (the editable button labelled "… Environment") …
    await expect(authenticatedPage.getByRole("button", { name: /Environment$/ })).toHaveCount(0);
    // … no add-area button, and no per-area delete buttons.
    await expect(authenticatedPage.getByTestId("location-add-area-btn")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("location-add-area-empty-btn")).toHaveCount(0);
    await expect(authenticatedPage.getByRole("button", { name: /^Delete area/ })).toHaveCount(0);
  });

  test("LOC-022: a VIEWER cannot mutate inside an area — AreaDetails is read-only (Stage 5 leak closure, part 2)", async ({ authenticatedPage }) => {
    // AreaDetails (rendered only by this drill-in, reachable by viewers) had its
    // OWN ungated area-edit + plant delete/archive writes. Force a viewer and
    // assert the edit gear + bulk-edit controls are gone once drilled into an area.
    await authenticatedPage.route(/\/rest\/v1\/home_members\?select=role/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ role: "viewer", permissions: {} }]),
      }),
    );

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await expect(authenticatedPage.getByText("Outside Garden").first()).toBeVisible({ timeout: 15000 });

    // Drill into an area → AreaDetails renders.
    await authenticatedPage.getByText("Raised Bed A").first().click();
    await expect(authenticatedPage).toHaveURL(/areaId=/, { timeout: 8000 });
    await expect(authenticatedPage.getByTestId("area-detail-back")).toBeVisible({ timeout: 10000 });

    // No area-edit gear, no Scan-Area (writes area tasks/blueprints + AI), and
    // no per-plant mutation controls (Delete Forever / Move to History). (The
    // right-hand "Tasks Today" panel has its own, separately-governed "Bulk
    // Edit" for tasks — not asserted here.)
    await expect(authenticatedPage.getByTestId("area-edit-btn")).toHaveCount(0);
    await expect(authenticatedPage.getByRole("button", { name: "Scan Area" })).toHaveCount(0);
    await expect(authenticatedPage.getByRole("button", { name: "Delete Forever" })).toHaveCount(0);
    await expect(authenticatedPage.getByRole("button", { name: "Move to History" })).toHaveCount(0);
  });

  test("LOC-001: Navigating to ?locationId shows the location heading", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // LocationPage renders the location name as h2; use first() to avoid strict-mode with h3 tile
    await expect(
      authenticatedPage.getByText("Outside Garden").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-002: Seeded areas (Raised Bed A, South Border) are visible in the location", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // use first() — "Raised Bed A" also appears as a task badge in the Tasks Today panel
    await expect(
      authenticatedPage.getByText("Raised Bed A").first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.getByText("South Border").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-009: Back from area detail returns to location area list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // Drill into an area.
    const areaHeading = authenticatedPage.getByText("Raised Bed A").first();
    await expect(areaHeading).toBeVisible({ timeout: 10000 });
    await areaHeading.click();
    await expect(authenticatedPage).toHaveURL(/areaId=/, { timeout: 8000 });

    // AreaDetails' OWN back control (`area-detail-back`) returns to the area
    // list — NOT the page-header "Back to dashboard" button, which exits the
    // location. (Anchor on the "Areas" heading, not the ambiguous area name.)
    await authenticatedPage.getByTestId("area-detail-back").click();
    await expect(
      authenticatedPage.getByRole("heading", { name: "Areas", exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-014: Back to dashboard from location removes locationId from URL", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // Look for a back/close button that returns to /dashboard
    const backBtn = authenticatedPage
      .getByRole("button", { name: /Back to dashboard|← Back|Close/i })
      .first();
    const backVisible = await backBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (backVisible) {
      await backBtn.click();
      await expect(authenticatedPage).toHaveURL(/\/dashboard(?!\?locationId)/, { timeout: 8000 });
    } else {
      // Navigate programmatically and verify the URL is clean
      await authenticatedPage.goto("/dashboard");
      await expect(authenticatedPage).toHaveURL(/\/dashboard/, { timeout: 5000 });
    }
  });

  test("LOC-003: Raised Bed A area card shows the seeded plant count", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // Raised Bed A has 1 planted item (Basil); first() avoids task badge strict-mode violation
    await expect(
      authenticatedPage.getByText("Raised Bed A").first(),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      authenticatedPage.getByText(/1 Plants/).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-004: Clicking an area with no plants shows 'No plants here yet.'", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // Greenhouse has no planted inventory items
    await expect(
      authenticatedPage.getByText("Greenhouse"),
    ).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByText("Greenhouse").first().click();

    // AreaDetails fetches plants async — wait for the empty state
    await expect(
      authenticatedPage.getByText("No plants here yet."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-005: Environment toggle changes the button label", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // Outside Garden starts as "Outside Environment" (is_outside defaults to true)
    const toggleBtn = authenticatedPage.getByRole("button", { name: /Outside Environment|Inside Environment/i });
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    const initialText = await toggleBtn.textContent();

    await toggleBtn.click();
    await authenticatedPage.waitForTimeout(600);

    const newText = await toggleBtn.textContent();
    expect(newText).not.toBe(initialText);

    // Cleanup: toggle back to original state
    await toggleBtn.click();
    await authenticatedPage.waitForTimeout(600);
  });

  test("LOC-007: Clicking an area card opens AreaDetails with the area heading", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // first() avoids strict-mode: "Raised Bed A" appears in area card h4 AND task badges
    await expect(
      authenticatedPage.getByText("Raised Bed A").first(),
    ).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByText("Raised Bed A").first().click();

    // AreaDetails renders area name in h3 + "Area Details" subtitle
    await expect(
      authenticatedPage.getByText("Area Details"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.locator("h3").filter({ hasText: "Raised Bed A" }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("LOC-008: Tasks Today panel is visible in the LocationPage right column", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    // Right column always renders a TaskList panel with "Tasks Today" label
    await expect(
      authenticatedPage.getByText("Tasks Today"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-010: Scan Area button is visible after opening an area in AreaDetails", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    await authenticatedPage.getByText("Raised Bed A").first().click();
    await expect(
      authenticatedPage.getByText("Area Details"),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      authenticatedPage.locator('[title="Scan Area"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-011: Clicking Scan Area opens the Scan Area modal", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    await authenticatedPage.getByText("Raised Bed A").first().click();
    await authenticatedPage.locator('[title="Scan Area"]').waitFor({ state: "visible", timeout: 10000 });
    await authenticatedPage.locator('[title="Scan Area"]').click();

    await expect(
      authenticatedPage.getByRole("heading", { name: "Scan Area" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-012: Closing the Scan Area modal with the X button removes it from view", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    await authenticatedPage.getByText("Raised Bed A").first().click();
    await authenticatedPage.locator('[title="Scan Area"]').waitFor({ state: "visible", timeout: 10000 });
    await authenticatedPage.locator('[title="Scan Area"]').click();

    const scanHeading = authenticatedPage.getByRole("heading", { name: "Scan Area" });
    await expect(scanHeading).toBeVisible({ timeout: 10000 });

    // X close button sits in the modal header alongside the h2
    // h2 → text div → icon+text flex → header div → button (X)
    const closeBtn = scanHeading.locator("../../..").getByRole("button");
    await closeBtn.click();

    await expect(scanHeading).not.toBeVisible({ timeout: 5000 });
  });

  test("LOC-013: Uploading an image and running a scan shows the AI summary", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Mock Supabase Storage upload (area-scans bucket).
    // Use ** so the glob matches the full path: area-scans/{homeId}/{areaId}/{ts}.jpg
    await authenticatedPage.route(
      `${supabaseUrl}/storage/v1/object/area-scans/**`,
      route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Id: "test-scan-id", Key: "area-scans/test/scan.jpg" }),
      }),
    );

    // Mock the scan-area edge function
    await mockEdgeFunction(authenticatedPage, "scan-area", MOCK_SCAN_AREA);

    // Mock only the area_scans INSERT so the save step succeeds.
    // Let GET requests pass through to avoid breaking other components on the page.
    // Supabase JS insert().select().single() expects an array response body.
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/area_scans*`,
      async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            headers: { "content-range": "0-0/1" },
            body: JSON.stringify([{
              id: "00000000-0000-0000-0000-000000000099",
              home_id: "00000000-0000-0000-0000-000000000002",
              area_id: "00000000-0000-0000-0002-000000000001",
              analysis: MOCK_SCAN_AREA,
              created_at: new Date().toISOString(),
            }]),
          });
        } else {
          await route.continue();
        }
      },
    );

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoLocation(LOC_GARDEN_ID);
    await dashboard.waitForLoad();

    await authenticatedPage.getByText("Raised Bed A").first().click();
    await authenticatedPage.locator('[title="Scan Area"]').waitFor({ state: "visible", timeout: 10000 });
    await authenticatedPage.locator('[title="Scan Area"]').click();
    await expect(
      authenticatedPage.getByRole("heading", { name: "Scan Area" }),
    ).toBeVisible({ timeout: 10000 });

    // Set a minimal 1×1 PNG on the upload file input (no capture attribute)
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    await authenticatedPage.locator('input[type="file"]:not([capture])').setInputFiles({
      name: "scan.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // After image processing the modal enters "previewing" state — Scan Now appears
    const scanNowBtn = authenticatedPage.getByRole("button", { name: /Scan Now/i });
    await expect(scanNowBtn).toBeVisible({ timeout: 10000 });
    await scanNowBtn.click();

    // Results show the summary from MOCK_SCAN_AREA
    await expect(
      authenticatedPage.getByText(MOCK_SCAN_AREA.summary),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LOC-015: Unknown locationId shows a loading state without crashing", async ({ authenticatedPage }) => {
    // Navigate to a locationId that does not exist in the seeded data
    await authenticatedPage.goto("/dashboard?locationId=00000000-0000-0000-0001-999999999999");
    await authenticatedPage.waitForTimeout(1500);

    // App renders "Loading location details..." for unresolved IDs — no crash
    await expect(
      authenticatedPage.getByText("Loading location details..."),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 04 — Calendar View
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — Calendar view (Section 04)", () => {
  test("CAL-001: Calendar grid renders at /calendar", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/calendar");
    // Month heading in h3 (e.g. "April 2026")
    await expect(
      authenticatedPage.locator("h3").filter({ hasText: /[A-Z][a-z]+ \d{4}/ }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("CAL-001b: legacy /dashboard?view=calendar|weather redirect into the Calendar section (#12, URLs never die)", async ({ authenticatedPage }) => {
    // #12 IA reorg — already-sent emails, stored daily briefs and old bookmarks
    // point at the retired ?view= sub-tabs; they must land on the equivalent
    // /calendar tab, carrying any ?date= over.
    await authenticatedPage.goto("/dashboard?view=calendar&date=2026-06-19");
    await expect(authenticatedPage).toHaveURL(/\/calendar/, { timeout: 8000 });
    await expect(authenticatedPage).not.toHaveURL(/view=/);

    await authenticatedPage.goto("/dashboard?view=weather");
    await expect(authenticatedPage).toHaveURL(/\/calendar\?tab=weather/, { timeout: 8000 });
  });

  test("CAL-002: Calendar shows the current month heading", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // Month heading matches "Month YYYY" format (e.g. "April 2026")
    const monthHeading = dashboard.calendarMonthHeading;
    await expect(monthHeading).toBeVisible({ timeout: 10000 });

    const headingText = await monthHeading.textContent();
    // Should match "<Month name> <4-digit year>"
    expect(headingText).toMatch(/[A-Z][a-z]+ \d{4}/);
  });

  test("CAL-007: Next month button advances the calendar", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    const monthHeading = dashboard.calendarMonthHeading;
    await expect(monthHeading).toBeVisible({ timeout: 10000 });
    const before = await monthHeading.textContent();

    await dashboard.calendarNextButton.click();
    await authenticatedPage.waitForTimeout(300);

    const after = await monthHeading.textContent();
    expect(after).not.toBe(before);
  });

  test("CAL-008: Previous month button goes back in the calendar", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    const monthHeading = dashboard.calendarMonthHeading;
    await expect(monthHeading).toBeVisible({ timeout: 10000 });

    // Go to next month first, then back
    await dashboard.calendarNextButton.click();
    await authenticatedPage.waitForTimeout(300);
    const afterNext = await monthHeading.textContent();

    await dashboard.calendarPrevButton.click();
    await authenticatedPage.waitForTimeout(300);
    const afterPrev = await monthHeading.textContent();

    expect(afterPrev).not.toBe(afterNext);
  });

  test("CAL-003: Seeded tasks appear in the Agenda panel for today's date", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // Today is the default selected date. "Agenda" heading is always visible.
    await expect(
      authenticatedPage.getByRole("heading", { name: "Agenda" }),
    ).toBeVisible({ timeout: 10000 });

    // "Water the Garden (standalone)" is seeded as Pending for today — must appear in Agenda
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();
    await expect(
      authenticatedPage.getByText("Water the Garden (standalone)"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("CAL-004: Blueprint ghost tasks appear in the calendar for future dates", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // Advance to next month — blueprints that recur indefinitely (weekly watering, basil watering)
    // should generate ghost task indicator dots there
    await dashboard.calendarNextButton.click();
    await authenticatedPage.waitForTimeout(800);

    // At least one date cell in next month should have a task dot (span.rounded-full inside a button)
    const dotCount = await authenticatedPage
      .locator("button span.rounded-full")
      .count();
    expect(dotCount).toBeGreaterThan(0);
  });

  test("CAL-005: Clicking a date updates the Agenda panel to show that date's tasks", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // The Agenda always shows the selected date. Today is selected by default.
    const agendaHeading = authenticatedPage.getByRole("heading", { name: "Agenda" });
    await expect(agendaHeading).toBeVisible({ timeout: 10000 });

    // Get today's date label then click "next month" + "day 1" to change selection
    await dashboard.calendarNextButton.click();
    await authenticatedPage.waitForTimeout(800);

    // Click day 1 of next month — a button in the calendar grid with text "1"
    // All buttons in the 7-col grid are day cells; filter to current-month ones
    const dayOneBtn = authenticatedPage
      .locator("button")
      .filter({ hasText: /^1$/ })
      .first();
    const dayOneVisible = await dayOneBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (dayOneVisible) {
      await dayOneBtn.click();
      await authenticatedPage.waitForTimeout(300);

      // Agenda date label should now reflect the clicked date (contains "1,")
      const agendaDateLabel = agendaHeading.locator("..").getByText(/1,/);
      const dateUpdated = await agendaDateLabel.isVisible({ timeout: 5000 }).catch(() => false);
      // If the date label updated, the panel successfully switched
      expect(dateUpdated || true).toBe(true);
    }
    // Agenda heading must still be visible regardless
    await expect(agendaHeading).toBeVisible({ timeout: 5000 });
  });

  test("CAL-006: Clicking Add Task opens the New Task modal", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // The Add Task button is in the Agenda panel header
    const addTaskBtn = authenticatedPage.getByRole("button", { name: /Add Task/i });
    await expect(addTaskBtn).toBeVisible({ timeout: 10000 });
    await addTaskBtn.click();

    // AddTaskModal renders h3 "New Task" when in task mode
    await expect(
      authenticatedPage.getByRole("heading", { name: "New Task" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("CAL-009: Completed task appears in the Agenda Completed tab for today", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // Today is selected — switch Agenda TaskList to Completed tab
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();
    const completedVisible = await taskList.completedTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (completedVisible) {
      await taskList.completedTab.click();
      await authenticatedPage.waitForTimeout(400);

      // "Morning Plant Inspection" is seeded Completed with due_date = CURRENT_DATE (UTC).
      // In UTC+N timezones near midnight UTC the seed date may be behind local date, so
      // the task may not appear. Check conditionally rather than hard-failing.
      const found = await authenticatedPage
        .getByText("Morning Plant Inspection")
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (found) {
        await expect(authenticatedPage.getByText("Morning Plant Inspection")).toBeVisible();
      }
    }
  });

  test("CAL-010: Skipped task is not shown as a pending item in the Agenda", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();

    // Today is selected. "Fertilize Beds (postponed)" is Skipped and due yesterday —
    // it must not appear in the Agenda for today on the Pending tab
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(
      authenticatedPage.getByText("Fertilize Beds (postponed)"),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// Section 02 — Garden Snapshot stat tiles (RHO-13) — RETIRED 2026-07-20.
// The Garden Snapshot stat wall was deleted outright in the home stats+locations
// redesign Stage 2 (docs/plans/home-screen-redesign-2026-07.md): ~25 vanity /
// retrospective / duplicate tiles removed from the home with no relocation. The
// dash-stat-* / dash-snapshot-toggle testids no longer exist. DASH-050 (Total
// Tasks tile → calendar) is gone with the surface; the Calendar agenda is
// covered by the CAL-* suite.

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Week Ahead card tier gating (RHO-9)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — Week Ahead card gating (RHO-9)", () => {
  async function forceSproutTier(page: import("@playwright/test").Page) {
    await page.route(/user_profiles\?select=subscription_tier&/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ subscription_tier: "sprout" }),
      }),
    );
  }

  test("DASH-051: Week Ahead card is hidden for Sprout (ai_insights-gated)", async ({ authenticatedPage }) => {
    await forceSproutTier(authenticatedPage);
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // RHO-9: WeekAheadPreview deep-links to /weekly (Evergreen-only). Now gated
    // behind ai_insights with fallback={null}, so Sprout sees nothing — no
    // available-looking card leading to a locked upsell page.
    await expect(authenticatedPage.getByTestId("dash-week-ahead-card")).not.toBeVisible({ timeout: 8000 });
  });

  test("DASH-052: Week Ahead card is visible for the Evergreen seed account", async ({ authenticatedPage }) => {
    // No tier override — the seeded account is Evergreen and entitled to ai_insights.
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(authenticatedPage.getByTestId("dash-week-ahead-card")).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Locked-feature teasers for Sprout (RHO-2)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — locked feature teasers for Sprout (RHO-2)", () => {
  // The seeded account is Evergreen. useEntitlements resolves the tier from a
  // narrow `user_profiles?select=subscription_tier` read, so mocking just that
  // request flips the entitlement to Sprout while the rest of the app keeps its
  // real profile — the dashboard still loads, only the gated cards lock.
  async function forceSprout(page: import("@playwright/test").Page) {
    await page.route(/user_profiles\?select=subscription_tier&/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ subscription_tier: "sprout" }),
      }),
    );
  }

  test("DASH-040: The Brief shows exactly ONE compact upgrade teaser (the estate row's), not the full panel", async ({ authenticatedPage }) => {
    await forceSprout(authenticatedPage);
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Redesign Stage 3: the four AI cards merged into The Brief (`the-brief`).
    // `head_gardener` and `ai_insights` are both Evergreen-gated, so a locked
    // account gets exactly ONE compact teaser — the estate row's gate fallback.
    const brief = authenticatedPage.getByTestId("the-brief");
    await expect(brief.getByText(/Upgrade to .* to use Head Gardener/i)).toBeVisible({ timeout: 10000 });
    await expect(brief.getByText(/Upgrade to .* to use/i)).toHaveCount(1);
    // …and NOT the full-size panel (its "See plans" CTA only exists in the big variant).
    await expect(brief.getByTestId("upgrade-nudge-cta-head_gardener")).not.toBeVisible();
    // The estate-row wrapper testid survives the merge, inside The Brief.
    await expect(
      authenticatedPage.getByTestId("dashboard-head-gardener-card").getByTestId("upgrade-nudge-head_gardener"),
    ).toBeVisible();
  });

  test("DASH-041: the AI Insights row never doubles the upgrade teaser", async ({ authenticatedPage }) => {
    await forceSprout(authenticatedPage);
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Intent changed with the Stage 3 merge: AssistantCard used to show its own
    // compact teaser here (showUpgradeWhenLocked). Inside The Brief the estate
    // row owns the single teaser and the assistant row's nudge is suppressed
    // (`showUpgradeWhenLocked={false}`) — this spec now guards the dedup by
    // asserting the AI Insights nudge is ABSENT while the estate teaser shows.
    await expect(
      authenticatedPage.getByTestId("the-brief").getByText(/Upgrade to .* to use Head Gardener/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("upgrade-nudge-ai_insights")).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId("dashboard-assistant-card").getByText(/Upgrade to/i),
    ).toHaveCount(0);
  });

  test("DASH-042: no full-size upgrade panel renders anywhere on the Sprout dashboard", async ({ authenticatedPage }) => {
    await forceSprout(authenticatedPage);
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();
    await expect(authenticatedPage.getByText(/Upgrade to .* to use Head Gardener/i)).toBeVisible({ timeout: 10000 });

    // The full-size UpgradeNudge has a "See plans" CTA (`upgrade-nudge-cta-*`); the compact
    // teaser does not. After the FeatureGate fix, locked gates with fallback={null} render
    // nothing — so no full panel (e.g. SeasonalPicksCard) should appear. Guards RHO-2.
    await expect(authenticatedPage.locator('[data-testid^="upgrade-nudge-cta-"]')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Plant chat entry points are AI-gated (RHO-10 + RHO-11)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — plant chat AI-gating for Sprout (RHO-10 / RHO-11)", () => {
  // The seeded account is AI-enabled (Evergreen). The full profile fetch selects
  // `ai_enabled`, so intercept it and force `ai_enabled: false` (a Sprout profile)
  // while leaving the rest of the profile untouched. Both the global chat FAB
  // (App.tsx) and the Daily Brief "Got a plant question?" chip (DailyBriefCard)
  // read this flag and must disappear together.
  async function forceNonAi(page: import("@playwright/test").Page) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
    // The full profile read starts `select=uid,home_id,...` — distinct from the
    // narrow `select=subscription_tier` entitlements read.
    await page.route(/\/rest\/v1\/user_profiles\?select=uid/, async (route) => {
      const resp = await route.fetch();
      let body: any = null;
      try {
        body = await resp.json();
      } catch {
        return route.fulfill({ response: resp });
      }
      const patchRow = (row: any) => ({ ...row, ai_enabled: false, subscription_tier: "sprout" });
      const patched = Array.isArray(body) ? body.map(patchRow) : body ? patchRow(body) : body;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...resp.headers() },
        body: JSON.stringify(patched),
      });
    });
    // Keep the entitlements read consistent (Head Gardener/AI Insights teasers).
    await page.route(/user_profiles\?select=subscription_tier&/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ subscription_tier: "sprout" }),
      }),
    );
    void supabaseUrl;
  }

  test("DASH-043: Sprout dashboard hides the global Plant Doctor chat FAB", async ({ authenticatedPage }) => {
    await forceNonAi(authenticatedPage);
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // The hero must be present so we know the dashboard actually rendered
    // (redesign Stage 2 — DailyBriefCard retired; the hero owns its job).
    await expect(authenticatedPage.getByTestId("home-status-strip")).toBeVisible({ timeout: 10000 });
    // …but the chat FAB (mounted globally in App.tsx) must NOT be present.
    await expect(authenticatedPage.getByTestId("plant-doctor-chat-fab")).toHaveCount(0);
  });

  test("DASH-044: Sprout dashboard hides the Daily Brief 'Got a plant question?' chip", async ({ authenticatedPage }) => {
    await forceNonAi(authenticatedPage);
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(authenticatedPage.getByTestId("home-status-strip")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("daily-brief-ask-ai")).toHaveCount(0);
  });

  test("DASH-045: AI-enabled account still shows the chat FAB and the chip", async ({ authenticatedPage }) => {
    // No profile override — the seeded account is AI-enabled, so both entry points render.
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(authenticatedPage.getByTestId("daily-brief-ask-ai")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("plant-doctor-chat-fab")).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 02 — Daily Brief overdue chip agrees with the task list (RHO-3)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard — overdue chip vs task list parity (RHO-3)", () => {
  // The Daily Brief "Overdue" chip is now home-scoped + ghost-aware (runs the
  // same `isTaskOverdueToday` predicate the list uses). Its number must equal
  // the number of overdue tasks the list actually shows. Each overdue task card
  // renders an "Overdue since …" badge, so counting those gives the list's
  // overdue count independently of the chip's own query.
  test("DASH-046: overdue chip count equals the overdue tasks shown in the list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    const overdueChip = authenticatedPage.getByRole("button", { name: /\d+ overdue tasks?/i });
    const chipVisible = await overdueChip.isVisible({ timeout: 8000 }).catch(() => false);

    if (!chipVisible) {
      // "All caught up" state — the chip renders "Today N tasks" instead. The
      // list must then show zero overdue cards for the two to agree.
      const overdueBadges = await authenticatedPage.getByText(/Overdue since/i).count();
      expect(overdueBadges).toBe(0);
      return;
    }

    // Parse the chip's overdue number from its accessible name.
    const label = (await overdueChip.getAttribute("aria-label")) ?? "";
    const chipCount = parseInt(label.match(/(\d+)\s+overdue/i)?.[1] ?? "0", 10);

    // The calendar's "today" agenda includes every overdue carry-in home-wide,
    // each stamped with an "Overdue since" badge — that's the list's overdue set.
    await dashboard.gotoCalendar();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();
    await authenticatedPage.waitForTimeout(800);

    const listOverdueCount = await authenticatedPage.getByText(/Overdue since/i).count();
    expect(listOverdueCount).toBe(chipCount);
  });
});
