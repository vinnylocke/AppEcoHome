import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";
import { DashboardPage } from "../pages/DashboardPage";

// All tests in this file require an authenticated session.
// Ensure TEST_USER_EMAIL, TEST_USER_PASSWORD, VITE_SUPABASE_URL, and
// VITE_SUPABASE_PUBLISHABLE_KEY are set before running.

test.describe("Plant management — The Shed", () => {
  test("navigating to /shed renders the Shed heading", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();

    await expect(shed.heading).toBeVisible({ timeout: 10000 });
  });

  test("Shed page has a search input", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();

    // Either a role=searchbox or a text input inside the Shed header area
    const searchInput =
      shed.searchInput.or(authenticatedPage.getByRole("textbox").first());
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test("navigating to Shed via the desktop nav link works", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    // Click the 'The Shed' nav item — it renders as a button in the sidebar
    await authenticatedPage
      .getByRole("button", { name: "The Shed" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/shed");
    await expect(new ShedPage(authenticatedPage).heading).toBeVisible({
      timeout: 10000,
    });
  });

  test("Shed shows plants list or an empty-state message", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();

    // Wait for both spinner and skeleton loader to clear
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // Plant cards render with [data-plant-card] attribute.
    // Empty state renders "No plants here" or "No matches found" (search active).
    const hasPlants =
      (await authenticatedPage.locator("[data-plant-card]").count()) > 0;
    const hasEmpty = await shed.emptyState.isVisible().catch(() => false);

    expect(hasPlants || hasEmpty).toBe(true);
  });
});
