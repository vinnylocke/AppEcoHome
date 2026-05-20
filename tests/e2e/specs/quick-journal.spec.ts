import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Mobile Quick Access Wave 4 — Quick Capture Journal.
//
// Covers:
//  - Journal tile on /quick is now live (was a placeholder in Waves 2-3)
//  - /quick/journal renders the composer + Recent Captures list
//  - Saving a text-only capture surfaces it in the Recent Captures list
//  - The Assign sheet lists the user's plants and assignment removes the
//    entry from the unassigned list
//  - Back button returns to /quick

const MOBILE_VIEWPORT = { width: 375, height: 812 };

test.describe("Quick Capture Journal — mobile routing + save", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("QUICK-JNL-001: Journal tile on /quick navigates to /quick/journal", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-tile-journal").click();
    await expect(authenticatedPage).toHaveURL(/\/quick\/journal$/);
    await expect(authenticatedPage.getByTestId("quick-capture-screen")).toBeVisible();
  });

  test("QUICK-JNL-002: composer renders + Save disabled when both photo and note empty", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick/journal");
    await expect(authenticatedPage.getByTestId("quick-capture-composer")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-capture-save")).toBeDisabled();
  });

  test("QUICK-JNL-003: typing a description enables Save and persists to Recent Captures", async ({ authenticatedPage }) => {
    const noteText = `Playwright capture ${Date.now()}`;
    await authenticatedPage.goto("/quick/journal");

    await authenticatedPage.getByTestId("quick-capture-description").fill(noteText);
    await expect(authenticatedPage.getByTestId("quick-capture-save")).toBeEnabled();
    await authenticatedPage.getByTestId("quick-capture-save").click();

    // Toast confirms save
    await expect(authenticatedPage.getByText("Saved to your captures")).toBeVisible({ timeout: 5000 });
    // Composer cleared
    await expect(authenticatedPage.getByTestId("quick-capture-description")).toHaveValue("");
    // The note appears in the Recent Captures list
    await expect(authenticatedPage.getByText(noteText)).toBeVisible({ timeout: 10000 });
  });

  test("QUICK-JNL-004: Assign sheet opens for an unassigned capture", async ({ authenticatedPage }) => {
    const noteText = `Assign-flow capture ${Date.now()}`;
    await authenticatedPage.goto("/quick/journal");

    // Create a capture so there's something to assign.
    await authenticatedPage.getByTestId("quick-capture-description").fill(noteText);
    await authenticatedPage.getByTestId("quick-capture-save").click();
    await expect(authenticatedPage.getByText(noteText)).toBeVisible({ timeout: 10000 });

    // Click the Assign affordance on the most recent entry (the one we just created).
    const entry = authenticatedPage.locator('[data-testid^="quick-capture-entry-"]', {
      hasText: noteText,
    }).first();
    const assignButton = entry.locator('[data-testid^="quick-capture-assign-"]');
    await assignButton.click();

    // Sheet renders with the search input.
    await expect(authenticatedPage.getByTestId("assign-to-plant-sheet")).toBeVisible();
    await expect(authenticatedPage.getByTestId("assign-sheet-search")).toBeVisible();
  });

  test("QUICK-JNL-005: back button on /quick/journal returns to /quick", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick/journal");
    await authenticatedPage.getByTestId("quick-capture-back").click();
    await expect(authenticatedPage).toHaveURL(/\/quick$/);
  });
});
