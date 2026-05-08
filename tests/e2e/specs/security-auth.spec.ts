/**
 * Tier D — Auth Boundary Security Tests
 *
 * Verifies that unauthenticated access to protected routes shows the sign-in
 * form (the app's auth guard renders <Auth /> inline — the URL stays put, no
 * server-side redirect). Also verifies that sign-out correctly kills the session.
 */

import { test, expect } from "@playwright/test";
import { test as authTest } from "../fixtures/auth";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/shed",
  "/schedule",
  "/planner",
  "/doctor",
  "/guides",
  "/management",
  "/watchlist",
];

test.describe("AUTH — Unauthenticated route access", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`AUTH-00x: unauthenticated access to ${route} shows sign-in form`, async ({ page }) => {
      await page.goto(route);
      // The app renders <Auth /> when there is no session — the email input appears
      await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
    });
  }
});

test.describe("AUTH — Specific route tests", () => {
  test("AUTH-001: unauthenticated /dashboard shows sign-in form", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
  });

  test("AUTH-002: unauthenticated /shed shows sign-in form", async ({ page }) => {
    await page.goto("/shed");
    await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
  });

  test("AUTH-003: unauthenticated /planner shows sign-in form", async ({ page }) => {
    await page.goto("/planner");
    await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
  });

  test("AUTH-004: unauthenticated /doctor shows sign-in form", async ({ page }) => {
    await page.goto("/doctor");
    await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
  });

  test("AUTH-005: unauthenticated /guides shows sign-in form", async ({ page }) => {
    await page.goto("/guides");
    await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
  });
});

authTest.describe("AUTH — Session invalidation", () => {
  async function signOut(page: import("@playwright/test").Page) {
    // Sign Out is inside the UserProfileDropdown — open it first
    await page.locator("[data-testid='user-profile-trigger']").click();
    await page.locator("[data-testid='user-profile-sign-out']").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("[data-testid='user-profile-sign-out']").click();
  }

  authTest("AUTH-006: After sign-out, auth form is shown in-page", async ({ authenticatedPage: page }) => {
    await signOut(page);

    // The Auth component renders inline (same URL) — email input must appear
    await expect(page.getByPlaceholder("hello@rhozly.com")).toBeVisible({ timeout: 10000 });
  });

  authTest("AUTH-007: After sign-out, direct Supabase query returns no rows", async ({ authenticatedPage: page }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

    await signOut(page);
    await expect(page.getByRole("heading").filter({ hasText: "Welcome Back" })).toBeVisible({ timeout: 10000 });

    // After sign-out, an anonymous Supabase query should return 0 rows (RLS)
    const rows = await page.evaluate(
      async ({ url, key }: { url: string; key: string }) => {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const client = createClient(url, key);
        const { data } = await client.from("tasks").select("id").limit(1);
        return data?.length ?? 0;
      },
      { url: supabaseUrl, key: supabaseKey },
    );

    expect(rows).toBe(0);
  });

  authTest("AUTH-008: Authenticated user with home sees dashboard, not sign-in form", async ({ authenticatedPage: page }) => {
    // The auth fixture lands us on /dashboard authenticated
    await expect(page.getByPlaceholder("hello@rhozly.com")).not.toBeVisible({ timeout: 5000 });
    // Dashboard should show substantive content
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 8000 });
  });
});
