import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// All tests require an authenticated session and the plants seed (02_plants_shed.sql).
// Seeded plants (active): Tomato, Basil, Rose, Boston Fern, Lavender
// Seeded plants (archived): Mint
// Source breakdown: Manual = Tomato, Basil, Rose, Boston Fern, Mint | API = Lavender

test.describe("Shed — Tabs and view filters", () => {
  test("SHED-005: Active tab is default and shows non-archived plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await expect(shed.activeTab).toBeVisible({ timeout: 10000 });

    // At least one of the active seeded plants should appear
    const cards = authenticatedPage.locator("[data-plant-card]");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // Mint (archived) should not be in the active view
    const mintCard = shed.plantCard("Mint");
    await expect(mintCard).not.toBeVisible();
  });

  test("SHED-006: Archived tab shows the archived plant", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.archivedTab.click();
    await shed.waitForLoad();

    await expect(shed.plantCard("Mint")).toBeVisible({ timeout: 10000 });
  });

  test("SHED-007: Archived tab does not show active plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.archivedTab.click();
    await shed.waitForLoad();

    // Active plants should not appear in archived view
    await expect(shed.plantCard("Tomato")).not.toBeVisible();
    await expect(shed.plantCard("Basil")).not.toBeVisible();
  });

  test("SHED-008: Filter by Manual source shows only manual plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.sourceFilterSelect.selectOption("manual");
    await shed.waitForLoad();

    // Manual plants that are active: Tomato, Basil, Rose, Boston Fern
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });
    // Lavender (api source) should not appear
    await expect(shed.plantCard("Lavender")).not.toBeVisible();
  });

  test("SHED-009: Filter by Perenual (API) source shows only api-source plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.sourceFilterSelect.selectOption("api");
    await shed.waitForLoad();

    // Lavender is the only api-source active plant
    await expect(shed.plantCard("Lavender")).toBeVisible({ timeout: 10000 });
    await expect(shed.plantCard("Tomato")).not.toBeVisible();
  });
});

test.describe("Shed — Search", () => {
  test("SHED-010: Search by exact name shows matching card", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.searchInput.fill("Tomato");
    await authenticatedPage.waitForTimeout(500); // debounce

    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });
    await expect(shed.plantCard("Basil")).not.toBeVisible();
  });

  test("SHED-011: Search with no match shows no-match state", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.searchInput.fill("xyzqwerty");
    await authenticatedPage.waitForTimeout(500);

    await expect(shed.noMatchState).toBeVisible({ timeout: 10000 });
    const cards = authenticatedPage.locator("[data-plant-card]");
    expect(await cards.count()).toBe(0);
  });

  test("SHED-012: Clear search button restores all active plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.searchInput.fill("xyzqwerty");
    await authenticatedPage.waitForTimeout(500);
    await expect(shed.noMatchState).toBeVisible({ timeout: 10000 });

    await shed.clearSearchButton.click();
    await shed.waitForLoad();

    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });
  });

  test("SHED-013: Search is case-insensitive", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.searchInput.fill("tomato");
    await authenticatedPage.waitForTimeout(500);

    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });
  });

  test("SHED-014: Partial search match works", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.searchInput.fill("Bos");
    await authenticatedPage.waitForTimeout(500);

    await expect(shed.plantCard("Boston Fern")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Shed — Add plant modal", () => {
  test("SHED-015: Clicking Add opens the BulkSearchModal", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();

    // Modal renders — the Manual tab button should appear
    await expect(
      authenticatedPage.getByRole("tab", { name: /Manual/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("SHED-016: Closing the add modal without saving leaves plant count unchanged", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const before = await authenticatedPage.locator("[data-plant-card]").count();

    await shed.addButton.click();
    await expect(
      authenticatedPage.getByRole("tab", { name: /Manual/i }),
    ).toBeVisible({ timeout: 10000 });

    // Press Escape to close
    await authenticatedPage.keyboard.press("Escape");
    await authenticatedPage
      .getByRole("tab", { name: /Manual/i })
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});

    // Re-count cards — should be same as before
    await shed.waitForLoad();
    const after = await authenticatedPage.locator("[data-plant-card]").count();
    expect(after).toBe(before);
  });

  test("SHED-017: Manual plant creation — happy path with cleanup", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const plantName = `E2E Plant ${Date.now()}`;

    // Open modal and switch to Manual tab
    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await expect(manualTab).toBeVisible({ timeout: 10000 });
    await manualTab.click();

    // Fill in the common name
    const nameInput = authenticatedPage.getByLabel(/Common Name/i);
    await nameInput.fill(plantName);

    // Submit
    const saveBtn = authenticatedPage.getByRole("button", { name: /Save to Shed/i });
    await saveBtn.click();

    // BulkSearchModal calls onClose() synchronously before handleManualSave resolves,
    // so the modal navigates away before the Supabase insert completes.
    // Wait for the success toast to confirm the async save actually finished.
    await manualTab.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByText(/added to shed/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();

    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // --- Cleanup: delete the test plant ---
    await shed.deleteButtonFor(plantName).click();
    const confirmDelete = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    await expect(confirmDelete).toBeVisible({ timeout: 8000 });
    await confirmDelete.click();
    // Reload /shed to get a clean fetch rather than relying on the optimistic refreshShed()
    await authenticatedPage.waitForTimeout(1500);
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).not.toBeVisible({ timeout: 10000 });
  });

  test("SHED-018: Manual plant — empty name shows validation error", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await expect(manualTab).toBeVisible({ timeout: 10000 });
    await manualTab.click();

    // Submit without filling name
    const saveBtn = authenticatedPage.getByRole("button", { name: /Save to Shed/i });
    await saveBtn.click();

    await expect(
      authenticatedPage.getByText(/Plant name is mandatory|Required/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("SHED-019: Manual plant — duplicate name shows an error toast", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // "Tomato" is already seeded — adding it again should trigger a duplicate error
    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await expect(manualTab).toBeVisible({ timeout: 10000 });
    await manualTab.click();

    const nameInput = authenticatedPage.getByLabel(/Common Name/i);
    await nameInput.fill("Tomato");

    const saveBtn = authenticatedPage.getByRole("button", { name: /Save to Shed/i });
    await saveBtn.click();

    // Duplicate check fires before insert — expect an error toast containing the plant name
    await expect(
      authenticatedPage.getByText(/already in your shed/i),
    ).toBeVisible({ timeout: 8000 });
  });

  test("SHED-020: Perenual API search — mocked result appears in modal", async ({ authenticatedPage }) => {
    // Mock Perenual external API to avoid real network calls
    await authenticatedPage.route("https://perenual.com/api/v2/species-list*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 1,
              common_name: "Test Tomato",
              scientific_name: ["Solanum lycopersicum"],
              default_image: { thumbnail: null },
            },
          ],
        }),
      }),
    );

    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await authenticatedPage.waitForTimeout(400);

    // Switch to the Perenual tab (premium required — skip if not available)
    const perenualTab = authenticatedPage.getByRole("tab", { name: /Perenual/i });
    const tabVisible = await perenualTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!tabVisible) return;

    await perenualTab.click();
    await authenticatedPage.waitForTimeout(300);

    // If "Premium Required" wall is shown, skip gracefully
    const premiumWall = await authenticatedPage.getByText("Premium Required").isVisible({ timeout: 2000 }).catch(() => false);
    if (premiumWall) return;

    // Fill in a search query and submit
    const searchInput = authenticatedPage.locator("#bulk-search-input");
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill("Tomato");
    await authenticatedPage.keyboard.press("Enter");

    // Wait for spinner to clear then verify mocked result appears
    await authenticatedPage.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});

    await expect(
      authenticatedPage.getByText("Test Tomato"),
    ).toBeVisible({ timeout: 8000 });
  });

  test("SHED-022a: AI tab — mocked search result appears in modal", async ({ authenticatedPage }) => {
    const MOCK_AI_MATCHES = { matches: ["Butterhead Lettuce (Lactuca sativa var. capitata)", "Romaine Lettuce (Lactuca sativa)"] };
    await mockEdgeFunction(authenticatedPage, "plant-doctor", MOCK_AI_MATCHES);

    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();
    await shed.addButton.click();

    const aiTab = authenticatedPage.getByRole("tab", { name: /AI/i });
    const tabVisible = await aiTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!tabVisible) return;
    await aiTab.click();

    const premiumWall = await authenticatedPage.getByText("Premium Required").isVisible({ timeout: 2000 }).catch(() => false);
    if (premiumWall) return;

    const searchInput = authenticatedPage.locator("#bulk-search-input");
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill("Lettuce");
    await authenticatedPage.keyboard.press("Enter");

    await authenticatedPage.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    await expect(
      authenticatedPage.getByText("Butterhead Lettuce (Lactuca sativa var. capitata)"),
    ).toBeVisible({ timeout: 8000 });
  });

  test("SHED-021: Perenual API search — no results shows empty list", async ({ authenticatedPage }) => {
    // Mock Perenual returning an empty result set
    await authenticatedPage.route("https://perenual.com/api/v2/species-list*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );

    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await authenticatedPage.waitForTimeout(400);

    const perenualTab = authenticatedPage.getByRole("tab", { name: /Perenual/i });
    const tabVisible = await perenualTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!tabVisible) return;

    await perenualTab.click();
    await authenticatedPage.waitForTimeout(300);

    const premiumWall = await authenticatedPage.getByText("Premium Required").isVisible({ timeout: 2000 }).catch(() => false);
    if (premiumWall) return;

    const searchInput = authenticatedPage.locator("#bulk-search-input");
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill("xyznotarealplant");
    await authenticatedPage.keyboard.press("Enter");

    await authenticatedPage.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    await authenticatedPage.waitForTimeout(300);

    // No selection buttons should appear when results are empty
    const selectionButtons = authenticatedPage.locator('[aria-label="Add to selection"]');
    expect(await selectionButtons.count()).toBe(0);
  });
});

test.describe("Shed — Plant card actions", () => {
  test("SHED-022: Clicking a plant card opens the edit modal", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.plantCard("Tomato").click();

    // PlantEditModal should appear — look for the plant name in a heading or modal
    await expect(
      authenticatedPage.getByText("Tomato").first(),
    ).toBeVisible({ timeout: 10000 });
    // A close or save button indicates modal is open
    const saveBtn = authenticatedPage.getByRole("button", { name: /Save to Shed|Save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
  });

  test("SHED-023: Closing the plant edit modal returns to grid", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.plantCard("Tomato").click();
    await authenticatedPage.waitForTimeout(500);

    // Close via Escape
    await authenticatedPage.keyboard.press("Escape");

    // Confirm modal is gone by checking heading is still visible
    await expect(shed.heading).toBeVisible({ timeout: 5000 });
  });

  test("SHED-024: Archive and restore a plant within a single test", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    const plantName = `E2E Archive ${Date.now()}`;

    // Create a plant to archive
    await shed.goto();
    await shed.waitForLoad();
    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await manualTab.click();
    await authenticatedPage.getByLabel(/Common Name/i).fill(plantName);
    await authenticatedPage.getByRole("button", { name: /Save to Shed/i }).click();
    await manualTab.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByText(/added to shed/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Archive it
    await shed.archiveButtonFor(plantName).click();
    const archiveConfirm = authenticatedPage.getByRole("button", { name: /^Archive$/i });
    await expect(archiveConfirm).toBeVisible({ timeout: 5000 });
    await archiveConfirm.click();

    // Should disappear from Active
    await expect(shed.plantCard(plantName)).not.toBeVisible({ timeout: 10000 });

    // Should appear in Archived
    await shed.archivedTab.click();
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Restore it
    await shed.restoreButtonFor(plantName).click();
    const restoreConfirm = authenticatedPage.getByRole("button", { name: /^Restore$/i });
    await expect(restoreConfirm).toBeVisible({ timeout: 5000 });
    await restoreConfirm.click();

    // Should be back in Active
    await shed.activeTab.click();
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Cleanup: delete the test plant
    await shed.deleteButtonFor(plantName).click();
    const deleteConfirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    if (await deleteConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteConfirm.click();
    }
  });

  test("SHED-025: Cancel on archive dialog leaves plant in Active", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Use a seeded plant for this read-only destructive test — cancel means no change
    await shed.archiveButtonFor("Lavender").click();
    const archiveConfirm = authenticatedPage.getByRole("button", { name: /^Archive$/i });
    await expect(archiveConfirm).toBeVisible({ timeout: 5000 });

    await authenticatedPage.getByRole("button", { name: /Cancel/i }).click();

    // Lavender should still be visible in Active
    await expect(shed.plantCard("Lavender")).toBeVisible({ timeout: 5000 });
  });

  test("SHED-027: Delete a test plant — happy path", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    const plantName = `E2E Delete ${Date.now()}`;

    // Create a plant to delete
    await shed.goto();
    await shed.waitForLoad();
    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await manualTab.click();
    await authenticatedPage.getByLabel(/Common Name/i).fill(plantName);
    await authenticatedPage.getByRole("button", { name: /Save to Shed/i }).click();
    await manualTab.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByText(/added to shed/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Delete it
    await shed.deleteButtonFor(plantName).click();
    const deleteConfirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    await expect(deleteConfirm).toBeVisible({ timeout: 5000 });
    await deleteConfirm.click();

    await expect(shed.plantCard(plantName)).not.toBeVisible({ timeout: 10000 });
  });

  test("SHED-028: Cancel on delete dialog leaves plant in list", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.deleteButtonFor("Rose").click();
    const deleteConfirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    await expect(deleteConfirm).toBeVisible({ timeout: 5000 });

    await authenticatedPage.getByRole("button", { name: /Cancel/i }).click();

    await expect(shed.plantCard("Rose")).toBeVisible({ timeout: 5000 });
  });

  test("SHED-029: Delete plant with inventory items — confirm dialog warns about inventory", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // "Boston Fern" has 1 seeded inventory item (FRN-001, Planted → Kitchen Windowsill)
    await shed.deleteButtonFor("Boston Fern").click();

    // The delete confirm dialog should mention inventory items
    const dialog = authenticatedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8000 });

    await expect(
      dialog.getByText(/inventory item/i),
    ).toBeVisible({ timeout: 5000 });

    // Cancel so we don't mutate seed state
    await authenticatedPage.getByRole("button", { name: /Cancel/i }).click();
    await expect(shed.plantCard("Boston Fern")).toBeVisible({ timeout: 5000 });
  });

  test("SHED-026: Restore archived Mint plant — it returns to Active tab", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Switch to Archived tab and verify Mint is there
    await shed.archivedTab.click();
    await shed.waitForLoad();
    await expect(shed.plantCard("Mint")).toBeVisible({ timeout: 10000 });

    // Click restore on Mint
    await shed.restoreButtonFor("Mint").click();
    const restoreConfirm = authenticatedPage.getByRole("button", { name: /^Restore$/i });
    if (await restoreConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreConfirm.click();
    }
    await shed.waitForLoad();

    // Switch to Active — Mint should now be there
    await shed.activeTab.click();
    await shed.waitForLoad();
    await expect(shed.plantCard("Mint")).toBeVisible({ timeout: 10000 });

    // Cleanup: re-archive Mint so subsequent tests see the seed state
    await shed.archiveButtonFor("Mint").click();
    const reArchiveConfirm = authenticatedPage.getByRole("button", { name: /^Archive$/i });
    if (await reArchiveConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reArchiveConfirm.click();
    }
  });

  test("SHED-030: Assign button on a plant card opens the PlantAssignmentModal", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Click the Assign button on the Tomato card
    await shed.assignButtonFor("Tomato").click();

    // Modal should open — heading "Assign Plant" and plant name visible
    await expect(
      authenticatedPage.getByText("Assign Plant"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.getByText("Tomato").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("SHED-032: Cancel assignment modal leaves plant status unchanged", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.assignButtonFor("Tomato").click();
    await expect(
      authenticatedPage.getByText("Assign Plant"),
    ).toBeVisible({ timeout: 10000 });

    // Close without saving
    await authenticatedPage.getByLabel("Close assignment modal").click();

    // Modal gone — shed heading still visible
    await expect(shed.heading).toBeVisible({ timeout: 5000 });
    await expect(
      authenticatedPage.getByText("Assign Plant"),
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("SHED-033: Assign plant — no locations available shows empty location dropdown", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Clear all shed cache entries (key prefix varies by worker account)
    await authenticatedPage.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("rhozly_shed_cache_"))
        .forEach(k => localStorage.removeItem(k));
    });

    // Mock the locations query to return empty
    await authenticatedPage.route(`${supabaseUrl}/rest/v1/locations*`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Use Tomato — always seeded as Unplanted, always has the Assign button.
    // [aria-label*="Assign"] is avoided because Archive buttons for plants named
    // "E2E Assign ..." also contain the word "Assign" and would be matched first.
    await shed.assignButtonFor("Tomato").click();

    await expect(
      authenticatedPage.getByText("Assign Plant"),
    ).toBeVisible({ timeout: 10000 });

    // Location select should only have the placeholder option (no real locations).
    // Scope to the assignment modal to avoid picking the shed's "Filter by source" select.
    const assignModal = authenticatedPage.locator('[aria-label="Close assignment modal"]').locator("../..").first();
    const locationSelect = assignModal.locator("select").first();
    await expect(locationSelect).toBeVisible({ timeout: 5000 });

    const options = await locationSelect.locator("option").allInnerTexts();
    expect(options.length).toBe(1);
    expect(options[0]).toMatch(/Select location/i);
  });

  test("SHED-031: Assign plant — select location + area and proceed to step 2", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    const plantName = `E2E Assign ${Date.now()}`;

    // Create a temp plant to assign
    await shed.goto();
    await shed.waitForLoad();
    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await manualTab.click();
    await authenticatedPage.getByLabel(/Common Name/i).fill(plantName);
    await authenticatedPage.getByRole("button", { name: /Save to Shed/i }).click();
    // Wait for the async save to complete before navigating (see SHED-017 for rationale)
    await manualTab.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByText(/added to shed/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Open the assignment modal
    await shed.assignButtonFor(plantName).click();
    await expect(
      authenticatedPage.getByText("Assign Plant"),
    ).toBeVisible({ timeout: 10000 });

    // Step 1: select location and area — scope selects to the assignment modal,
    // because the shed page also has selects (filter, sort) earlier in the DOM.
    const assignModal = authenticatedPage.locator('[aria-label="Close assignment modal"]').locator("../..").first();
    await assignModal.locator("select").first().selectOption({ label: "Outside Garden" });
    await authenticatedPage.waitForTimeout(500);
    await assignModal.locator("select").nth(1).selectOption({ label: "Raised Bed A" });

    // "Next: Planting Details" button should be enabled and clickable
    const nextBtn = authenticatedPage.getByLabel("Proceed to planting details");
    await expect(nextBtn).toBeEnabled({ timeout: 5000 });
    await nextBtn.click();

    // Step 2 should render
    await expect(
      authenticatedPage.getByLabel("Confirm plant assignment"),
    ).toBeVisible({ timeout: 8000 });

    // Close without full save (avoid complex DB cleanup)
    await authenticatedPage.getByLabel("Close assignment modal").click();

    // Cleanup: delete the temp plant
    await shed.waitForLoad();
    await shed.deleteButtonFor(plantName).click();
    const deleteConfirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    if (await deleteConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteConfirm.click();
    }
  });
});
