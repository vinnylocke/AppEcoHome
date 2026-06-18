import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Section 24 — Ailment Library (browse the global catalogue)
// Shell-only checks (the seeded e2e DB has no ailment_library rows, so the grid
// shows the empty state) — heading, search, kind filters all render regardless.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Ailment Library — browse shell (Section 24)", () => {
  test("AILIB-001: /ailment-library renders the library shell", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library");
    await expect(authenticatedPage.getByTestId("ailment-library")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("ailment-library-search")).toBeVisible();
  });

  test("AILIB-002: kind filter chips are present", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library");
    for (const k of ["all", "pest", "disease", "invasive", "disorder"]) {
      await expect(authenticatedPage.getByTestId(`ailment-filter-${k}`)).toBeVisible();
    }
  });

  test("AILIB-003: 'Browse the ailment library' button navigates from the watchlist", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed?tab=watchlist");
    const browse = authenticatedPage.getByTestId("browse-ailment-library");
    await browse.click({ timeout: 10000 });
    await expect(authenticatedPage).toHaveURL(/\/ailment-library/);
  });
});
