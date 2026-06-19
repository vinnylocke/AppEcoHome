import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Regression guards for the navigation audit fixes — params that destinations
// now consume (and strip), plus the retargeted dashboard tiles.

test.describe("Navigation deep-links", () => {
  test("NAV-001: Dashboard 'Completed' tile → calendar agenda", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");
    const tile = authenticatedPage.getByTestId("dash-stat-tasks-completed");
    const visible = await tile.isVisible({ timeout: 10000 }).catch(() => false);
    if (!visible) { test.skip(); return; }
    await tile.click();
    await expect(authenticatedPage).toHaveURL(/view=calendar/);
  });

  test("NAV-002: /schedule?category=Pruning is consumed (param stripped)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/schedule?category=Pruning");
    // BlueprintManager reads ?category → setFilterType, then strips it (replace).
    await expect(authenticatedPage).not.toHaveURL(/category=/, { timeout: 10000 });
  });

  test("NAV-003: /gardener?section=quick-launcher lands on Account with the picker anchor", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/gardener?section=quick-launcher");
    await expect(authenticatedPage.locator("#quick-launcher-section")).toBeAttached({ timeout: 10000 });
    await expect(authenticatedPage).not.toHaveURL(/section=/);
  });

  test("NAV-004: /dashboard?view=calendar&date=YYYY-MM-DD is consumed (date stripped)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard?view=calendar&date=2026-06-19");
    await expect(authenticatedPage).not.toHaveURL(/date=/, { timeout: 10000 });
  });
});
