import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// All tests require an authenticated session.
// Tests cover Section 16 — Global Layout / Navigation.

// ─────────────────────────────────────────────────────────────────────────────
// Section 16 — Global Layout / Navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Global layout — navigation (Section 16)", () => {
  test("NAV-001: All primary nav links are present on the dashboard", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // Core nav items expected in the sidebar / nav bar
    const navItems = [
      "Dashboard",
      "Plants",
      "Planner",
      "Journal",
      "Tools",
    ];

    for (const label of navItems) {
      await expect(
        authenticatedPage.getByRole("button", { name: label }).first(),
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("NAV-002: Sidebar menu toggle button is present", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // The menu toggle uses the Lucide Menu SVG icon.
    // The desktop variant uses `hidden md:flex` Tailwind classes — in some Tailwind JIT
    // builds `display:none` wins over the responsive `display:flex`, so isVisible() can
    // return false even though the element is in the DOM.  Use count() to verify presence.
    await authenticatedPage.waitForLoadState("networkidle").catch(() => {});
    const menuIconCount = await authenticatedPage.locator(".lucide-menu").count();
    expect(menuIconCount).toBeGreaterThan(0);
  });

  test("NAV-003: Navigating to a route updates the URL correctly", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // Click the Tools nav item and verify URL. (There is no desktop nav button
    // named "Plant Doctor" — the doctor lives under Tools on desktop; on mobile
    // it's reached via the Deck's centre Capture FAB, covered by NAV-009.)
    await authenticatedPage
      .getByRole("button", { name: "Tools" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/tools", { timeout: 8000 });
  });

  test("NAV-004: Navigating back to /dashboard works from another route", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/doctor");

    await authenticatedPage
      .getByRole("button", { name: "Dashboard" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/dashboard", { timeout: 8000 });
  });

  test("NAV-005: App renders consistently at 1280×800 desktop viewport", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto("/dashboard");

    // Nav should be visible at desktop width
    await expect(
      authenticatedPage.getByRole("button", { name: "Dashboard" }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("NAV-006: Phone has exactly one primary nav — the bottom bar, not the sidebar rail", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 812 });
    await authenticatedPage.goto("/dashboard");

    // Phase 6a — the old "two nav bars on mobile" bug: the desktop sidebar
    // <nav aria-label="Primary navigation"> must NOT render on phones, and the
    // bottom tab bar is the sole primary nav.
    await expect(authenticatedPage.getByTestId("bottom-tab-bar")).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.getByRole("navigation", { name: "Primary navigation" }),
    ).toHaveCount(0);
  });

  test("NAV-011: The Deck's More slot opens the Shelf drawer (mobile overflow nav)", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 812 });
    await authenticatedPage.goto("/dashboard");

    // Phase 6b — the Shelf is the phone entry point for the long tail the Deck
    // can't hold (Journal, Integrations, Head Gardener, Quick), opened by the
    // Deck's "More" slot (the mobile header no longer carries a hamburger).
    await authenticatedPage.getByTestId("bottom-tab-more").click();
    const drawer = authenticatedPage.getByTestId("mobile-nav-drawer");
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Journal has no Deck slot — reachable only via the Shelf on phone.
    await drawer.getByRole("button", { name: "Journal" }).click();
    await expect(authenticatedPage).toHaveURL(/\/journal/, { timeout: 8000 });
    await expect(authenticatedPage.getByTestId("mobile-nav-drawer")).toHaveCount(0);
  });

  test("NAV-004: HomeDropdown — 'Create New Home' button appears in the dropdown", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // Click the HomeDropdown trigger (shows active home name)
    await authenticatedPage.getByRole("button", { name: "Test Garden Home" }).first().click();
    await authenticatedPage.waitForTimeout(300);

    // The dropdown footer has "Create New Home" button
    await expect(
      authenticatedPage.getByRole("button", { name: /Create New Home/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("NAV-008: HomeDropdown shows the seeded home name 'Test Garden Home'", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // HomeDropdown renders the active home name as a button label
    await expect(
      authenticatedPage.getByRole("button", { name: "Test Garden Home" }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("NAV-009: Deck navigates core screens + the Capture FAB opens the sheet", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 812 });
    await authenticatedPage.goto("/dashboard");

    const bar = authenticatedPage.getByTestId("bottom-tab-bar");
    await expect(bar).toBeVisible({ timeout: 10000 });

    // Phase 6b — the Deck is Home / Plants / [Capture FAB] / Tasks / More
    // (Planner ceded its slot to the Today's-Tasks tray, 2026-07-22).
    // Plants destination tab → /shed, with the active accent following.
    await authenticatedPage.getByTestId("bottom-tab-shed").click();
    await expect(authenticatedPage).toHaveURL(/\/shed/, { timeout: 8000 });
    await expect(authenticatedPage.getByTestId("bottom-tab-shed")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Back home.
    await authenticatedPage.getByTestId("bottom-tab-dashboard").click();
    await expect(authenticatedPage).toHaveURL(/\/dashboard/, { timeout: 8000 });
    await expect(authenticatedPage.getByTestId("bottom-tab-dashboard")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // The centre Capture FAB opens the Capture sheet (a router into the create
    // flows) — its hero routes to Plant Doctor.
    await authenticatedPage.getByTestId("bottom-tab-capture").click();
    await expect(authenticatedPage.getByTestId("capture-sheet")).toBeVisible({ timeout: 5000 });
    await authenticatedPage.getByTestId("capture-diagnose").click();
    await expect(authenticatedPage).toHaveURL(/\/doctor/, { timeout: 8000 });
  });

  test("NAV-012: The Deck's Tasks slot opens the tray; header trigger + Planner slot are gone on phone", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 812 });
    await authenticatedPage.goto("/dashboard");
    await expect(authenticatedPage.getByTestId("bottom-tab-bar")).toBeVisible({ timeout: 10000 });

    // 2026-07-22 — Planner ceded its Deck slot to the Today's-Tasks tray, and
    // the header copy of the trigger became desktop-only (no phone duplicate).
    await expect(authenticatedPage.getByTestId("bottom-tab-planner")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("today-tasks-tray-trigger")).toBeHidden();

    await authenticatedPage.getByTestId("bottom-tab-tasks").click();
    await expect(authenticatedPage.getByTestId("today-tasks-tray")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("today-tray-close").click();

    // Planner still reachable on phone via More → Shelf.
    await authenticatedPage.getByTestId("bottom-tab-more").click();
    const drawer = authenticatedPage.getByTestId("mobile-nav-drawer");
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await drawer.getByRole("button", { name: "Planner" }).click();
    await expect(authenticatedPage).toHaveURL(/\/planner/, { timeout: 8000 });
  });

  test("NAV-010: Bottom tab bar is hidden on desktop viewport", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto("/dashboard");

    // md:hidden — the sidebar owns desktop navigation.
    await expect(authenticatedPage.getByTestId("bottom-tab-bar")).toBeHidden();
  });

  test("NAV-007: Sign Out button is accessible from the nav", async ({ authenticatedPage }) => {
    // Fixture already lands at a fully-loaded /dashboard — no re-navigation needed.
    // The profile trigger is a real button ("Account menu") since the design
    // overhaul; opening it reveals the Sign Out action.
    const trigger = authenticatedPage.getByTestId("user-profile-trigger");
    await expect(trigger).toBeVisible({ timeout: 8000 });
    await trigger.click();

    await expect(
      authenticatedPage.getByRole("button", { name: /Sign Out/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
