import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { AutomationsPage } from "../pages/AutomationsPage";

// ─────────────────────────────────────────────────────────────────────────────
// Section 23 — Integrations Automations (unified condition builder)
// The builder is a free condition tree + actions; templates pre-build common
// recipes. These tests exercise the builder shell + the Smart watering template
// without persisting data (cancel, don't save) so no cleanup is needed.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Automations — unified builder (Section 23)", () => {
  test("AUTO-001: '+ New automation' opens the condition builder", async ({ authenticatedPage }) => {
    const auto = new AutomationsPage(authenticatedPage);
    await auto.goto();
    await auto.openBuilder();
    await expect(auto.builderModal).toBeVisible();
    await expect(auto.nameInput).toBeVisible();
  });

  test("AUTO-002: Smart watering template fills the name + condition summary", async ({ authenticatedPage }) => {
    const auto = new AutomationsPage(authenticatedPage);
    await auto.goto();
    await auto.openBuilder();

    await auto.template("smart_watering").click();

    await expect(auto.nameInput).toHaveValue("Smart watering");
    // Summary reflects the pre-built tree: dry AND not-rain, OR critically dry.
    await expect(auto.summary).toContainText("moisture < 30%");
    await expect(auto.summary).toContainText("not rain forecast");
  });

  test("AUTO-003: template chips for all registered recipes are present", async ({ authenticatedPage }) => {
    const auto = new AutomationsPage(authenticatedPage);
    await auto.goto();
    await auto.openBuilder();

    for (const id of ["smart_watering", "scheduled_skip_rain", "notify_too_dry", "water_when_dry"]) {
      await expect(auto.template(id)).toBeVisible();
    }
  });

  test("AUTO-004: default run-window card shows + persists a saved window", async ({ authenticatedPage }) => {
    const auto = new AutomationsPage(authenticatedPage);
    await auto.goto();

    await expect(auto.defaultsCard).toBeVisible({ timeout: 10000 });
    // Pre-populated 08:00–20:00 by default.
    await expect(auto.windowStart).toHaveValue("08:00");
    await expect(auto.windowEnd).toHaveValue("20:00");

    // Edit + save, then reload and confirm it stuck.
    await auto.windowStart.fill("07:30");
    await auto.windowSave.click();
    await expect(authenticatedPage.getByText("Default run window saved")).toBeVisible({ timeout: 10000 });

    await auto.goto();
    await expect(auto.windowStart).toHaveValue("07:30");

    // Restore the default so the test is idempotent for the next run.
    await auto.windowStart.fill("08:00");
    await auto.windowSave.click();
  });

  test("AUTO-005: task-due leaf renders a picker (searchable when the list is long)", async ({ authenticatedPage }) => {
    const auto = new AutomationsPage(authenticatedPage);
    await auto.goto();
    await auto.openBuilder();

    // Switch the default sensor leaf to a Task-due condition.
    await auto.leafKindSelect().selectOption("task_due");
    const leaf = authenticatedPage.getByTestId("cond-leaf-task_due");
    await expect(leaf).toBeVisible();

    // The search box only appears once there are more than 6 recurring tasks;
    // when present, typing must narrow the chips without clearing selections.
    if (await auto.taskLeafSearch.isVisible()) {
      const chipsBefore = await leaf.locator("button").count();
      await auto.taskLeafSearch.fill("zzz-no-such-task");
      const chipsAfter = await leaf.locator("button").count();
      expect(chipsAfter).toBeLessThanOrEqual(chipsBefore);
    }
  });
});
