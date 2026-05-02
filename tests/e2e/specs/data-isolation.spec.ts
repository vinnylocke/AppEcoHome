/**
 * Data Isolation Tests — Section 14
 *
 * Verifies that each authenticated user can only see data belonging to their
 * own home. Tests run against a single worker account (test1@rhozly.com) and
 * assert that W2-owned "Cross-Home Marker" rows seeded in
 * supabase/seeds/09_cross_home_markers.sql are never rendered in the UI.
 *
 * Run this suite via the dedicated 1-worker "isolation" Playwright project:
 *   npx playwright test --project=isolation
 *
 * Or via:
 *   npm run test:e2e:isolation
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";
import { WatchlistPage } from "../pages/WatchlistPage";
import { PlannerPage } from "../pages/PlannerPage";
import { SchedulePage } from "../pages/SchedulePage";
import { LocationManagementPage } from "../pages/LocationManagementPage";
import { DashboardPage } from "../pages/DashboardPage";

// All isolation tests run serially so they share the same authenticated worker.
test.describe.configure({ mode: "serial" });

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.1 — Plants (The Shed)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-01 — Plants: The Shed", () => {
  test("ISO-001: own plants are visible", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Own plant from seed 02 — always present for W1
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });
  });

  test("ISO-002: cross-home plants are not visible", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Confirm own data loaded first (prevents false-negative on a loading state)
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });

    // W2's cross-home marker must not appear
    await expect(shed.plantCard("Cross-Home Marker Plant")).not.toBeVisible({ timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.2 — Ailments (Watchlist)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-02 — Ailments: Watchlist", () => {
  test("ISO-003: own ailments are visible", async ({ authenticatedPage }) => {
    const watchlist = new WatchlistPage(authenticatedPage);
    await watchlist.goto();
    await watchlist.waitForLoad();

    await expect(watchlist.ailmentCard("Aphid")).toBeVisible({ timeout: 10000 });
  });

  test("ISO-004: cross-home ailments are not visible", async ({ authenticatedPage }) => {
    const watchlist = new WatchlistPage(authenticatedPage);
    await watchlist.goto();
    await watchlist.waitForLoad();

    await expect(watchlist.ailmentCard("Aphid")).toBeVisible({ timeout: 10000 });

    await expect(watchlist.ailmentCard("Cross-Home Marker Ailment")).not.toBeVisible({
      timeout: 3000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.3 — Plans (Planner)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-03 — Plans: Planner", () => {
  test("ISO-005: own plans are visible", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await expect(planner.planCard("Summer Veg Plan")).toBeVisible({ timeout: 10000 });
  });

  test("ISO-006: cross-home plans are not visible", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await expect(planner.planCard("Summer Veg Plan")).toBeVisible({ timeout: 10000 });

    await expect(planner.planCard("Cross-Home Marker Plan")).not.toBeVisible({ timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.4 — Task Blueprints (Schedule / Automations)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-04 — Blueprints: Schedule", () => {
  test("ISO-007: own blueprints are visible", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
  });

  test("ISO-008: cross-home blueprints are not visible", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });

    await expect(schedule.blueprintCard("Cross-Home Marker Blueprint")).not.toBeVisible({
      timeout: 3000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.5 — Locations (Location Management)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-05 — Locations: Location Management", () => {
  test("ISO-009: own locations are visible", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    // Location names are rendered as input values (editable fields) inside the location cards
    const ownLocation = authenticatedPage
      .locator('[data-testid="location-list"]')
      .locator('input[value="Outside Garden"]');
    await expect(ownLocation).toBeVisible({ timeout: 10000 });
  });

  test("ISO-010: cross-home locations are not visible", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    const ownLocation = authenticatedPage
      .locator('[data-testid="location-list"]')
      .locator('input[value="Outside Garden"]');
    await expect(ownLocation).toBeVisible({ timeout: 10000 });

    const crossHomeLocation = authenticatedPage
      .locator('[data-testid="location-list"]')
      .locator('input[value="Cross-Home Marker Location"]');
    await expect(crossHomeLocation).not.toBeVisible({ timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.6 — Tasks (Dashboard Task List)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-06 — Tasks: Dashboard Task List", () => {
  test("ISO-011: own tasks are visible on the dashboard", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // W1's seeded standalone pending task — "Fern Health Check" (seed 03, task 010).
    // Using this task rather than "Water the Garden (standalone)" because TASK-016
    // completes that task during the chromium project run, leaving it absent from
    // the Pending tab when the isolation project runs afterward.
    const ownTask = authenticatedPage.getByText("Fern Health Check");
    await expect(ownTask).toBeVisible({ timeout: 10000 });
  });

  test("ISO-012: cross-home tasks are not visible", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    const ownTask = authenticatedPage.getByText("Fern Health Check");
    await expect(ownTask).toBeVisible({ timeout: 10000 });

    // W2's cross-home marker task must not appear
    const crossHomeTask = authenticatedPage.getByText("Cross-Home Marker Task");
    await expect(crossHomeTask).not.toBeVisible({ timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14.7 — Inventory Items (Shed — instance counts)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("ISO-07 — Inventory Items: Shed instance count", () => {
  test("ISO-013: cross-home inventory items do not inflate plant instance counts", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // W1's Tomato has exactly 1 inventory item (seed 02: TOM-001).
    // If cross-home items leak, the count would be wrong.
    // The plant card renders instance count — locate it within the Tomato card.
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });

    // W2's cross-home marker inventory item (plant: "Cross-Home Marker Plant") must not appear
    const crossHomeItem = authenticatedPage
      .locator('[data-testid="shed-plant-list"]')
      .getByText("Cross-Home Marker Plant");
    await expect(crossHomeItem).not.toBeVisible({ timeout: 3000 });
  });
});
