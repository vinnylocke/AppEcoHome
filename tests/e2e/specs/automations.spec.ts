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
});
