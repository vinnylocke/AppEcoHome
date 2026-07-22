import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Global "Today's Tasks" tray (dashboard-nav-tasks-tray redesign Stage 2,
// 2026-07-21). A right-anchored drawer reachable from the header trigger on
// every non-focus screen, so today's + overdue tasks are one tap away no matter
// where you are. Built on ModalShell's `drawer` variant; body is the shared
// compact TaskList; a quick-add opens the slim QuickAddTaskModal.
// Seeds: 03_tasks_blueprints.sql provides today's + overdue tasks.

test.describe("Today's Tasks tray (Section 34)", () => {
  test("TRAY-001: the header trigger opens the tray from a non-home screen, then closes", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    const trigger = authenticatedPage.getByTestId("today-tasks-tray-trigger");
    await expect(trigger).toBeVisible({ timeout: 15000 });
    await trigger.click();

    const tray = authenticatedPage.getByTestId("today-tasks-tray");
    await expect(tray).toBeVisible({ timeout: 10000 });
    await expect(tray.getByRole("heading", { name: "Today's tasks" })).toBeVisible();

    await authenticatedPage.getByTestId("today-tray-close").click();
    await expect(tray).toHaveCount(0);
  });

  test("TRAY-002: the tray lists tasks with inline complete + postpone (act without leaving the screen)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.getByTestId("today-tasks-tray-trigger").click();
    const tray = authenticatedPage.getByTestId("today-tasks-tray");
    await expect(tray).toBeVisible({ timeout: 10000 });

    const firstRow = tray.locator('[data-testid^="task-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    // Same per-row inline actions the home compact list carries.
    await expect(firstRow.getByRole("button", { name: /Mark task .* as (complete|incomplete)/i })).toBeVisible();
    await expect(firstRow.getByRole("button", { name: /Postpone task/i }).first()).toBeVisible();
  });

  test("TRAY-003: the tray's quick-add opens the slim Add-task modal", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.getByTestId("today-tasks-tray-trigger").click();
    await expect(authenticatedPage.getByTestId("today-tasks-tray")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("today-tray-quick-add").click();
    await expect(authenticatedPage.getByTestId("quick-add-task-modal")).toBeVisible({ timeout: 10000 });
  });

  test("TRAY-004: the tray's board button jumps to the full calendar", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.getByTestId("today-tasks-tray-trigger").click();
    await expect(authenticatedPage.getByTestId("today-tasks-tray")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("today-tray-open-board").click();
    await expect(authenticatedPage).toHaveURL(/view=calendar/, { timeout: 8000 });
  });

  test("TRAY-005: the Completed tab lists today's completed tasks with inline undo available", async ({ authenticatedPage }) => {
    // Seeded: "Morning Plant Inspection" — Inspection, Completed, due today
    // (03_tasks_blueprints.sql) — so the Completed tab is deterministic.
    await authenticatedPage.goto("/shed");
    await authenticatedPage.getByTestId("today-tasks-tray-trigger").click();
    const tray = authenticatedPage.getByTestId("today-tasks-tray");
    await expect(tray).toBeVisible({ timeout: 10000 });

    // The Today view excludes completed tasks…
    await expect(tray.getByText("Morning Plant Inspection")).toHaveCount(0);

    // …the Completed tab lists them, each with the undo toggle inline.
    await tray.getByTestId("today-tray-tab-completed").click();
    const completedRow = tray
      .locator('[data-testid^="task-row-"]')
      .filter({ hasText: "Morning Plant Inspection" })
      .first();
    await expect(completedRow).toBeVisible({ timeout: 10000 });
    await expect(
      completedRow.getByRole("button", { name: /Mark task .* as incomplete/i }),
    ).toBeVisible();

    // Back to Today — the pending list returns.
    await tray.getByTestId("today-tray-tab-pending").click();
    await expect(tray.locator('[data-testid^="task-row-"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("TRAY-010: the tray trigger is hidden in focus mode (Garden Walk hides the header)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/walk");
    await expect(authenticatedPage.getByTestId("today-tasks-tray-trigger")).toHaveCount(0, { timeout: 10000 });
  });
});
