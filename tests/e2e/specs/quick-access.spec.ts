import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Mobile Quick Access — routing + nav visibility.
//
// Covers:
//  - Phone viewport → `/` redirects to `/quick`
//  - `/quick` renders the default launcher pins (Wave 16 customisable launcher)
//  - Desktop viewport → `/` redirects to `/dashboard` (unchanged)
//  - Desktop visit to `/quick` shows the "mobile shortcut" banner

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe("Quick Access — mobile routing", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("QUICK-001: phone viewport redirects / to /quick", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/");
    await expect(authenticatedPage).toHaveURL(/\/quick$/, { timeout: 10000 });
    await expect(authenticatedPage.getByTestId("quick-access-home")).toBeVisible();
  });

  test("QUICK-002: /quick renders the default launcher pins", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    // Default pins from DEFAULT_QUICK_LAUNCHER_PINS (quickLauncherCatalogue.ts).
    await expect(authenticatedPage.getByTestId("quick-tile-doctor")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-tile-today")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-tile-capture")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-tile-shed")).toBeVisible();
  });

  // QUICK-003 retired: /quick/lens removed; the equivalent of the Lens is
  // the full Plant Lens at /doctor (default-pinned as the "doctor" tile).

  // QUICK-004 / QUICK-005 retired: the "Coming soon" tiles + toasts were
  // removed — the Wave-16 launcher only renders live, navigating tiles, and
  // the never-promise sweep (docs/plans/remove-app-promise-strings.md)
  // deleted the coming-soon variant from QuickTile entirely.

  test("QUICK-006: 'Open full dashboard' link routes to /dashboard", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-access-open-dashboard").click();
    await expect(authenticatedPage).toHaveURL(/\/dashboard$/);
  });

  // QUICK-007 / QUICK-008 retired: the /quick/lens route and its component
  // were removed in favour of the full Plant Lens at /doctor.
});

test.describe("Quick Access — desktop routing", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("QUICK-009: desktop viewport redirects / to /dashboard (unchanged)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/");
    await expect(authenticatedPage).toHaveURL(/\/dashboard$/, { timeout: 10000 });
  });

  test("QUICK-010: desktop visit to /quick shows the mobile-shortcut banner", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await expect(authenticatedPage.getByTestId("quick-access-home")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-access-desktop-banner")).toBeVisible();
  });

  test("QUICK-011: desktop /quick keeps the persistent header + side nav (no focus mode)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    // Header is still in the DOM with the logo / global search etc.
    await expect(authenticatedPage.getByRole("banner")).toBeVisible();
    await expect(authenticatedPage.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    // Floating menu button is not mounted on desktop.
    await expect(authenticatedPage.getByTestId("quick-access-menu-button")).toHaveCount(0);
  });
});

test.describe("Quick Access focus mode (Wave 6)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("QUICK-012: /quick on mobile hides the top bar + side nav and shows the menu button", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await expect(authenticatedPage.getByTestId("quick-access-home")).toBeVisible();
    // Persistent chrome is gone.
    await expect(authenticatedPage.getByRole("banner")).toHaveCount(0);
    await expect(
      authenticatedPage.getByRole("navigation", { name: "Primary navigation" }),
    ).toHaveCount(0);
    // Floating menu button is mounted top-right.
    await expect(authenticatedPage.getByTestId("quick-access-menu-button")).toBeVisible();
  });

  test("QUICK-013: tapping the menu button opens the drawer with nav links", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-access-menu-button").click();
    await expect(authenticatedPage.getByTestId("mobile-nav-drawer")).toBeVisible();
    // The drawer surfaces the standard nav links (Dashboard / Plants / Planner etc).
    await expect(authenticatedPage.getByRole("button", { name: /Dashboard/i })).toBeVisible();
    await expect(authenticatedPage.getByRole("button", { name: /Plants/i })).toBeVisible();
  });

  test("QUICK-014: tapping a nav link closes the drawer and navigates", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-access-menu-button").click();
    await authenticatedPage.getByTestId("mobile-nav-drawer").getByRole("button", { name: /Plants/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/shed$/);
    await expect(authenticatedPage.getByTestId("mobile-nav-drawer")).toHaveCount(0);
  });

  test("QUICK-015: tapping the backdrop closes the drawer without navigating", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-access-menu-button").click();
    await authenticatedPage.getByTestId("mobile-nav-drawer-backdrop").click();
    await expect(authenticatedPage.getByTestId("mobile-nav-drawer")).toHaveCount(0);
    await expect(authenticatedPage).toHaveURL(/\/quick$/);
  });

  test("QUICK-016: focus mode also applies to /quick/calendar", async ({ authenticatedPage }) => {
    // /quick/journal was retired alongside the standalone Capture page —
    // the Capture tile now deep-links into the full /journal screen.
    await authenticatedPage.goto("/quick/calendar");
    await expect(authenticatedPage.getByRole("banner")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("quick-access-menu-button")).toBeVisible();
  });
});
