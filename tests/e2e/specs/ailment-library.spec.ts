import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Section 24 — Ailment Library (the field guide)
// Stage 1 of the ailment-library overhaul (2026-07-21): real catalogue rows are
// now seeded (16_ailment_library.sql — Tomato Hornworm 900001 / Late Blight
// 900002 / Japanese Knotweed 900003, global table, per-worker idempotent), so
// the suite covers browse + detail takeover + 🔭 watch + ♥ favourite, not just
// the shell.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Ailment Library — browse (Section 24)", () => {
  test("AILIB-001: /ailment-library renders the library with seeded cards", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library");
    await expect(authenticatedPage.getByTestId("ailment-library")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("ailment-library-search")).toBeVisible();
    await expect(authenticatedPage.getByTestId("ailment-card-900001")).toBeVisible({ timeout: 10000 });
  });

  test("AILIB-002: kind + severity + watching filter chips are present; kind filter narrows", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library");
    for (const k of ["all", "pest", "disease", "invasive", "disorder"]) {
      await expect(authenticatedPage.getByTestId(`ailment-filter-${k}`)).toBeVisible();
    }
    for (const s of ["low", "moderate", "high", "critical"]) {
      await expect(authenticatedPage.getByTestId(`ailment-severity-${s}`)).toBeVisible();
    }
    await expect(authenticatedPage.getByTestId("ailment-filter-watching")).toBeVisible();
    // Filtering to pests keeps the Hornworm and drops the Blight.
    await authenticatedPage.getByTestId("ailment-filter-pest").click();
    await expect(authenticatedPage.getByTestId("ailment-card-900001")).toBeVisible();
    await expect(authenticatedPage.getByTestId("ailment-card-900002")).toHaveCount(0);
  });

  test("AILIB-003: 'Browse the ailment library' button navigates from the watchlist", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed?tab=watchlist");
    const browse = authenticatedPage.getByTestId("browse-ailment-library");
    await browse.click({ timeout: 10000 });
    await expect(authenticatedPage).toHaveURL(/\/ailment-library/);
  });
});

test.describe("Ailment Library — detail takeover + actions (Stage 1)", () => {
  test("AILIB-010: tapping a card opens the full-page detail; back returns to browse", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library");
    await authenticatedPage.getByTestId("ailment-card-900002").getByRole("button", { name: /View Late Blight/i }).click();
    const detail = authenticatedPage.getByTestId("ailment-detail");
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage).toHaveURL(/ailment=900002/);
    await expect(detail.getByRole("heading", { name: "Late Blight" })).toBeVisible();
    // Editorial sections render.
    await expect(detail.getByText("Symptoms")).toBeVisible();
    await expect(detail.getByText("Prevention", { exact: true })).toBeVisible();
    // Back to browse (the takeover replaces the URL param).
    await authenticatedPage.getByTestId("ailment-detail-back").click();
    await expect(authenticatedPage.getByTestId("ailment-library")).toBeVisible();
    await expect(authenticatedPage).not.toHaveURL(/ailment=/);
  });

  test("AILIB-011: ?ailment= deep link opens the detail directly", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library?ailment=900001");
    const detail = authenticatedPage.getByTestId("ailment-detail");
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(detail.getByRole("heading", { name: "Tomato Hornworm" })).toBeVisible();
  });

  test("AILIB-012: 🔭 Watch adds to this home's watchlist and flips to Watching", async ({ authenticatedPage }) => {
    // Idempotent across runs: the watch row persists (seeds don't remove it),
    // so a re-run finds the button already in its Watching state — both paths
    // assert the same end state + watchlist presence.
    await authenticatedPage.goto("/ailment-library?ailment=900003");
    const watch = authenticatedPage.getByTestId("ailment-add-watchlist");
    await expect(watch).toBeVisible({ timeout: 10000 });

    const label = (await watch.textContent()) ?? "";
    if (!label.includes("Watching")) {
      await watch.click();
    }
    await expect(watch).toContainText("Watching in this garden", { timeout: 10000 });
    await expect(watch).toBeDisabled();

    // It shows on the home watchlist.
    await authenticatedPage.goto("/shed?tab=watchlist");
    await expect(
      authenticatedPage.getByTestId("watchlist-card-grid").getByText("Japanese Knotweed").first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("AILIB-013: ♥ favourite toggles from the detail (round trip)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/ailment-library?ailment=900001");
    const heart = authenticatedPage.getByTestId("ailment-detail-favourite");
    await expect(heart).toBeVisible({ timeout: 10000 });
    const wasPressed = (await heart.getAttribute("aria-pressed")) === "true";

    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", String(!wasPressed), { timeout: 10000 });
    // Toggle back so the test is self-cleaning for re-runs.
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", String(wasPressed), { timeout: 10000 });
  });
});
