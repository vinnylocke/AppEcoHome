import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Mobile Quick Access (Wave 2) — routing + nav visibility.
//
// Covers:
//  - Phone viewport → `/` redirects to `/quick`
//  - `/quick` renders the three Quick Access tiles
//  - Tapping the Visual Lens tile lands the user on `/quick/lens`
//  - "Coming soon" tiles show a toast and do NOT navigate
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

  test("QUICK-002: /quick renders all three tiles", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await expect(authenticatedPage.getByTestId("quick-tile-lens")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-tile-calendar")).toBeVisible();
    await expect(authenticatedPage.getByTestId("quick-tile-journal")).toBeVisible();
  });

  test("QUICK-003: tapping Visual Lens tile navigates to /quick/lens", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-tile-lens").click();
    await expect(authenticatedPage).toHaveURL(/\/quick\/lens$/);
    await expect(authenticatedPage.getByTestId("quick-access-lens")).toBeVisible();
  });

  test("QUICK-004: Calendar tile shows toast and stays on /quick", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-tile-calendar").click();
    // Toast appears
    await expect(
      authenticatedPage.getByText(/Coming soon — for now, view today's tasks on the Dashboard/i),
    ).toBeVisible({ timeout: 5000 });
    // Still on /quick
    await expect(authenticatedPage).toHaveURL(/\/quick$/);
  });

  test("QUICK-005: Journal tile shows toast and stays on /quick", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-tile-journal").click();
    await expect(
      authenticatedPage.getByText(/Coming soon — for now, open a plant's Journal tab/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage).toHaveURL(/\/quick$/);
  });

  test("QUICK-006: 'Open full dashboard' link routes to /dashboard", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick");
    await authenticatedPage.getByTestId("quick-access-open-dashboard").click();
    await expect(authenticatedPage).toHaveURL(/\/dashboard$/);
  });

  test("QUICK-007: lens screen mounts Analyse button in compact mode", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick/lens");
    await expect(authenticatedPage.getByTestId("quick-access-lens")).toBeVisible();
    await expect(authenticatedPage.getByTestId("doctor-btn-analyse")).toBeVisible();
    // Compact mode hides Identify/Diagnose/Pest secondary row + the tab bar
    await expect(authenticatedPage.getByTestId("doctor-btn-identify")).toBeHidden();
    await expect(authenticatedPage.getByTestId("doctor-btn-diagnose")).toBeHidden();
    await expect(authenticatedPage.getByTestId("doctor-btn-pest")).toBeHidden();
    await expect(authenticatedPage.getByTestId("doctor-tab-analyse")).toBeHidden();
  });

  test("QUICK-008: back button on lens returns to /quick", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/quick/lens");
    await authenticatedPage.getByTestId("quick-lens-back").click();
    await expect(authenticatedPage).toHaveURL(/\/quick$/);
  });
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
});
