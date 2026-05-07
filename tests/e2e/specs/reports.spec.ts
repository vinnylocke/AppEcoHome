import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Garden Reports feature — Section 21
//
// Reports fetch live data from Supabase. Tests verify navigation, structure,
// and interactive controls. Actual metric values are data-dependent and not
// asserted — seed data (tasks/plants) may or may not fall in the selected period.

test.describe("Garden Reports — page structure (Section 21)", () => {
  test("RPT-001: Reports tab is visible in PlannerHub", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner");
    await expect(
      authenticatedPage.getByTestId("planner-hub-tab-reports"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("RPT-002: Clicking Reports tab shows the monthly view", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner");
    await authenticatedPage.getByTestId("planner-hub-tab-reports").click();
    await expect(
      authenticatedPage.getByTestId("reports-monthly-view"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("RPT-003: Direct URL /planner?tab=reports loads reports", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    await expect(
      authenticatedPage.getByTestId("reports-view-toggle"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("RPT-004: Month navigator prev/next buttons are visible", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    await expect(
      authenticatedPage.getByTestId("reports-month-prev"),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      authenticatedPage.getByTestId("reports-month-next"),
    ).toBeVisible();
  });

  test("RPT-005: Clicking prev month changes the month label", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    const nav = authenticatedPage.getByTestId("reports-month-navigator");
    await nav.waitFor({ timeout: 8_000 });
    const before = await nav.textContent();

    await authenticatedPage.getByTestId("reports-month-prev").click();
    const after = await nav.textContent();
    expect(after).not.toBe(before);
  });

  test("RPT-006: Year in Review toggle switches view", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    await authenticatedPage.getByTestId("reports-toggle-yearly").click();
    await expect(
      authenticatedPage.getByTestId("reports-yearly-view"),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("RPT-007: Year navigator is visible in yearly view", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    await authenticatedPage.getByTestId("reports-toggle-yearly").click();
    await expect(
      authenticatedPage.getByTestId("reports-year-navigator"),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("RPT-008: Prev year button changes the year label", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    await authenticatedPage.getByTestId("reports-toggle-yearly").click();
    const nav = authenticatedPage.getByTestId("reports-year-navigator");
    await nav.waitFor({ timeout: 8_000 });
    const before = await nav.textContent();

    await authenticatedPage.getByTestId("reports-year-prev").click();
    const after = await nav.textContent();
    expect(after).not.toBe(before);
  });

  test("RPT-009: Monthly view shows the stat grid after loading", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    // Either stat grid or empty state should appear once data loads
    const grid = authenticatedPage.getByTestId("reports-stat-grid");
    const empty = authenticatedPage.getByText(/No data yet/i);
    await expect(grid.or(empty)).toBeVisible({ timeout: 12_000 });
  });

  test("RPT-010: Switching back from yearly to monthly restores monthly view", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/planner?tab=reports");
    await authenticatedPage.getByTestId("reports-toggle-yearly").click();
    await expect(
      authenticatedPage.getByTestId("reports-yearly-view"),
    ).toBeVisible({ timeout: 8_000 });

    await authenticatedPage.getByTestId("reports-toggle-monthly").click();
    await expect(
      authenticatedPage.getByTestId("reports-monthly-view"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
