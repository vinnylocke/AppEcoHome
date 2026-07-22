import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";

// All tests require an authenticated session and the plants seed (02_plants_shed.sql).
// Seeded plants (active): Tomato, Basil, Rose, Boston Fern, Lavender
// Seeded plants (archived): Mint
// Source breakdown: Manual = Tomato, Basil, Rose, Boston Fern, Mint | API = Lavender
//
// IMPORTANT — DO NOT add a `beforeAll` that deletes "leftover" AI plants
// at sub-1M IDs. The Wave 5/6 AI freshness seed (13_ai_freshness.sql)
// inserts per-worker home forks at IDs like 200011 / 200013 / 300011 /
// 300013 / ... (see scripts/seed-test-db.mjs:63-64 for the substitution).
// Those rows look like leftovers but they're load-bearing fixtures for
// ai-plant-freshness.spec.ts + ai-plant-override.spec.ts. Killing them
// silently breaks 7 E2E tests across two specs.

test.describe("Shed — Tabs and view filters", () => {
  test("SHED-MOBILE-001: the search launcher + overflow menu (with Bulk add) are reachable on a phone-portrait viewport", async ({ authenticatedPage }) => {
    // Stage 3: the landing carries ONE primary affordance (the search
    // launcher); Bulk add lives in the ⋯ overflow menu.
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await expect(shed.addButton).toBeVisible({ timeout: 10000 });
    await shed.openOverflowMenu();
    await expect(shed.bulkAddButton).toBeVisible();
  });

  test("SHED-005: All is the default chip; the Active chip shows only live plants", async ({ authenticatedPage }) => {
    // Hub v3 Stage C — presence chips on derived data. Under All, Mint
    // (curated out but WITH history) is visible as Inactive; under Active
    // (live instance or sowing) it is not.
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await expect(shed.scopeHomeBtn).toHaveAttribute("aria-selected", "true");
    const cards = authenticatedPage.locator("[data-plant-card]");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    await shed.activeTab.click();
    await shed.waitForLoad();
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 }); // Unplanted counts as Active
    await expect(shed.plantCard("Mint")).not.toBeVisible();
  });

  test("SHED-006: the Inactive chip shows plants with only history (Mint)", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.inactiveChip.click();
    await shed.waitForLoad();

    await expect(shed.plantCard("Mint")).toBeVisible({ timeout: 10000 });
  });

  test("SHED-007: the Inactive chip does not show live plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.inactiveChip.click();
    await shed.waitForLoad();

    await expect(shed.plantCard("Tomato")).not.toBeVisible();
    await expect(shed.plantCard("Basil")).not.toBeVisible();
  });

  test("SHED-008: Filter by Manual source shows only manual plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.openFilters();

    await shed.sourceFilterSelect.selectOption("manual");
    await shed.closeFilters(); // Stage 3: the sheet covers the grid

    // Manual plants that are active: Tomato, Basil, Rose, Boston Fern
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 10000 });
    // Lavender (api source) should not appear
    await expect(shed.plantCard("Lavender")).not.toBeVisible();
  });

  test("SHED-009: Filter by Perenual (API) source shows only api-source plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.openFilters();

    await shed.sourceFilterSelect.selectOption("api");
    await shed.closeFilters(); // Stage 3: the sheet covers the grid

    // Lavender is the only api-source active plant
    await expect(shed.plantCard("Lavender")).toBeVisible({ timeout: 10000 });
    await expect(shed.plantCard("Tomato")).not.toBeVisible();
  });
});

// Stage 3 — ONE search: the landing grid-filter died; typed queries live in
// the takeover, where owned plants surface first ("In your garden").
test.describe("Shed — Search", () => {
  const ownedSection = (page: import("@playwright/test").Page) =>
    page.getByTestId("search-owned-section");

  test("SHED-010: Searching an owned plant surfaces it in the 'In your garden' section", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click(); // the launcher IS the search
    await shed.bulkSearchInput.fill("Tomato");

    await expect(ownedSection(authenticatedPage)).toBeVisible({ timeout: 10000 });
    await expect(ownedSection(authenticatedPage).getByText("In your garden")).toBeVisible();
    await expect(ownedSection(authenticatedPage).getByText("Tomato").first()).toBeVisible();
  });

  test("SHED-011: A no-match query shows no owned section and the zero-match copy", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("xyzqwerty");
    await authenticatedPage.waitForTimeout(900); // debounce + library round trip

    await expect(ownedSection(authenticatedPage)).toHaveCount(0);
    await expect(
      authenticatedPage.getByText(/Nothing called "xyzqwerty" yet/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test("SHED-012: The clear button empties the query and returns to the idle state", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("xyzqwerty");
    await authenticatedPage.getByTestId("plant-search-clear").click();

    await expect(shed.bulkSearchInput).toHaveValue("");
    await expect(authenticatedPage.getByTestId("search-idle-state")).toBeVisible({ timeout: 5000 });
  });

  test("SHED-A1: owned rows carry ONE derived presence pill (Active > Inactive > Saved)", async ({ authenticatedPage }) => {
    // Hub v3 Stage A — presence comes from the plant_presence VIEW, so the
    // exact state depends on live DB truth; the contract is: exactly one pill
    // per owned row, in the closed state set.
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("Tomato");

    const pill = authenticatedPage.locator('[data-testid^="search-owned-presence-"]').first();
    await expect(pill).toBeVisible({ timeout: 10000 });
    const state = await pill.getAttribute("data-presence");
    expect(["active", "inactive", "saved", "previously"]).toContain(state);
  });

  test("SHED-013: Owned-plant matching is case-insensitive", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("tomato");

    await expect(ownedSection(authenticatedPage).getByText("Tomato").first()).toBeVisible({ timeout: 10000 });
  });

  test("SHED-014: Partial owned-plant match works", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("Bos");

    await expect(ownedSection(authenticatedPage).getByText("Boston Fern").first()).toBeVisible({ timeout: 10000 });
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
    const saveBtn = authenticatedPage.getByRole("button", { name: /Add to Shed/i });
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
    await shed.openCardMenu(plantName);
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
    const saveBtn = authenticatedPage.getByRole("button", { name: /Add to Shed/i });
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

    const saveBtn = authenticatedPage.getByRole("button", { name: /Add to Shed/i });
    await saveBtn.click();

    // Duplicate check fires before insert — expect an error toast containing the plant name
    await expect(
      authenticatedPage.getByText(/already in your shed/i),
    ).toBeVisible({ timeout: 8000 });
  });

  test("SHED-020: Add to Shed — library-first search input opens by default", async ({ authenticatedPage }) => {
    // Library-first migration: the modal now opens straight onto the shared
    // <PlantSearch> input (no per-provider tabs, no premium wall — the local
    // library is free for every tier).
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();

    await expect(shed.bulkSearchInput).toBeVisible({ timeout: 8000 });
    await shed.bulkSearchInput.fill("Tomato");
    // Debounced library search runs automatically — seed 17 guarantees a
    // Tomato library row (910001) so the row contract is deterministic.
    await expect(
      authenticatedPage.getByTestId("plant-search-result-library-910001"),
    ).toBeVisible({ timeout: 8000 });

    // The opt-in "Search wider" CTA is offered (live, not a nudge).
    await expect(shed.bulkSearchExternalBtn).toBeVisible({ timeout: 6000 });
  });

  test("SHED-022a: Add to Shed — external opt-in surfaces a result, selectable into the cart", async ({ authenticatedPage }) => {
    // Mock Perenual external API so the opt-in wider search yields a row.
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

    await expect(shed.bulkSearchInput).toBeVisible({ timeout: 8000 });
    await shed.bulkSearchInput.fill("Tomato");
    await authenticatedPage.waitForTimeout(700);

    // Click the opt-in wider search (Perenual self-gates internally — skip if absent).
    if (!(await shed.bulkSearchExternalBtn.isVisible({ timeout: 6000 }).catch(() => false))) return;
    await shed.bulkSearchExternalBtn.click();
    await authenticatedPage.waitForTimeout(1200);

    // A result row should appear (seed-17 library row and/or the mocked
    // external row).
    await expect(shed.bulkResultFirst).toBeVisible({ timeout: 6000 });

    // Overlay contract (Stage 1): tapping the row BODY opens the full detail
    // modal (care/grow/companions) WITHOUT selecting — viewing ≠ adding.
    await shed.bulkResultFirst.click();
    await expect(shed.bulkDetailModal).toBeVisible({ timeout: 8000 });
    await expect(shed.bulkReviewBtn).toHaveCount(0); // nothing selected yet
    await shed.bulkDetailClose.click();
    await expect(shed.bulkDetailModal).toBeHidden({ timeout: 6000 });

    // The trailing + button adds it to the cart — the top-bar basket (the
    // review opener) pops in only once something is selected.
    await shed.bulkResultAddFirst.click();
    await expect(shed.bulkReviewBtn).toBeVisible({ timeout: 6000 });
  });

  test("SHED-021: Add to Shed — nonsense query surfaces no selectable rows", async ({ authenticatedPage }) => {
    // Mock Perenual returning an empty result set so the opt-in wider search is empty too.
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

    await expect(shed.bulkSearchInput).toBeVisible({ timeout: 8000 });
    await shed.bulkSearchInput.fill("xyznotarealplant");
    await authenticatedPage.waitForTimeout(700);

    if (await shed.bulkSearchExternalBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await shed.bulkSearchExternalBtn.click();
      await authenticatedPage.waitForTimeout(1000);
    }

    // No result rows and therefore no review CTA when nothing matches.
    expect(await shed.bulkResultFirst.isVisible({ timeout: 2000 }).catch(() => false)).toBe(false);
    await expect(shed.bulkReviewBtn).toHaveCount(0);
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

  test("SHED-023b: Tile light icon opens the plant edit modal on the Light tab", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });

    // Tap the light-needs icon on the tile (not the card body).
    await shed.openCardMenu("Tomato");
    await shed.lightButtonFor("Tomato").click();

    // The edit modal opens straight onto the Light tab — its content
    // (optimal range / no-data / get-reading button) renders, which only
    // happens on the Light tab, proving it didn't open on Care.
    await expect(shed.modalLightTab).toBeVisible({ timeout: 8000 });
    await expect(shed.lightTabContent).toBeVisible({ timeout: 8000 });
  });

  test("SHED-SOIL-001: Soil Needs tab renders the plant's sensor requirements", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.plantCard("Tomato").click();
    await expect(authenticatedPage.getByText("Tomato").first()).toBeVisible({ timeout: 10000 });

    await authenticatedPage.getByRole("button", { name: "Soil Needs", exact: true }).click();

    const tab = authenticatedPage.locator('[data-testid="sensor-requirements-tab"]');
    await expect(tab).toBeVisible({ timeout: 8000 });
    // Either the plant already has ranges (list) or it doesn't yet (empty state)
    // — both are valid; the tab must render exactly one of them.
    const list = authenticatedPage.locator('[data-testid="sensor-requirements-list"]');
    const empty = authenticatedPage.locator('[data-testid="sensor-requirements-empty"]');
    await expect(list.or(empty)).toBeVisible({ timeout: 8000 });
  });

  test("SHED-023c: Deleting a plant with instances offers keep-history vs delete-everything", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Tomato (seed) has one inventory instance, so delete shows the choice.
    const tomato = shed.plantCard("Tomato");
    if (!(await tomato.isVisible({ timeout: 8000 }).catch(() => false))) return;

    await shed.openCardMenu("Tomato");

    await shed.deleteButtonFor("Tomato").click();
    await expect(shed.deleteWithInstancesModal).toBeVisible({ timeout: 8000 });
    await expect(shed.deleteKeepEol).toBeVisible();
    await expect(shed.deleteEverything).toBeVisible();

    // Non-destructive — cancel so the seed stays intact for other tests.
    await authenticatedPage.keyboard.press("Escape");
    await expect(shed.deleteWithInstancesModal).toBeHidden({ timeout: 5000 });
  });

  test("SHED-023d: Bulk delete offers keep-history vs delete-everything for selected plants with instances", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const tomato = shed.plantCard("Tomato");
    if (!(await tomato.isVisible({ timeout: 8000 }).catch(() => false))) return;

    await shed.openOverflowMenu(); // Stage 3: Select mode lives in the ⋯ menu
    await shed.selectModeBtn.click();
    await tomato.click(); // select Tomato (has a seeded instance)
    await expect(shed.bulkActionBar).toBeVisible({ timeout: 6000 });

    await shed.bulkDeleteBtn.click();
    await expect(shed.bulkDeleteModal).toBeVisible({ timeout: 8000 });
    await expect(shed.bulkDeleteKeepEol).toBeVisible();
    await expect(shed.bulkDeleteEverything).toBeVisible();

    // Non-destructive — cancel so the seed stays intact.
    await authenticatedPage.keyboard.press("Escape");
    await expect(shed.bulkDeleteModal).toBeHidden({ timeout: 5000 });
  });

  test("SHED-023e: Bulk assign opens the assign modal for selected plants", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const tomato = shed.plantCard("Tomato");
    if (!(await tomato.isVisible({ timeout: 8000 }).catch(() => false))) return;

    await shed.openOverflowMenu(); // Stage 3: Select mode lives in the ⋯ menu
    await shed.selectModeBtn.click();
    await tomato.click();
    await expect(shed.bulkActionBar).toBeVisible({ timeout: 6000 });

    await shed.bulkAssignBtn.click();
    await expect(shed.bulkAssignModal).toBeVisible({ timeout: 8000 });
    // Per-plant quantity input + the "add to garden" target option are present.
    await expect(shed.bulkAssignNoArea).toBeVisible();
    await expect(shed.bulkAssignConfirm).toBeVisible();

    // Non-destructive — close without assigning.
    await authenticatedPage.keyboard.press("Escape");
  });

  test("SHED-024: Archive and restore a plant within a single test (legacy filter flag)", async ({ authenticatedPage }) => {
    // Hub v3 Stage C: an archived plant with NO history is search-only in the
    // derived model — this round trip exercises the LEGACY fallback axis
    // (rhozly_legacy_shed_filters=on), which must keep working.
    await authenticatedPage.addInitScript(() => localStorage.setItem("rhozly_legacy_shed_filters", "on"));
    const shed = new ShedPage(authenticatedPage);
    const plantName = `E2E Archive ${Date.now()}`;

    // Create a plant to archive
    await shed.goto();
    await shed.waitForLoad();
    await shed.addButton.click();
    const manualTab = authenticatedPage.getByRole("tab", { name: /Manual/i });
    await manualTab.click();
    await authenticatedPage.getByLabel(/Common Name/i).fill(plantName);
    await authenticatedPage.getByRole("button", { name: /Add to Shed/i }).click();
    await manualTab.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByText(/added to shed/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Archive it
    await shed.openCardMenu(plantName);
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
    await shed.openCardMenu(plantName);
    await shed.restoreButtonFor(plantName).click();
    const restoreConfirm = authenticatedPage.getByRole("button", { name: /^Restore$/i });
    await expect(restoreConfirm).toBeVisible({ timeout: 5000 });
    await restoreConfirm.click();

    // Should be back in Active
    await shed.activeTab.click();
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Cleanup: delete the test plant
    await shed.openCardMenu(plantName);
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

    // Use Tomato — the only seeded plant with no AI-freshness fork (the
    // forks at id 200013 / 200011 collide with Lavender / Cherry Tomato
    // by common name in the Shed list, which would trip strict-mode
    // matching on getByLabel("Archive Lavender")).
    await shed.openCardMenu("Tomato");
    await shed.archiveButtonFor("Tomato").click();
    const archiveConfirm = authenticatedPage.getByRole("button", { name: /^Archive$/i });
    await expect(archiveConfirm).toBeVisible({ timeout: 5000 });

    await authenticatedPage.getByRole("button", { name: /Cancel/i }).click();

    // Tomato should still be visible in Active
    await expect(shed.plantCard("Tomato")).toBeVisible({ timeout: 5000 });
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
    await authenticatedPage.getByRole("button", { name: /Add to Shed/i }).click();
    await manualTab.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByText(/added to shed/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plantName)).toBeVisible({ timeout: 10000 });

    // Delete it
    await shed.openCardMenu(plantName);
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

    await shed.openCardMenu("Rose");

    await shed.deleteButtonFor("Rose").click();
    // Rose has 1 seeded inventory item, so the bulk-delete choice dialog
    // appears instead of the simple Delete/Cancel modal. Verify the dialog
    // opened, then Cancel — Rose should remain on the list.
    const dialog = authenticatedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByRole("button", { name: /Delete everything|^Delete$/i }),
    ).toBeVisible({ timeout: 5000 });

    await dialog.getByRole("button", { name: /Cancel/i }).click();

    await expect(shed.plantCard("Rose")).toBeVisible({ timeout: 5000 });
  });

  test("SHED-029: Delete plant with inventory items — confirm dialog warns about inventory", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // "Boston Fern" has 1 seeded inventory item (FRN-001, Planted → Kitchen Windowsill)
    await shed.openCardMenu("Boston Fern");
    await shed.deleteButtonFor("Boston Fern").click();

    // The delete confirm dialog should warn about the plant being in the
    // garden. The bulk-delete dialog says "Boston Fern has 1 plant in your
    // garden"; the legacy simple-confirm dialog said "1 inventory item".
    const dialog = authenticatedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8000 });

    await expect(
      dialog.getByText(/plant in your garden|inventory item/i),
    ).toBeVisible({ timeout: 5000 });

    // Cancel so we don't mutate seed state
    await dialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(shed.plantCard("Boston Fern")).toBeVisible({ timeout: 5000 });
  });

  test("SHED-026: Un-archiving Mint keeps it under Inactive — presence is derived, not curated", async ({ authenticatedPage }) => {
    // Hub v3 Stage C: restoring the CURATION bit doesn't revive dead plants.
    // Mint's only instance has ended, so it stays under Inactive either way.
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.inactiveChip.click();
    await shed.waitForLoad();
    await expect(shed.plantCard("Mint")).toBeVisible({ timeout: 10000 });

    // Un-archive (save back to the garden).
    await shed.openCardMenu("Mint");
    await shed.restoreButtonFor("Mint").click();
    const restoreConfirm = authenticatedPage.getByRole("button", { name: /^Restore$/i });
    if (await restoreConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreConfirm.click();
    }
    await shed.waitForLoad();

    // Still under Inactive — its only instance is ended.
    await expect(shed.plantCard("Mint")).toBeVisible({ timeout: 10000 });

    // Cleanup: re-archive Mint so subsequent tests see the seed state
    await shed.openCardMenu("Mint");
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
    await authenticatedPage.getByRole("button", { name: /Add to Shed/i }).click();
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
    await shed.openCardMenu(plantName);
    await shed.deleteButtonFor(plantName).click();
    const deleteConfirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    if (await deleteConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteConfirm.click();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RHO-4 — Bulk add: CSV upload + downloadable template + favourites-on-upload.
// The CSV path is deterministic + tier-free (no Gemini) and both entry paths
// feed the same review step.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Shed — Bulk add (RHO-4 CSV upload)", () => {
  test("SHED-BULK-001: Bulk add opens with a mode toggle (Paste / Upload CSV)", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.openBulkAdd();
    await expect(shed.bulkAddModePaste).toBeVisible({ timeout: 5000 });
    await expect(shed.bulkAddModeCsv).toBeVisible();
  });

  test("SHED-BULK-002: CSV mode exposes a Download template button", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.openBulkAdd();
    await shed.bulkAddModeCsv.click();

    // The download triggers a real Blob download; assert filename via the event.
    const [download] = await Promise.all([
      authenticatedPage.waitForEvent("download", { timeout: 8000 }),
      shed.csvTemplateDownload.click(),
    ]);
    expect(download.suggestedFilename()).toBe("rhozly-plants-template.csv");
  });

  test("SHED-BULK-003: Uploading a CSV shows review rows; bad row is flagged and excluded", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.openBulkAdd();
    await shed.bulkAddModeCsv.click();

    // One valid row + one invalid row (watering min > max).
    const csv =
      "common_name,watering_min_days,watering_max_days\n" +
      "E2E CSV Good,2,5\n" +
      "E2E CSV Bad,10,3\n";
    await shed.uploadCsv("plants.csv", csv);

    // Two candidate cards render; the bad one shows an error block.
    await expect(shed.bulkAddCandidate(0)).toBeVisible({ timeout: 8000 });
    await expect(shed.bulkAddCandidate(1)).toBeVisible();
    await expect(shed.bulkAddCandidateErrors(1)).toBeVisible();

    // The save button counts only the valid row.
    await expect(shed.bulkAddSave).toContainText(/Add 1 plant/i, { timeout: 5000 });
  });

  test("SHED-BULK-004: Import valid CSV rows creates manual plants + a favourite", async ({ authenticatedPage }) => {
    // Creates two plants, verifies both grids + the favourites scope, then
    // cleans up (unfavourite + delete both) — give it headroom past the default 30s.
    test.setTimeout(90_000);
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const stamp = Date.now();
    const plainName = `E2E CSV Plain ${stamp}`;
    const favName = `E2E CSV Fav ${stamp}`;

    await shed.openBulkAdd();
    await shed.bulkAddModeCsv.click();

    const csv =
      "common_name,favourite\n" +
      `${plainName},false\n` +
      `${favName},true\n`;
    await shed.uploadCsv("plants.csv", csv);

    await expect(shed.bulkAddCandidate(0)).toBeVisible({ timeout: 8000 });
    // The favourite column pre-ticks the second row's checkbox.
    await expect(shed.bulkAddCandidateFavourite(1)).toBeChecked();

    await shed.bulkAddSave.click();

    // Success toast confirms the serial saves finished, then the modal closes.
    await authenticatedPage.getByText(/added .* to your shed/i)
      .waitFor({ state: "visible", timeout: 15000 });
    await shed.bulkAddModal.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    await authenticatedPage.goto("/shed");
    await shed.waitForLoad();
    await expect(shed.plantCard(plainName)).toBeVisible({ timeout: 10000 });
    await expect(shed.plantCard(favName)).toBeVisible({ timeout: 10000 });

    // The favourited row shows in the Favourites scope.
    await shed.gotoFavourites();
    await shed.waitForLoad();
    await expect(shed.favouriteCard(favName)).toBeVisible({ timeout: 10000 });
    await expect(shed.favouriteCard(plainName)).toHaveCount(0);

    // ── Cleanup: unfavourite + delete both test plants ──
    const favRemove = shed.favouriteRemoveIn(shed.favouriteCard(favName));
    if (await favRemove.isVisible({ timeout: 4000 }).catch(() => false)) {
      await favRemove.click();
    }
    for (const name of [plainName, favName]) {
      // Reload between deletes so the previous confirm overlay is fully gone
      // and the grid reflects the last deletion.
      await authenticatedPage.goto("/shed");
      await shed.waitForLoad();
      // Phase 4.3: delete lives in the card kebab menu, so gate on the CARD
      // being present, then open the menu before clicking.
      if (!(await shed.plantCard(name).isVisible({ timeout: 4000 }).catch(() => false))) continue;
      await shed.openCardMenu(name);
      await shed.deleteButtonFor(name).click();
      const confirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
      if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
        await confirm.click();
        await expect(shed.plantCard(name)).toHaveCount(0, { timeout: 8000 }).catch(() => {});
      }
    }
  });

  test("SHED-BULK-005: Free-text paste still works and reaches the shared review step", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.openBulkAdd();
    // Paste mode is the default — type a one-line list and parse.
    await authenticatedPage.locator('[data-testid="bulk-paste-textarea"]').fill("Foxglove");
    await authenticatedPage.locator('[data-testid="bulk-paste-parse"]').click();

    // Review step: the candidate card + the shared "Mark all as favourites" toggle.
    await expect(shed.bulkAddCandidate(0)).toBeVisible({ timeout: 10000 });
    await expect(shed.bulkAddFavouriteAll).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full-page "Find a plant" takeover (ailment-library-shed-search overhaul
// Stage 2, 2026-07-21) — the add flow is a page, not a modal.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Shed — plant-search takeover (Stage 2)", () => {
  test("SHED-TKO-001: ?open=add-plant&query= deep-links into the full-page takeover with the query seeded", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed?open=add-plant&query=tomato");
    const takeover = authenticatedPage.getByTestId("plant-search-takeover");
    await expect(takeover).toBeVisible({ timeout: 15000 });
    // It's a page, not a dialog — no aria-modal overlay in the way.
    await expect(authenticatedPage.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
    // The seeded query reached the shared search input.
    await expect(authenticatedPage.getByTestId("plant-search-input")).toHaveValue("tomato");
    // The params were consumed (deep-link contract preserved).
    await expect(authenticatedPage).not.toHaveURL(/open=add-plant/);
  });

  test("SHED-TKO-002: the takeover's back button returns to the Shed grid", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await expect(authenticatedPage.getByTestId("plant-search-takeover")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("shed-search-back").click();
    await expect(authenticatedPage.getByTestId("plant-search-takeover")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("shed-plant-list")).toBeVisible({ timeout: 10000 });
  });

  test("SHED-TKO-003: the overlay pins the search input keyboard-safe at the top and covers the app chrome", async ({ authenticatedPage }) => {
    // Stage 1 regression guard: the previous takeover put the input at y=601
    // on a phone — under the keyboard, zero results visible. The overlay must
    // keep the input inside the top band at ANY viewport (top bar is
    // top-anchored) and sit above the app header (z-[60] > header z-50).
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();
    await shed.addButton.click();

    await expect(shed.bulkSearchInput).toBeVisible({ timeout: 10000 });
    const box = await shed.bulkSearchInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(130);

    // The overlay paints OVER the app header — the element at the input's
    // centre point must be the input itself, not header chrome.
    const hit = await authenticatedPage.evaluate(() => {
      const el = document.querySelector('[data-testid="plant-search-input"]');
      if (!el) return "missing";
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        ?.getAttribute("data-testid") ?? "occluded";
    });
    expect(hit).toBe("plant-search-input");

    // Escape ladder: a typed query clears first; a second Escape closes.
    await shed.bulkSearchInput.fill("lavender");
    await authenticatedPage.keyboard.press("Escape");
    await expect(shed.bulkSearchInput).toHaveValue("");
    await expect(authenticatedPage.getByTestId("plant-search-takeover")).toBeVisible();
    await authenticatedPage.keyboard.press("Escape");
    await expect(authenticatedPage.getByTestId("plant-search-takeover")).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Search-first landing (overhaul Stage 3, 2026-07-21) — hero search,
// library-escalation row, persona browse chips.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Shed — search-first landing (Stage 3)", () => {
  test("SHED-S3-001: one search, two worlds — an owned-plant query shows 'In your garden' AND library results together", async ({ authenticatedPage }) => {
    // Stage 3 landing diet: the escalation row died with the landing filter —
    // owned matches and library results now coexist in the single takeover.
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    await shed.bulkSearchInput.fill("Tomato");

    await expect(authenticatedPage.getByTestId("search-owned-section")).toBeVisible({ timeout: 10000 });
    // Seed-17 library Tomato (910001) renders below the owned section.
    await expect(authenticatedPage.getByTestId("plant-search-result-library-910001")).toBeVisible({ timeout: 10000 });
  });

  test("SHED-S3-002: persona browse chips live in the takeover's idle state and seed browse-by-filter mode", async ({ authenticatedPage }) => {
    // Worker accounts seed persona = NULL → "new" → chips render in the
    // takeover idle state (no longer gated on shed size — Stage 3 re-home).
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.addButton.click();
    const chips = authenticatedPage.getByTestId("shed-browse-chips");
    await expect(chips).toBeVisible({ timeout: 8000 });
    await authenticatedPage.getByTestId("shed-browse-chip-edible-favourites").click();
    // The seeded filter opens the panel so the active filter is visible.
    await expect(authenticatedPage.getByTestId("plant-search-filter-panel")).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Favourites that act (overhaul Stage 4, 2026-07-21) — "Add & assign…" copies a
// cross-home favourite into this home and opens the assignment flow on it.
// Fixture: favourite 0017-…03 ("Fig") — a live cross-home favourite whose plant
// is NOT in this home, so the action buttons render (15_favourites.sql).
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Shed — favourites Add & assign (Stage 4)", () => {
  const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
  const FIG_FAV_ID = `0000000${workerNum}-0000-0000-0017-000000000003`;

  test("SHED-FAV-001: Add & assign copies the favourite home and opens the assignment modal (self-cleaning)", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await authenticatedPage.goto("/shed?scope=favourites");
    await shed.waitForLoad();

    const addAssign = authenticatedPage.getByTestId(`favourite-add-assign-${FIG_FAV_ID}`);
    // If a previous run left the Fig in-home, the buttons are replaced by the
    // "In this home" chip — clean it below either way; skip only if truly absent.
    if (!(await addAssign.isVisible().catch(() => false))) {
      test.skip(
        await authenticatedPage.getByTestId(`favourite-in-home-${FIG_FAV_ID}`).isVisible().catch(() => false),
        "Fig already in home from a previous run — cleaned at the end of a full pass",
      );
    }
    await addAssign.click();

    // The copy lands and the assignment flow opens on the fresh row.
    await expect(authenticatedPage.getByText("Assign Plant")).toBeVisible({ timeout: 15000 });
    await authenticatedPage.getByLabel("Close assignment modal").click();

    // Self-clean: the copy (no instances — we cancelled) is deleted through
    // the standard card flow so the seeded fixture state is restored. (The
    // landing text-filter died in Stage 3 — locate the card directly.)
    await expect(authenticatedPage.getByTestId("shed-plant-list")).toBeVisible({ timeout: 10000 });
    const figCard = authenticatedPage.locator("[data-plant-card]").filter({ hasText: "Fig" }).first();
    await expect(figCard).toBeVisible({ timeout: 10000 });
    const figId = await figCard.getAttribute("data-testid");
    const id = figId?.replace("plant-card-", "") ?? "";
    await authenticatedPage.getByTestId(`plant-card-kebab-${id}`).click();
    await authenticatedPage.getByTestId(`plant-card-menu-${id}`).getByText("Delete").click();
    await authenticatedPage.getByRole("button", { name: /^Delete$/i }).click();
    await expect(figCard).toHaveCount(0, { timeout: 10000 });
  });
});
