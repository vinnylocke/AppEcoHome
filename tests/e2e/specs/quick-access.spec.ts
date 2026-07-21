import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// One responsive home (2026-07-20): the phone-only /quick launcher home was
// retired. Phone + desktop both land on the responsive /dashboard. Bare /quick
// redirects to /dashboard. Since the dashboard-nav-tasks-tray redesign Stage 1
// (2026-07-21) the customisable launcher grid was REMOVED from the dashboard
// (every tile but Garden Walk duplicated the nav bar); the /quick/calendar
// planting helper stays a focus-mode tool, now reached by direct URL (QUICK-016).

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

    test("QUICK-003: the launcher grid was removed from the dashboard; only the Garden Walk tile remains", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/dashboard");
      await expect(authenticatedPage.getByTestId("home-main")).toBeVisible({ timeout: 10000 });
      // 6 seeded plants (>= 5) → the Garden Walk tile shows; the grid does not.
      await expect(authenticatedPage.getByTestId("dash-garden-walk")).toBeVisible({ timeout: 10000 });
      await expect(authenticatedPage.getByTestId("home-quick-actions")).toHaveCount(0);
      await expect(authenticatedPage.getByTestId("home-quick-actions-customise")).toHaveCount(0);
    });

    // QUICK-004 retired (Stage 1, 2026-07-21): the "Today" launcher tile that
    // opened /quick/calendar was removed with the launcher grid. The planting
    // helper is still reachable by direct URL — covered by QUICK-016 below.

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
