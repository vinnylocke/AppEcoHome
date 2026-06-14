import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { PlannerPage } from "../pages/PlannerPage";

// ─────────────────────────────────────────────────────────────────────────
// planner-restore.spec.ts
//
// Planner gaps not covered by the existing planner.spec.ts (24 tests).
// Targets the Archived tab + Restore + Delete plan options surface.
//
// Seed (05_planner.sql): three plans per worker — In Progress, Completed,
// and "Winter Prep" (Archived). PLN-R-003 mutates the archived plan; the
// beforeEach resets it back to Archived so test order doesn't matter.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

async function resetWinterPrepArchived() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";
  const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
  const email = `test${workerIndex + 1}@rhozly.com`;

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return;

  const w = workerIndex + 1;
  const planId = `0000000${w}-0000-0000-0008-000000000003`;
  await supabase
    .from("plans")
    .update({ status: "Archived" })
    .eq("id", planId);
}

test.describe("Planner — archived + restore", () => {
  test.beforeEach(async () => {
    await resetWinterPrepArchived();
  });

  test("PLN-R-001: seeded archived plan ('Winter Prep') is visible in the Archived tab", async ({
    authenticatedPage,
  }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.archivedTab.click();
    await expect(planner.planCard("Winter Prep")).toBeVisible({ timeout: 8000 });
  });

  test("PLN-R-002: archived plan's options menu shows Restore Plan + Delete Plan", async ({
    authenticatedPage,
  }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();
    await planner.archivedTab.click();
    await expect(planner.planCard("Winter Prep")).toBeVisible({ timeout: 8000 });

    await planner.planMenuButton().click();
    await expect(planner.planOption("Restore Plan")).toBeVisible();
    await expect(planner.planOption("Delete Plan")).toBeVisible();
  });

  test("PLN-R-003: Restore Plan moves 'Winter Prep' from Archived to Pending", async ({
    authenticatedPage,
  }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();
    await planner.archivedTab.click();
    await expect(planner.planCard("Winter Prep")).toBeVisible({ timeout: 8000 });

    await planner.planMenuButton().click();
    await planner.planOption("Restore Plan").click();
    // ConfirmModal — primary action.
    await planner.confirmButton.click();

    // After restore, the plan disappears from Archived...
    await expect(planner.planCard("Winter Prep")).toHaveCount(0, { timeout: 8000 });

    // ...and shows up on the Pending tab.
    await planner.pendingTab.click();
    await expect(planner.planCard("Winter Prep")).toBeVisible({ timeout: 8000 });
  });
});
