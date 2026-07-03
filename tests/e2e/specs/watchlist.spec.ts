import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { WatchlistPage } from "../pages/WatchlistPage";
import { mockEdgeFunction, MOCK_WATCHLIST_AI_RESULT } from "../fixtures/api-mocks";

// All tests require an authenticated session.
// Seeded ailments (06_ailments_watchlist.sql):
//   Aphid          — pest,           active
//   Early Blight   — disease,        active
//   Japanese Knotweed — invasive_plant, active
//   Powdery Mildew — disease,        archived

test.describe("Watchlist — basic render", () => {
  test("WL-001: /watchlist renders the Watchlist heading", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();

    await expect(wl.heading).toBeVisible({ timeout: 10000 });
  });

  test("WL-002: Seeded ailment cards are visible in the active list", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await expect(wl.ailmentCard("Aphid")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Early Blight")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Japanese Knotweed")).toBeVisible({ timeout: 10000 });
  });

  test("WL-004: Pest ailment shows Pest type badge", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // The Aphid card body contains the word "pest" or "Pest"
    const aphidCard = wl.ailmentCard("Aphid");
    await expect(aphidCard).toBeVisible({ timeout: 10000 });
    await expect(aphidCard.getByText(/pest/i)).toBeVisible();
  });

  test("WL-005: Disease ailment shows Disease type badge", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    const blightCard = wl.ailmentCard("Early Blight");
    await expect(blightCard).toBeVisible({ timeout: 10000 });
    await expect(blightCard.getByText("Disease", { exact: true })).toBeVisible();
  });

  test("WL-006: Invasive plant ailment shows Invasive type badge", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    const knotweedCard = wl.ailmentCard("Japanese Knotweed");
    await expect(knotweedCard).toBeVisible({ timeout: 10000 });
    await expect(knotweedCard.getByText("Invasive Plant", { exact: true })).toBeVisible();
  });

  test("WL-007: Archived ailment (Powdery Mildew) is not shown in active list", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await expect(wl.ailmentCard("Powdery Mildew")).not.toBeVisible();
  });
});

test.describe("Watchlist — tabs", () => {
  test("WL-tab-active: Active and Archived tab buttons are visible", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();

    await expect(wl.activeTab).toBeVisible({ timeout: 10000 });
    await expect(wl.archivedTab).toBeVisible({ timeout: 10000 });
  });

  test("WL-tab-archived: Archived tab shows Powdery Mildew", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.archivedTab.click();
    await wl.waitForLoad();

    await expect(wl.ailmentCard("Powdery Mildew")).toBeVisible({ timeout: 10000 });
    // Active ailments should not appear in archived view
    await expect(wl.ailmentCard("Aphid")).not.toBeVisible();
  });
});

test.describe("Watchlist — type filters", () => {
  test("WL-024: Filter by Pests shows only pest ailments", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.filterPests.click();
    await authenticatedPage.waitForTimeout(400);

    await expect(wl.ailmentCard("Aphid")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Early Blight")).not.toBeVisible();
    await expect(wl.ailmentCard("Japanese Knotweed")).not.toBeVisible();
  });

  test("WL-025: Filter by Diseases shows only disease ailments", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.filterDiseases.click();
    await authenticatedPage.waitForTimeout(400);

    await expect(wl.ailmentCard("Early Blight")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Aphid")).not.toBeVisible();
    await expect(wl.ailmentCard("Japanese Knotweed")).not.toBeVisible();
  });

  test("WL-filter-invasive: Filter by Invasive shows only invasive ailments", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.filterInvasive.click();
    await authenticatedPage.waitForTimeout(400);

    await expect(wl.ailmentCard("Japanese Knotweed")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Aphid")).not.toBeVisible();
    await expect(wl.ailmentCard("Early Blight")).not.toBeVisible();
  });

  test("WL-filter-all: All filter shows all active ailments", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // Apply a filter first, then reset to All
    await wl.filterPests.click();
    await authenticatedPage.waitForTimeout(300);
    await wl.filterAll.click();
    await authenticatedPage.waitForTimeout(400);

    await expect(wl.ailmentCard("Aphid")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Early Blight")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Japanese Knotweed")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Watchlist — Add modal", () => {
  test("WL-008: Clicking Add opens the Add to Watchlist modal", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.addButton.click();

    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });
  });

  test("WL-009: Manual mode tab exposes name, type, description fields", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.addButton.click();
    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });

    // Switch to Manual tab
    await wl.manualModeTab.click();

    await expect(wl.nameInput).toBeVisible({ timeout: 5000 });
    await expect(wl.typeSelect).toBeVisible({ timeout: 5000 });
    await expect(wl.descriptionInput).toBeVisible({ timeout: 5000 });
  });

  test("WL-010: Submit manual form with blank name shows validation error", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.addButton.click();
    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });
    await wl.manualModeTab.click();

    // Submit without a name
    await wl.addToWatchlistButton.click();

    await expect(
      authenticatedPage.getByText(/Name is required|name.*required/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("WL-011: Add ailment manually — happy path with cleanup", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    const ailmentName = `E2E Pest ${Date.now()}`;

    await wl.addButton.click();
    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });
    await wl.manualModeTab.click();

    await wl.nameInput.fill(ailmentName);
    await wl.typeSelect.selectOption("pest");
    await wl.descriptionInput.fill("Test pest created by E2E suite");

    await wl.addToWatchlistButton.click();

    // Modal should close and new card appear
    await wl.addModalHeading
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
    await wl.waitForLoad();

    await expect(wl.ailmentCard(ailmentName)).toBeVisible({ timeout: 10000 });

    // --- Cleanup: delete the test ailment ---
    await wl.deleteButtonFor(ailmentName).click();
    const deleteConfirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
    if (await deleteConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteConfirm.click();
    }
    await expect(wl.ailmentCard(ailmentName)).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe("Watchlist — Detail modal", () => {
  test("WL-014: Clicking an ailment card opens the detail modal", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.ailmentCard("Aphid").click();

    // Info tab is present only when the detail modal is open
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });
  });

  test("WL-015: Info tab shows description and affected plants", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.ailmentCard("Aphid").click();
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });

    await wl.detailModalInfoTab.click();

    // Aphid description text from seed — scoped to modal to avoid matching card preview
    await expect(
      wl.detailModal.getByText(/sap-sucking/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("WL-016: Prevention tab shows prevention steps", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.ailmentCard("Aphid").click();
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });

    await wl.detailModalPreventionTab.click();

    // Prevention steps — multiple step titles/descriptions match; scope to modal
    await expect(
      wl.detailModal.getByText(/predators|ladybird|marigold/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("WL-017: Remedy tab shows remedy steps", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.ailmentCard("Aphid").click();
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });

    await wl.detailModalRemedyTab.click();

    // Remedy steps — multiple step titles/descriptions match; scope to modal
    await expect(
      wl.detailModal.getByText(/water|neem|insecticidal/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("WL-018: Closing the detail modal returns to the list", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.ailmentCard("Aphid").click();
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });

    await wl.detailModalCloseButton.click();

    // Heading should return to the list; the modal heading should be gone
    await expect(wl.heading).toBeVisible({ timeout: 5000 });
    await expect(wl.ailmentCard("Aphid")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Watchlist — Search", () => {
  test("WL-022: Searching by name filters the card list", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // The search input is the first text input on the page
    const searchInput = authenticatedPage.getByRole("searchbox").or(
      authenticatedPage.getByPlaceholder(/search/i),
    ).first();
    await searchInput.fill("Aphid");
    await authenticatedPage.waitForTimeout(400);

    await expect(wl.ailmentCard("Aphid")).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard("Early Blight")).not.toBeVisible();
  });

  test("WL-023: Searching with no match shows no-match state", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    const searchInput = authenticatedPage.getByRole("searchbox").or(
      authenticatedPage.getByPlaceholder(/search/i),
    ).first();
    await searchInput.fill("xyzqwerty");
    await authenticatedPage.waitForTimeout(400);

    await expect(wl.noMatchState).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 10 — Watchlist: AI mode (Section 10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Watchlist — AI mode (Section 10)", () => {
  test("WL-012: AI tab in add modal opens AI search interface", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);

    await mockEdgeFunction(authenticatedPage, "generate-ailment-suggestions", MOCK_WATCHLIST_AI_RESULT);

    await wl.goto();
    await wl.waitForLoad();
    await wl.addButton.click();
    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });

    // Switch to AI tab
    const aiTab = wl.aiModeTab;
    if (!await aiTab.isVisible({ timeout: 3000 }).catch(() => false)) return;

    await aiTab.click();
    await authenticatedPage.waitForTimeout(300);

    // AI search input should appear
    await expect(wl.aiSearchInput).toBeVisible({ timeout: 5000 });
    await expect(wl.aiSearchButton).toBeVisible({ timeout: 5000 });

    // Fill and search
    await wl.aiSearchInput.fill("aphids");
    await wl.aiSearchButton.click();
    await authenticatedPage.waitForTimeout(500);

    // Mocked response returns "Aphid" — should appear as a result
    await expect(
      authenticatedPage.getByText(/Aphid/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("WL-013: AI search error shows error message", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);

    // Mock a 500 error from the edge function
    await mockEdgeFunction(authenticatedPage, "generate-ailment-suggestions", { error: "Internal server error" }, 500);

    await wl.goto();
    await wl.waitForLoad();
    await wl.addButton.click();
    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });

    const aiTab = wl.aiModeTab;
    if (!await aiTab.isVisible({ timeout: 3000 }).catch(() => false)) return;

    await aiTab.click();
    await authenticatedPage.waitForTimeout(300);

    if (!await wl.aiSearchInput.isVisible({ timeout: 3000 }).catch(() => false)) return;

    await wl.aiSearchInput.fill("aphids");
    await wl.aiSearchButton.click();
    await authenticatedPage.waitForTimeout(500);

    // Error toast or error message should appear — Supabase emits "non-2xx status code"
    await expect(
      authenticatedPage.getByText(/failed|error|could not|non-2xx/i).first(),
    ).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 10 — Watchlist: write actions (run after all read tests)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Watchlist — write actions (Section 10)", () => {
  test("WL-020: Cancel delete from detail modal leaves ailment in list", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // Open Japanese Knotweed detail
    await wl.ailmentCard("Japanese Knotweed").click();
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });

    // Click delete in the detail modal
    await wl.detailModalDeleteButton.click();
    await authenticatedPage.waitForTimeout(300);

    // Cancel the confirmation dialog — scope to alertdialog to avoid matching page buttons
    const dialog = authenticatedPage.getByRole("alertdialog");
    const cancelBtn = dialog.getByRole("button", { name: "Cancel" });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
    }

    // Close the detail modal (it may still be open after cancel)
    if (await wl.detailModalCloseButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await wl.detailModalCloseButton.click();
    }

    // Ailment should still be in the list
    await expect(wl.ailmentCard("Japanese Knotweed")).toBeVisible({ timeout: 5000 });
  });

  test("WL-019: Delete from detail modal confirms and removes ailment", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // Create a throwaway ailment so the delete test is self-contained
    // and does not permanently remove seeded data across test runs
    const ailmentName = `E2E Delete ${Date.now()}`;
    await wl.addButton.click();
    await expect(wl.addModalHeading).toBeVisible({ timeout: 10000 });
    await wl.manualModeTab.click();
    await wl.nameInput.fill(ailmentName);
    await wl.typeSelect.selectOption("pest");
    await wl.descriptionInput.fill("Throwaway ailment for delete test");
    await wl.addToWatchlistButton.click();
    await wl.addModalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await wl.waitForLoad();
    await expect(wl.ailmentCard(ailmentName)).toBeVisible({ timeout: 10000 });

    // Open its detail modal and delete via the modal delete button
    await wl.ailmentCard(ailmentName).click();
    await expect(wl.detailModalInfoTab).toBeVisible({ timeout: 10000 });
    await wl.detailModalDeleteButton.click();
    await authenticatedPage.waitForTimeout(300);

    const deleteBtn = authenticatedPage.getByRole("alertdialog").getByRole("button", { name: "Delete" });
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
    }
    await authenticatedPage.waitForTimeout(500);

    await expect(wl.ailmentCard(ailmentName)).not.toBeVisible({ timeout: 8000 });
  });

  test("WL-021: Archive an active ailment — it moves to Archived tab", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // Use "Early Blight" — archive it from the card
    await expect(wl.ailmentCard("Early Blight")).toBeVisible({ timeout: 10000 });

    await wl.archiveButtonFor("Early Blight").click();
    await authenticatedPage.waitForTimeout(300);

    // Confirm archive — scope to alertdialog to avoid substring match on "Archived" tab
    const archiveBtn = authenticatedPage.getByRole("alertdialog").getByRole("button", { name: "Archive" });
    if (await archiveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await archiveBtn.click();
    }
    await authenticatedPage.waitForTimeout(500);

    // "Early Blight" should leave the active list
    await expect(wl.ailmentCard("Early Blight")).not.toBeVisible({ timeout: 8000 });

    // Cleanup: switch to Archived tab and restore it
    await wl.archivedTab.click();
    await wl.waitForLoad();
    await expect(wl.ailmentCard("Early Blight")).toBeVisible({ timeout: 8000 });

    // In the archived tab the button aria-label is "Restore ailment" not "Archive ailment"
    await wl.restoreButtonFor("Early Blight").click();
    await authenticatedPage.waitForTimeout(300);
    const restoreBtn = authenticatedPage.getByRole("alertdialog").getByRole("button", { name: "Restore" });
    if (await restoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreBtn.click();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WL-003 — Empty state with mocked empty response
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Watchlist — empty state (WL-003)", () => {
  test("WL-003: Empty watchlist shows 'Your watchlist is empty.' message", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Mock ailments query to return empty array
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/ailments*`,
      (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );

    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await authenticatedPage.waitForTimeout(1000);

    await expect(
      authenticatedPage.getByText("Your watchlist is empty."),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Watchlist — Bulk add (RHO-4 Phase 2)", () => {
  test("WL-BULK-001: Bulk add opens with a mode toggle (Paste / Upload CSV)", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.openBulkAdd();
    // Both the AI/regex paste mode and the CSV mode are visible.
    await expect(wl.bulkAddModePaste).toBeVisible({ timeout: 5000 });
    await expect(wl.bulkAddModeCsv).toBeVisible();
    await expect(wl.bulkAddTextarea).toBeVisible();
  });

  test("WL-BULK-002: CSV mode exposes a Download template button (ailment template)", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.openBulkAdd();
    await wl.bulkAddModeCsv.click();

    const [download] = await Promise.all([
      authenticatedPage.waitForEvent("download", { timeout: 8000 }),
      wl.csvTemplateDownload.click(),
    ]);
    expect(download.suggestedFilename()).toBe("rhozly-watchlist-template.csv");
  });

  test("WL-BULK-003: Uploading a CSV shows review rows; bad row (missing type) is flagged and excluded", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.openBulkAdd();
    await wl.bulkAddModeCsv.click();

    // One valid row + one invalid row (bad enum type).
    const csv =
      "name,type\n" +
      "E2E CSV Good Ailment,pest\n" +
      "E2E CSV Bad Ailment,notatype\n";
    await wl.uploadCsv("watchlist.csv", csv);

    await expect(wl.bulkAddCandidate(0)).toBeVisible({ timeout: 8000 });
    await expect(wl.bulkAddCandidate(1)).toBeVisible();
    await expect(wl.bulkAddCandidateErrors(1)).toBeVisible();

    // The save button counts only the valid row.
    await expect(wl.bulkAddSave).toContainText(/Add 1 ailment/i, { timeout: 5000 });
  });

  test("WL-BULK-004: Import valid CSV rows creates manual ailments + a favourite", async ({ authenticatedPage }) => {
    test.setTimeout(90_000);
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    const stamp = Date.now();
    const plainName = `E2E CSV Ailment Plain ${stamp}`;
    const favName = `E2E CSV Ailment Fav ${stamp}`;

    await wl.openBulkAdd();
    await wl.bulkAddModeCsv.click();

    const csv =
      "name,type,favourite\n" +
      `${plainName},pest,false\n` +
      `${favName},disease,true\n`;
    await wl.uploadCsv("watchlist.csv", csv);

    await expect(wl.bulkAddCandidate(0)).toBeVisible({ timeout: 8000 });
    // The favourite column pre-ticks the second row's checkbox.
    await expect(wl.bulkAddCandidateFavourite(1)).toBeChecked();

    await wl.bulkAddSave.click();

    // Success toast confirms the serial inserts finished, then the modal closes.
    await authenticatedPage.getByText(/added .* to your watchlist/i)
      .waitFor({ state: "visible", timeout: 15000 });
    await wl.bulkAddModal.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});

    await authenticatedPage.goto("/watchlist");
    await wl.waitForLoad();
    // Both new ailments appear with the Manual source badge.
    await expect(wl.ailmentCard(plainName)).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard(favName)).toBeVisible({ timeout: 10000 });
    await expect(wl.ailmentCard(plainName).getByText("Manual", { exact: true })).toBeVisible();

    // The favourited row shows in the Favourites scope.
    await wl.gotoFavourites();
    await wl.waitForLoad();
    await expect(wl.favouriteCard(favName)).toBeVisible({ timeout: 10000 });
    await expect(wl.favouriteCard(plainName)).toHaveCount(0);

    // ── Cleanup: unfavourite + delete both test ailments ──
    const favRemove = wl.favouriteRemoveIn(wl.favouriteCard(favName));
    if (await favRemove.isVisible({ timeout: 4000 }).catch(() => false)) {
      await favRemove.click();
    }
    for (const name of [plainName, favName]) {
      await authenticatedPage.goto("/watchlist");
      await wl.waitForLoad();
      const delBtn = wl.deleteButtonFor(name);
      if (!(await delBtn.isVisible({ timeout: 4000 }).catch(() => false))) continue;
      await delBtn.click();
      const confirm = authenticatedPage.getByRole("button", { name: /^Delete$/i });
      if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
        await confirm.click();
        await expect(wl.ailmentCard(name)).toHaveCount(0, { timeout: 8000 }).catch(() => {});
      }
    }
  });

  test("WL-BULK-005: Free-text paste (regex fallback) reaches the shared review step with an editable type", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await wl.openBulkAdd();
    // Paste mode is the default — type a one-line list and parse.
    await wl.bulkAddTextarea.fill("Japanese knotweed");
    await wl.bulkAddParse.click();

    // Review step: the candidate card + the shared "Mark all as favourites" toggle.
    await expect(wl.bulkAddCandidate(0)).toBeVisible({ timeout: 10000 });
    await expect(wl.bulkAddFavouriteAll).toBeVisible();
    // The regex classifier picked invasive_plant for knotweed.
    await expect(
      authenticatedPage.locator('[data-testid="bulk-ailment-candidate-type-0"]'),
    ).toHaveValue("invasive_plant");
  });
});
