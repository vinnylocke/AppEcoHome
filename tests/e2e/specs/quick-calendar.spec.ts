import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// Mobile Quick Access Wave 3 — Localized Task Calendar.
//
// Covers:
//  - Today tile on /quick is now live (was a placeholder in Wave 2)
//  - /quick/calendar renders the three sub-cards
//  - Frost dates load + render (mocked plant-doctor response)
//  - Submitting a plant name in the planting card produces a guidance result
//  - Back button on the calendar returns to /quick

const MOBILE_VIEWPORT = { width: 375, height: 812 };

const MOCK_FROST_DATES = {
  last_frost_iso: "2026-04-12",
  first_frost_iso: "2026-10-26",
  growing_season_days: 197,
  notes: null,
  rain_skip_mm: 5,
  rain_water_mm: 1,
  from_cache: true,
};

const MOCK_PLANTING_GUIDANCE = {
  plant_name: "Tomato",
  scientific_name: "Solanum lycopersicum",
  can_plant_outdoors_now: false,
  earliest_outdoor_date: "2026-05-15",
  latest_outdoor_date: "2026-07-15",
  indoor_start_recommended: true,
  indoor_start_date: "2026-03-15",
  spacing_cm: 45,
  depth_cm: 1,
  sun_requirement: "full sun",
  tips: [
    "Harden off before transplanting outdoors.",
    "Mulch around the base to retain moisture.",
  ],
};

test.describe("Quick Calendar — mobile routing", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("QUICK-CAL-001: the dashboard Today tile navigates to /quick/calendar", async ({ authenticatedPage }) => {
    // Mock the edge fn call so the calendar screen renders fully.
    await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_FROST_DATES);

    // The launcher lives on the responsive dashboard now (the /quick home was
    // retired 2026-07-20); the "Today" tile opens the planting helper.
    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.getByTestId("home-quick-tile-today").click();
    await expect(authenticatedPage).toHaveURL(/\/quick\/calendar$/);
    await expect(authenticatedPage.getByTestId("localized-task-calendar")).toBeVisible();
  });

  test("QUICK-CAL-002: /quick/calendar renders all three sub-cards", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_FROST_DATES);

    await authenticatedPage.goto("/quick/calendar");
    await expect(authenticatedPage.getByTestId("planting-calendar-card")).toBeVisible();
    // RainWaterAdvice may take a beat — Supabase queries run on mount.
    await expect(authenticatedPage.getByTestId("rain-water-advice")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("quick-calendar-tasks")).toBeVisible();
  });

  test("QUICK-CAL-003: planting card renders the frost dates after lookup", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_FROST_DATES);

    await authenticatedPage.goto("/quick/calendar");
    await expect(authenticatedPage.getByTestId("planting-calendar-last-frost")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("planting-calendar-first-frost")).toBeVisible();
    await expect(authenticatedPage.getByTestId("planting-calendar-last-frost")).toContainText("12");
  });

  test("QUICK-CAL-004: submitting a plant name renders the guidance result", async ({ authenticatedPage }) => {
    // First mock returns frost dates (initial load), then planting guidance (submit).
    // The route handler is called once per request; the second matching call uses
    // the override below. The simplest approach: queue both responses on the same
    // route.
    let callCount = 0;
    await authenticatedPage.route("**/functions/v1/plant-doctor", (route) => {
      callCount++;
      const body = callCount === 1 ? MOCK_FROST_DATES : MOCK_PLANTING_GUIDANCE;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await authenticatedPage.goto("/quick/calendar");
    await expect(authenticatedPage.getByTestId("planting-calendar-last-frost")).toBeVisible({ timeout: 10000 });

    await authenticatedPage.getByTestId("planting-calendar-input").fill("tomato");
    await authenticatedPage.getByTestId("planting-calendar-submit").click();

    await expect(authenticatedPage.getByTestId("planting-calendar-result")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("planting-calendar-verdict")).toContainText(/Hold off|Safe to plant/);
    await expect(authenticatedPage.getByText("Harden off before transplanting outdoors.")).toBeVisible();
  });

  test("QUICK-CAL-005: back button on the calendar returns to /dashboard", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_FROST_DATES);
    await authenticatedPage.goto("/quick/calendar");
    await authenticatedPage.getByTestId("quick-calendar-back").click();
    await expect(authenticatedPage).toHaveURL(/\/dashboard$/);
  });

  test("QUICK-CAL-006: Add button opens QuickAddTaskModal and saving inserts a task", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_FROST_DATES);
    await authenticatedPage.goto("/quick/calendar");

    // Open the modal.
    await authenticatedPage.getByTestId("quick-calendar-add-task").click();
    await expect(authenticatedPage.getByTestId("quick-add-task-modal")).toBeVisible();

    // Save is disabled until a title is entered.
    await expect(authenticatedPage.getByTestId("quick-add-task-save")).toBeDisabled();

    const title = `Playwright quick task ${Date.now()}`;
    await authenticatedPage.getByTestId("quick-add-task-title-input").fill(title);
    await authenticatedPage.getByTestId("quick-add-task-type-Watering").click();
    await expect(authenticatedPage.getByTestId("quick-add-task-save")).toBeEnabled();

    await authenticatedPage.getByTestId("quick-add-task-save").click();

    // Toast confirms save + modal closes.
    await expect(authenticatedPage.getByText("Task added")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId("quick-add-task-modal")).not.toBeVisible();

    // The new task appears in Today's tasks via the TaskList remount.
    await expect(authenticatedPage.getByText(title)).toBeVisible({ timeout: 10000 });
  });
});
