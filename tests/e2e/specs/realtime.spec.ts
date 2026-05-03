/**
 * Realtime Tests — Section 15
 *
 * Verifies that Supabase Realtime subscriptions keep the UI in sync when
 * database rows are mutated via the REST API (simulating changes from
 * another device or a server-side edge function).
 *
 * Requires:
 *   VITE_SUPABASE_URL     — local Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for test mutations)
 *   TEST_USER_PASSWORD    — shared test account password
 *
 * Local Supabase default service role key can be obtained via:
 *   supabase status
 *
 * Seeds:
 *   01_locations_areas.sql — Outside Garden (3 areas: Raised Bed A, South Border, Greenhouse)
 *   03_tasks_blueprints.sql — TASK_PENDING "Water the Garden (standalone)", Pending, due today
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { DashboardPage } from "../pages/DashboardPage";

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;

// Worker-specific UUIDs (see seed-test-db.mjs for the prefix substitution logic)
const HOME_ID         = `0000000${workerNum}-0000-0000-0000-000000000002`;
const LOC_GARDEN_ID   = `0000000${workerNum}-0000-0000-0001-000000000001`;
const AREA_GREENHOUSE = `0000000${workerNum}-0000-0000-0002-000000000003`;
const TASK_PENDING_ID = `0000000${workerNum}-0000-0000-0006-000000000001`;

function supabaseHeaders(serviceKey: string) {
  return {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RT-001 — Area deleted → dashboard location tile area count updates
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Realtime — Section 15", () => {
  test("RT-001: delete area via API → dashboard location tile area count decrements", async ({
    authenticatedPage,
    request,
  }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY not set — skipping realtime test");
      return;
    }

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Verify the Outside Garden tile shows 3 areas (from seed 01)
    const areaCountLocator = authenticatedPage.locator(
      `[data-testid="location-${LOC_GARDEN_ID}-areas-count"]`,
    );
    await expect(areaCountLocator).toHaveText("3", { timeout: 10000 });

    // Delete Greenhouse area via REST API (bypasses RLS)
    const deleteRes = await request.delete(
      `${supabaseUrl}/rest/v1/areas?id=eq.${AREA_GREENHOUSE}`,
      { headers: supabaseHeaders(serviceKey) },
    );
    expect(deleteRes.ok()).toBeTruthy();

    // Realtime subscription fires → fetchDashboardData() → area count updates
    await expect(areaCountLocator).toHaveText("2", { timeout: 8000 });

    // Restore for seed isolation
    await request.post(`${supabaseUrl}/rest/v1/areas`, {
      headers: supabaseHeaders(serviceKey),
      data: {
        id: AREA_GREENHOUSE,
        location_id: LOC_GARDEN_ID,
        name: "Greenhouse",
        growing_medium: "Peat",
        medium_ph: 5.8,
        light_intensity_lux: 20000,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RT-002 — Task completed via API → TaskList removes it from Pending view
  // ─────────────────────────────────────────────────────────────────────────

  test("RT-002: complete task via API → task disappears from today's pending list", async ({
    authenticatedPage,
    request,
  }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY not set — skipping realtime test");
      return;
    }

    await authenticatedPage.goto("/dashboard");
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // "Water the Garden (standalone)" is a Pending task due today — visible in task list
    const taskText = authenticatedPage.getByText("Water the Garden (standalone)");
    await expect(taskText).toBeVisible({ timeout: 10000 });

    // Mark it Completed via REST API
    const updateRes = await request.patch(
      `${supabaseUrl}/rest/v1/tasks?id=eq.${TASK_PENDING_ID}`,
      {
        headers: supabaseHeaders(serviceKey),
        data: { status: "Completed", completed_at: new Date().toISOString() },
      },
    );
    expect(updateRes.ok()).toBeTruthy();

    // TaskList realtime subscription fires → fetchTasksAndGhostsSilent()
    // The task moves out of the default Pending view
    await expect(taskText).not.toBeVisible({ timeout: 8000 });

    // Restore for seed isolation
    await request.patch(
      `${supabaseUrl}/rest/v1/tasks?id=eq.${TASK_PENDING_ID}`,
      {
        headers: supabaseHeaders(serviceKey),
        data: { status: "Pending", completed_at: null },
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RT-003 — Blueprint added via API → BlueprintManager picks it up
  // ─────────────────────────────────────────────────────────────────────────

  test("RT-003: new blueprint inserted via API → BlueprintManager shows it", async ({
    authenticatedPage,
    request,
  }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY not set — skipping realtime test");
      return;
    }

    await authenticatedPage.goto("/schedule");
    await authenticatedPage
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    const newBpId = `0000000${workerNum}-0000-0000-000f-000000000099`;
    const newBpTitle = "RT-003 Realtime Test Blueprint";

    // Insert a new blueprint via REST API
    const insertRes = await request.post(`${supabaseUrl}/rest/v1/task_blueprints`, {
      headers: supabaseHeaders(serviceKey),
      data: {
        id: newBpId,
        home_id: HOME_ID,
        title: newBpTitle,
        type: "Watering",
        recurrence_days: 7,
        is_archived: false,
      },
    });
    expect(insertRes.ok()).toBeTruthy();

    // BlueprintManager realtime subscription fires → fetchBlueprints()
    await expect(
      authenticatedPage.getByText(newBpTitle),
    ).toBeVisible({ timeout: 8000 });

    // Cleanup
    await request.delete(
      `${supabaseUrl}/rest/v1/task_blueprints?id=eq.${newBpId}`,
      { headers: supabaseHeaders(serviceKey) },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RT-004 — Weather snapshot updated via API → weather tile reflects new temp
  // ─────────────────────────────────────────────────────────────────────────

  test("RT-004: new weather snapshot inserted via API → weather tile refreshes", async ({
    authenticatedPage,
    request,
  }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY not set — skipping realtime test");
      return;
    }

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Build a minimal weather snapshot that will render a known temperature (99°C — unmistakeable)
    const now = new Date();
    const currentHour = now.toISOString().slice(0, 13) + ":00";
    const mockWeatherData = {
      current: { temperature_2m: 99, weathercode: 0, windspeed_10m: 0, precipitation: 0 },
      hourly: {
        time: [currentHour],
        temperature_2m: [99],
        precipitation: [0],
        weathercode: [0],
        windspeed_10m: [0],
        precipitation_probability: [0],
      },
      daily: {
        time: [now.toISOString().slice(0, 10)],
        temperature_2m_max: [99],
        temperature_2m_min: [10],
        weathercode: [0],
        precipitation_sum: [0],
        windspeed_10m_max: [0],
        precipitation_probability_max: [0],
        sunrise: ["06:00"],
        sunset: ["20:00"],
      },
    };

    // Upsert into weather_snapshots — triggers the realtime subscription
    const upsertRes = await request.post(`${supabaseUrl}/rest/v1/weather_snapshots`, {
      headers: { ...supabaseHeaders(serviceKey), Prefer: "resolution=merge-duplicates" },
      data: {
        id: `0000000${workerNum}-0000-0000-000a-000000000001`,
        home_id: HOME_ID,
        data: mockWeatherData,
        created_at: new Date().toISOString(),
      },
    });
    expect(upsertRes.ok()).toBeTruthy();

    // Weather subscription fires → fetchDashboardData() → weather state updates
    // 99°C is unmistakable — wait for it in the weather tile
    await expect(
      authenticatedPage.getByText(/99.*°C|99°C/),
    ).toBeVisible({ timeout: 10000 });
  });
});
