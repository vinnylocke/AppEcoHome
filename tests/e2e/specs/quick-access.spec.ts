import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// One responsive home (2026-07-20): the phone-only /quick launcher home was
// retired. Phone + desktop both land on the responsive /dashboard, whose
// QuickActionsRow reuses the SAME customisable launcher pins. Bare /quick now
// redirects to /dashboard. The /quick/calendar planting helper stays as a
// focus-mode tool, reached via the dashboard's "Today" launcher tile.

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe("One responsive home — routing", () => {
  test.describe("mobile", () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test("QUICK-001: phone / redirects to the responsive /dashboard", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/");
      await expect(authenticatedPage).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    });

    test("QUICK-002: legacy /quick redirects to /dashboard", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/quick");
      await expect(authenticatedPage).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    });

    test("QUICK-003: the customisable launcher now lives on the dashboard", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/dashboard");
      await expect(authenticatedPage.getByTestId("home-quick-actions")).toBeVisible({ timeout: 10000 });
      // Default pins (quickLauncherCatalogue) render as home-quick-tile-*.
      await expect(authenticatedPage.getByTestId("home-quick-tile-doctor")).toBeVisible();
      await expect(authenticatedPage.getByTestId("home-quick-tile-shed")).toBeVisible();
      await expect(authenticatedPage.getByTestId("home-quick-actions-customise")).toBeVisible();
    });

    test("QUICK-004: the Today tile opens the planting helper (/quick/calendar)", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/dashboard");
      await authenticatedPage.getByTestId("home-quick-tile-today").click();
      await expect(authenticatedPage).toHaveURL(/\/quick\/calendar$/, { timeout: 8000 });
    });

    test("QUICK-016: /quick/calendar stays a focus-mode tool (no header, floating menu)", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/quick/calendar");
      await expect(authenticatedPage.getByRole("banner")).toHaveCount(0);
      await expect(authenticatedPage.getByTestId("quick-access-menu-button")).toBeVisible();
    });
  });

  test.describe("desktop", () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test("QUICK-009: desktop / redirects to /dashboard", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/");
      await expect(authenticatedPage).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    });

    test("QUICK-010: desktop /quick also redirects to /dashboard", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/quick");
      await expect(authenticatedPage).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    });
  });
});
