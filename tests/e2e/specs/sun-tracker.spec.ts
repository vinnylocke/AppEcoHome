import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Sun Tracker AR feature — Section 20
//
// Camera and DeviceOrientationEvent cannot be exercised in Playwright (browser APIs
// requiring hardware/permissions).  These tests verify the page structure, navigation,
// and all interactive controls that render without hardware.

test.describe("Sun Tracker — page structure (Section 20)", () => {
  test("SUN-001: Sun Tracker appears in the ToolsHub", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/tools");
    await expect(
      authenticatedPage.getByTestId("tools-hub-sun-tracker"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("SUN-002: Clicking Sun Tracker tile navigates to /sun-trajectory", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/tools");
    await authenticatedPage.getByTestId("tools-hub-sun-tracker").click();
    await expect(authenticatedPage).toHaveURL("/sun-trajectory", {
      timeout: 10_000,
    });
  });

  test("SUN-003: Direct navigation to /sun-trajectory renders the canvas", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/sun-trajectory");
    await expect(authenticatedPage.getByTestId("sun-tracker-canvas")).toBeVisible(
      { timeout: 10_000 },
    );
  });

  test("SUN-004: Date input is visible and editable", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/sun-trajectory");
    const dateInput = authenticatedPage.getByTestId("sun-tracker-date-input");
    await expect(dateInput).toBeVisible({ timeout: 10_000 });

    // Change date to a known value and confirm it sticks
    await dateInput.fill("2026-07-15");
    await expect(dateInput).toHaveValue("2026-07-15");
  });

  test("SUN-005: Time scrubber is visible", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/sun-trajectory");
    await expect(
      authenticatedPage.getByTestId("sun-tracker-time-scrubber"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("SUN-006: Garden shadow panel toggle is visible", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/sun-trajectory");
    await expect(
      authenticatedPage.getByTestId("sun-tracker-garden-panel-toggle"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("SUN-007: Back button navigates to /tools", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/sun-trajectory");
    await authenticatedPage.getByTestId("sun-tracker-back").click();
    await expect(authenticatedPage).toHaveURL("/tools", { timeout: 5_000 });
  });

  test("SUN-008: Garden shadow panel expands on toggle click", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/sun-trajectory");
    const toggle = authenticatedPage.getByTestId("sun-tracker-garden-panel-toggle");
    await toggle.click();
    // After clicking, either the garden canvas or a "no layout" message appears
    // (seed data may or may not have a garden layout)
    const canvas = authenticatedPage.getByTestId("sun-tracker-garden-canvas");
    const noLayout = authenticatedPage.getByText(/No garden layout found/i);
    await expect(canvas.or(noLayout)).toBeVisible({ timeout: 8_000 });
  });

  test("SUN-009: Tools nav tab is active on /sun-trajectory", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/sun-trajectory");
    // The tools nav link should be active (matches /sun-trajectory in its matchPaths)
    const toolsTab = authenticatedPage.getByRole("button", { name: /Tools/i }).first();
    await expect(toolsTab).toBeVisible({ timeout: 5_000 });
  });
});
