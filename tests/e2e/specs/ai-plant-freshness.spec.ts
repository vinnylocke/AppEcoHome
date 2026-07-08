import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";

// AI Plant Overhaul Wave 5 — freshness chip + acknowledge flow.
//
// Seeded data (supabase/seeds/13_ai_freshness.sql):
//   - Global AI plant "Cherry Tomato" (id 1000010, freshness_version=2)
//   - Per-home shallow fork "Cherry Tomato" (200011 for worker 1; substituted
//     per worker by scripts/seed-test-db.mjs)
//   - user_plant_ack at version 1 → chip should fire on the home fork card

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
const USER_ID = `0000000${workerNum}-0000-0000-0000-000000000001`;
const CHERRY_TOMATO_GLOBAL_ID = 1000010;

// AI-FRESH-003 acknowledges the chip, which bumps `seen_freshness_version`
// to match the global. That makes AI-FRESH-001 + AI-FRESH-002 fail on a
// subsequent run because the chip / callout don't fire anymore. Reset the
// ack to the seed state before each test so the spec is order-independent
// and re-runnable without `npm run test:seed` between runs.
test.beforeEach(async () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";
  if (!url || !key) return;
  const c = createClient(url, key);
  const { error: signInErr } = await c.auth.signInWithPassword({
    email: `test${workerNum}@rhozly.com`,
    password,
  });
  if (signInErr) return;
  await c
    .from("user_plant_ack")
    .upsert(
      {
        user_id: USER_ID,
        plant_id: CHERRY_TOMATO_GLOBAL_ID,
        seen_freshness_version: 1,
      },
      { onConflict: "user_id,plant_id" },
    );
});

test.describe("AI Plant Freshness — chip + acknowledge", () => {
  test("AI-FRESH-001: Shed card shows the Updated chip on the catalogue plant", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });

    // The chip lives inside the card; it has data-testid="ai-updated-chip"
    // and renders the quiet "Update available" label (2026-07-08 calm-down).
    const chip = card.locator("[data-testid='ai-updated-chip']");
    await expect(chip).toBeVisible({ timeout: 5000 });
    await expect(chip).toContainText(/update available/i);
  });

  test("AI-FRESH-002: Opening the plant shows the yellow callout listing changed fields", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    const callout = authenticatedPage.locator("[data-testid='ai-care-update-callout']");
    await expect(callout).toBeVisible({ timeout: 5000 });

    // The seeded updated_care_fields are ['sunlight','watering_min_days'] —
    // the callout renders them as humanised labels.
    await expect(callout).toContainText("Sunlight");
    await expect(callout).toContainText(/watering/i);
  });

  test("AI-FRESH-003: Keep mine (ack) dismisses the callout", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    const callout = authenticatedPage.locator("[data-testid='ai-care-update-callout']");
    await expect(callout).toBeVisible({ timeout: 5000 });

    const markReviewed = authenticatedPage.locator("[data-testid='ai-care-mark-reviewed']");
    await markReviewed.click();

    // After ack, the optimistic local clear hides the callout immediately.
    await expect(callout).not.toBeVisible({ timeout: 5000 });
  });
});
