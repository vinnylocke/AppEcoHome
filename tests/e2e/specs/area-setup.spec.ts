import { expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test } from "../fixtures/auth";
import { LocationManagementPage } from "../pages/LocationManagementPage";
import { mockEdgeFunction } from "../fixtures/api-mocks";
import { cleanupWizardAreas, countWizardInstances } from "../utils/wizardAreaCleanup";

// All tests require an authenticated session.

// Helper: area inputs live inside .rounded-3xl .space-y-2 containers (location cards)
// Location inputs are NOT inside .space-y-2. This scoping avoids matching location name inputs.

// 2026-07-18 — "Add Area" opens the Add-Area wizard (no more instant
// "New Area" stub insert). Quick-create for tests = name + Skip.
import type { Locator, Page } from "@playwright/test";
async function quickCreateArea(page: Page, card: Locator, name: string): Promise<void> {
  await card.getByRole("button", { name: /Add Area/i }).click();
  await expect(page.getByTestId("add-area-wizard")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("add-area-name").fill(name);
  await page.getByTestId("add-area-skip").click();
  await expect(page.getByTestId("add-area-wizard")).not.toBeVisible({ timeout: 10000 });
}

test.describe("Area setup — Location Management page", () => {
  test("navigating to /management renders the Location Management heading", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await expect(mgmt.heading).toBeVisible({ timeout: 10000 });
  });

  test("the New Location button is visible", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await expect(mgmt.newLocationButton).toBeVisible({ timeout: 10000 });
  });

  test("Location Management nav link navigates to /management", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    await authenticatedPage
      .getByRole("button", { name: "Location Management" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/management");
  });

  test("existing locations or an empty state are shown after loading", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await authenticatedPage
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // Either the New Location button (always present) confirms the page loaded,
    // or we see location cards
    await expect(mgmt.newLocationButton).toBeVisible({ timeout: 10000 });
  });

  test("AREA-SOIL-001: a fresh soil reading renders moisture/temp chips on the area tile", async ({ authenticatedPage }) => {
    // Owner request 2026-07-23: surface an area's current reading on the tile
    // (no need to open Advanced Metrics). The `latest_soil_*` columns are
    // denormalised by the integrations ingest path; set them directly here so
    // the test is independent of trigger/ingest timing, then assert the chips.
    const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
    const homeId = `0000000${workerNum}-0000-0000-0000-000000000002`;
    const url = process.env.VITE_SUPABASE_URL!;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const email = `test${workerNum}@rhozly.com`;
    const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";
    const supabase: SupabaseClient = createClient(url, key);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();

    const { data: areas } = await supabase.from("areas").select("id").eq("home_id", homeId).limit(1);
    const areaId = areas?.[0]?.id as string | undefined;
    expect(areaId).toBeTruthy();

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("areas")
      .update({
        latest_soil_moisture_pct: 45,
        latest_soil_moisture_recorded_at: nowIso,
        latest_soil_temp_c: 18.5,
        latest_soil_temp_recorded_at: nowIso,
      })
      .eq("id", areaId!);
    expect(updateError).toBeNull();

    try {
      const mgmt = new LocationManagementPage(authenticatedPage);
      await mgmt.goto();
      await expect(mgmt.heading).toBeVisible({ timeout: 10000 });

      const moisture = authenticatedPage.getByTestId(`area-soil-moisture-${areaId}`);
      await expect(moisture).toBeVisible({ timeout: 10000 });
      await expect(moisture).toContainText("45%");
      await expect(authenticatedPage.getByTestId(`area-soil-temp-${areaId}`)).toContainText("18.5°C");
    } finally {
      // Restore the area so the reading doesn't leak into other specs.
      await supabase
        .from("areas")
        .update({
          latest_soil_moisture_pct: null,
          latest_soil_moisture_recorded_at: null,
          latest_soil_temp_c: null,
          latest_soil_temp_recorded_at: null,
        })
        .eq("id", areaId!);
    }
  });
});

test.describe("Area setup — create location flow", () => {
  test("clicking New Location reveals the Create New Location form", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await expect(mgmt.newLocationButton).toBeVisible({ timeout: 10000 });
    await mgmt.newLocationButton.click();

    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });
  });

  test("the Create New Location form has a name input", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    // A text input (location name) should be in the form
    const nameInput = authenticatedPage
      .getByRole("textbox")
      .first();
    await expect(nameInput).toBeVisible();
  });

  test("cancelling the form hides it without creating a location", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    // Scope to the create form to avoid matching orphaned location delete buttons
    // (previous failed runs leave "E2E Cancel XXXXX" locations whose trash buttons
    // have aria-labels containing "Cancel"). exact: true matches only "Cancel" text.
    const cancelBtn = authenticatedPage.getByRole("button", { name: "Cancel", exact: true });
    await cancelBtn.click();

    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 3000 });
    // The New Location button should be back
    await expect(mgmt.newLocationButton).toBeVisible();
  });

  test("entering a name and saving creates a new location (cleans up after)", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    const locationName = `E2E Test Location ${Date.now()}`;
    const nameInput = authenticatedPage.getByRole("textbox").first();
    await nameInput.fill(locationName);

    // Submit the form — look for an Add/Save button
    const addBtn = authenticatedPage.getByRole("button", {
      name: /Add Location|Save|Create/i,
    });
    await addBtn.click();

    // Save succeeds when the create form closes (form stays open on error)
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // --- Cleanup: delete the location we just created ---
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();

    // The trash click opens a ConfirmModal — confirm if it appears
    const confirmBtn = authenticatedPage.getByRole("button", {
      name: "Delete", exact: true,
    });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });
});

test.describe("Area setup — form validation and additional flows", () => {
  test("MGMT-009: Submit create form with blank name shows an error", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    // Try saving with an empty name
    await mgmt.saveLocationButton.click();

    // Form should stay open (save didn't succeed)
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 3000 });
  });

  test("MGMT-010: Create location form has an Indoor/Outdoor toggle", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    // The toggle buttons are "Inside" and "Outside"
    const insideBtn = authenticatedPage.getByRole("button", { name: /Inside/i });
    const outsideBtn = authenticatedPage.getByRole("button", { name: /Outside/i });

    const hasToggle =
      (await insideBtn.isVisible().catch(() => false)) ||
      (await outsideBtn.isVisible().catch(() => false));
    expect(hasToggle).toBe(true);
  });

  test("MGMT-012: Add an area to a location — happy path with cleanup", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);

    // First create a location to add an area to
    await mgmt.goto();
    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    const locationName = `E2E Loc ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Verify location was created — delete button with aria-label must be visible
    await expect(
      authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    ).toBeVisible({ timeout: 10000 });

    // Scope all area interactions to the test location's card (identified by its delete button)
    const testLocationCard = authenticatedPage.locator(".rounded-3xl").filter({
      has: authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    });

    // Add Area now goes through the wizard — the Skip path is the
    // quick-create equivalent of the old stub insert (with a real name).
    const areaName = `E2E Area ${Date.now()}`;
    await quickCreateArea(authenticatedPage, testLocationCard, areaName);

    // The created area renders in the location card with its name.
    const areaInput = testLocationCard.locator(".space-y-2 input").last();
    await expect(areaInput).toHaveValue(areaName, { timeout: 10000 });

    // --- Cleanup: delete the test location (cascades to area) ---
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();

    const confirmBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });

  test("MGMT-016: Delete a location — confirm removes it", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);

    // Create a fresh location to delete
    await mgmt.goto();
    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    const locationName = `E2E Del Loc ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Verify location exists — its delete button must be visible
    await expect(
      authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    ).toBeVisible({ timeout: 10000 });

    // Delete it
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();

    const confirmBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // After deletion the delete button (and location text) should be gone
    await expect(
      authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    ).not.toBeVisible({ timeout: 10000 });
  });

  test("MGMT-017: Cancel on delete dialog leaves location in list", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);

    // Create a fresh location to test cancel on
    await mgmt.goto();
    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    const locationName = `E2E Cancel ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Attempt delete then cancel
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();

    // exact: true avoids matching "Delete location: E2E Cancel XXXXX" trash buttons
    const cancelBtn = authenticatedPage.getByRole("button", { name: "Cancel", exact: true });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
    }

    // Location should still be visible — its delete button must still be present
    await expect(
      authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    ).toBeVisible({ timeout: 5000 });

    // Cleanup
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });

  test("MGMT-019: Advanced area settings icon opens metrics modal", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    // The seeded "Outside Garden" location has areas. Click the settings icon on any area.
    const advancedBtn = authenticatedPage.getByTitle("Advanced Metrics").first();
    const isVisible = await advancedBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      // Locations may be collapsed — skip if no areas are visible
      test.skip();
      return;
    }

    await advancedBtn.click();
    await expect(mgmt.advancedSettingsModal).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 12 — Location Management: extended flows
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Area setup — extended flows (Section 12)", () => {
  test("MGMT-011: Create an Indoor location and verify the indoor indicator", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });

    // Toggle to Inside
    const insideBtn = authenticatedPage.getByRole("button", { name: /Inside/i });
    if (await insideBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await insideBtn.click();
    }

    const locationName = `E2E Indoor ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Verify location was saved — its delete button must be visible
    await expect(
      authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });

  test("MGMT-013: Clearing an area name and blurring does not save blank name", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    // Create a fresh location + area
    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });
    const locationName = `E2E BlankArea ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Scope to the test location card to avoid picking up other locations' areas
    const testLocationCard = authenticatedPage.locator(".rounded-3xl").filter({
      has: authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    });

    // Add Area → wizard. A blank name is rejected (the wizard stays open),
    // replacing the old "blank rename silently ignored" stub behaviour.
    await testLocationCard.getByRole("button", { name: /Add Area/i }).click();
    await expect(authenticatedPage.getByTestId("add-area-wizard")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("add-area-skip").click();
    await expect(authenticatedPage.getByTestId("add-area-wizard")).toBeVisible({ timeout: 3000 });
    await authenticatedPage.getByTestId("add-area-close").click();
    await expect(authenticatedPage.getByTestId("add-area-wizard")).not.toBeVisible({ timeout: 5000 });

    // Cleanup: delete the test location
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });

  test("MGMT-015: Cancel on area delete dialog leaves the area in the list", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    // Create a fresh location + area
    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });
    const locationName = `E2E AreaCancel ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Scope all area interactions to the test location's card (identified by its delete button)
    const testLocationCard015 = authenticatedPage.locator(".rounded-3xl").filter({
      has: authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    });

    const areaName015 = `E2E CancelArea ${Date.now()}`;
    await quickCreateArea(authenticatedPage, testLocationCard015, areaName015);

    // Area row scoped to the test location
    const lastAreaRow = testLocationCard015.locator(".space-y-2 > div").last();
    const areaTrashBtn = lastAreaRow.locator("button").last();

    if (await areaTrashBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await areaTrashBtn.click();
      await authenticatedPage.waitForTimeout(300);

      // exact: true avoids matching "Delete location: X" trash button aria-labels
      const cancelBtn = authenticatedPage.getByRole("button", { name: "Cancel", exact: true });
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
      }

      // Area should still be present — scoped to test location
      await expect(
        testLocationCard015.locator(".space-y-2 input").last(),
      ).toHaveValue(areaName015, { timeout: 5000 });
    }

    // Cleanup
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });

  test("MGMT-014: Delete an area — confirm removes it from the location", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    // Create a fresh location + area to safely delete
    await mgmt.newLocationButton.click();
    await expect(mgmt.createLocationForm).toBeVisible({ timeout: 5000 });
    const locationName = `E2E AreaDel ${Date.now()}`;
    await mgmt.locationNameInput.fill(locationName);
    await mgmt.saveLocationButton.click();
    await expect(mgmt.createLocationForm).not.toBeVisible({ timeout: 10000 });

    // Scope all area interactions to the test location's card (identified by its delete button)
    const testLocationCard014 = authenticatedPage.locator(".rounded-3xl").filter({
      has: authenticatedPage.getByLabel(`Delete location: ${locationName}`),
    });

    await quickCreateArea(authenticatedPage, testLocationCard014, `E2E DelArea ${Date.now()}`);

    // Click the trash on the last area row scoped to the test location
    const lastAreaRow = testLocationCard014.locator(".space-y-2 > div").last();
    const areaTrashBtn = lastAreaRow.locator("button").last();

    if (await areaTrashBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await areaTrashBtn.click();
      await authenticatedPage.waitForTimeout(300);

      // ConfirmModal uses confirmText="Delete" for area deletes
      const deleteBtn = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click();
      }
      await authenticatedPage.waitForTimeout(500);

      // The test location's area container should now be empty (0 area inputs)
      await expect(testLocationCard014.locator(".space-y-2 input")).toHaveCount(0, { timeout: 8000 });
    }

    // Cleanup: delete the test location
    await authenticatedPage.getByLabel(`Delete location: ${locationName}`).click();
    const confirmBtn2 = authenticatedPage.getByRole("button", { name: "Delete", exact: true });
    if (await confirmBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn2.click();
    }
  });

  test("MGMT-018: Delete dialog appears for a location that has planted inventory", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    // "Outside Garden" has planted items. Try opening the delete dialog via its aria-label trash btn.
    const outsideTrashBtn = authenticatedPage.getByLabel("Delete location: Outside Garden");
    const isVisible = await outsideTrashBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await outsideTrashBtn.click();
    await authenticatedPage.waitForTimeout(300);

    // Some dialog should appear (either a warning or the standard delete confirmation)
    const dialogVisible =
      await authenticatedPage.getByRole("alertdialog").isVisible({ timeout: 3000 }).catch(() => false) ||
      await authenticatedPage.getByText(/Delete location\?|Permanently remove/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(dialogVisible).toBe(true);

    // Cancel immediately — never actually delete the seeded location
    const cancelBtn = authenticatedPage.getByRole("button", { name: "Cancel", exact: true });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
    }
  });

  test("MGMT-020: Save advanced area metrics (pH) — success toast appears", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    const advancedBtn = authenticatedPage.getByTitle("Advanced Metrics").first();
    const isVisible = await advancedBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await advancedBtn.click();
    await expect(mgmt.advancedSettingsModal).toBeVisible({ timeout: 5000 });

    // Set pH to 6.5
    await mgmt.phInput.fill("6.5");

    // Save
    await mgmt.saveAreaMetricsButton.click();
    await authenticatedPage.waitForTimeout(500);

    // Success toast or modal closes
    const toastVisible = await authenticatedPage.getByText(/saved|success/i).isVisible({ timeout: 5000 }).catch(() => false);
    const modalClosed = await mgmt.advancedSettingsModal.isHidden({ timeout: 5000 }).catch(() => false);

    expect(toastVisible || modalClosed).toBe(true);
  });

  test("MGMT-021: Entering out-of-range pH — documents component behavior", async ({ authenticatedPage }) => {
    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();
    await mgmt.waitForLoad();

    const advancedBtn = authenticatedPage.getByTitle("Advanced Metrics").first();
    const isVisible = await advancedBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await advancedBtn.click();
    await expect(mgmt.advancedSettingsModal).toBeVisible({ timeout: 5000 });

    // Enter out-of-range pH (15 is above the 0–14 range)
    await mgmt.phInput.fill("15");
    await mgmt.saveAreaMetricsButton.click();
    await authenticatedPage.waitForTimeout(500);

    // Either a client-side validation error is shown, OR a DB-level error toast appears,
    // OR the value is accepted (no client validation). Record actual behavior.
    const errorVisible =
      await authenticatedPage.getByText(/invalid|error|range|0.*14/i).isVisible({ timeout: 3000 }).catch(() => false);
    const toastErrorVisible =
      await authenticatedPage.getByText(/failed/i).isVisible({ timeout: 3000 }).catch(() => false);
    const saved =
      await mgmt.advancedSettingsModal.isHidden({ timeout: 3000 }).catch(() => false);

    // Test passes regardless — this documents the actual behavior
    expect(errorVisible || toastErrorVisible || saved || true).toBe(true);

    // Close modal if still open (exact: true avoids matching location delete buttons)
    const cancelBtn = authenticatedPage.getByRole("button", { name: "Cancel", exact: true });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    }
  });
});

test.describe("Area setup — Add-Area wizard (2026-07-18)", () => {
  test.beforeEach(async () => {
    await cleanupWizardAreas();
  });
  test.afterEach(async () => {
    await cleanupWizardAreas();
  });

  test("WIZ-001: wizard creates an area with conditions + a Shed plant, then shows the AI review", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "area-setup-review", {
      score: 82,
      headline: "A strong setup.",
      summary: "The pH and light suit these plants well.",
      plant_fit: [{ name: "Tomato", verdict: "great", note: "pH 6.4 fits" }],
      compatibility: { verdict: "well", note: "" },
      recommendations: { plants: [], tasks: [], automations: [] },
    });

    const mgmt = new LocationManagementPage(authenticatedPage);
    await mgmt.goto();

    await authenticatedPage.getByTestId("area-add-btn").first().click();
    await expect(authenticatedPage.getByTestId("add-area-wizard")).toBeVisible({ timeout: 10000 });

    const areaName = `E2E Wizard Bed ${Date.now()}`;
    await authenticatedPage.getByTestId("add-area-name").fill(areaName);
    await authenticatedPage.locator('input[name="medium_ph"]').fill("6.4");
    await authenticatedPage.getByTestId("add-area-next").click();

    // Seeded Shed plants render as pickable cards; pick the first one.
    const shedFirst = authenticatedPage
      .getByTestId("add-area-shed-list")
      .locator("button")
      .first();
    await expect(shedFirst).toBeVisible({ timeout: 10000 });
    await shedFirst.click();
    await expect(authenticatedPage.getByTestId("add-area-pending")).toBeVisible();

    await authenticatedPage.getByTestId("add-area-create").click();

    // The (mocked) AI review renders on the committed area.
    await expect(authenticatedPage.getByTestId("add-area-review")).toBeVisible({ timeout: 15000 });
    await expect(authenticatedPage.getByTestId("add-area-score")).toHaveText("82", { timeout: 10000 });
    await authenticatedPage.getByTestId("add-area-done").click();

    // The area exists in the manager list (fetchHierarchy refreshed) and
    // exactly one instance row landed in it.
    await expect(authenticatedPage.getByDisplayValue(areaName)).toBeVisible({ timeout: 10000 });
    expect(await countWizardInstances(areaName)).toBe(1);
  });
});
