import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Help Center — Documentation drawer (in-app docs)
//
// The Help Center drawer (src/onboarding/HelpCenterDrawer.tsx) renders the
// markdown docs from documentation/*.md. The Dashboard doc embeds WebP
// screenshots served from /public/doc-images/. These tests guard:
//   • the docs tab + doc reader open correctly
//   • embedded doc images actually load (not broken)
//   • raw "📸 Screenshot:" placeholder callouts never leak into the reader
// ─────────────────────────────────────────────────────────────────────────────

async function openDashboardDoc(page: import("@playwright/test").Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Help Center", exact: true }).first().click();
  await page.getByTestId("help-tab-docs").click();
  await page.getByTestId("help-doc-row-dashboard").click();
}

test.describe("Help Center — Documentation drawer", () => {
  test("HCD-001: opening the Dashboard doc shows the doc reader", async ({ authenticatedPage }) => {
    await openDashboardDoc(authenticatedPage);

    // The reading view renders the markdown inside .prose-doc
    await expect(
      authenticatedPage.locator(".prose-doc").getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("HCD-002: the Dashboard doc renders embedded screenshots that load", async ({ authenticatedPage }) => {
    await openDashboardDoc(authenticatedPage);

    const firstImage = authenticatedPage.locator('figure[data-testid="doc-image"] img').first();
    await expect(firstImage).toBeVisible({ timeout: 8000 });

    // src points at the static /doc-images/ folder…
    await expect(firstImage).toHaveAttribute("src", /\/doc-images\/02-dashboard-.*\.webp$/);

    // …and the image actually decodes (naturalWidth > 0 means it loaded, not broken)
    await expect
      .poll(() => firstImage.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 8000 })
      .toBeGreaterThan(0);
  });

  test("HCD-003: raw screenshot placeholder callouts are not shown to the reader", async ({ authenticatedPage }) => {
    await openDashboardDoc(authenticatedPage);

    await expect(authenticatedPage.locator(".prose-doc")).toBeVisible({ timeout: 8000 });
    // The "> 📸 Screenshot:" callout lines are stripped at render time.
    await expect(authenticatedPage.getByText("📸 Screenshot")).toHaveCount(0);
  });

  test("HCD-004: clicking a doc screenshot opens the lightbox; Esc closes it", async ({ authenticatedPage }) => {
    await openDashboardDoc(authenticatedPage);

    await authenticatedPage.locator('[data-testid="doc-image-trigger"]').first().click();

    const lightbox = authenticatedPage.locator('[data-testid="doc-image-lightbox"]');
    await expect(lightbox).toBeVisible({ timeout: 5000 });
    await expect(lightbox.locator("img")).toBeVisible();

    await authenticatedPage.keyboard.press("Escape");
    await expect(lightbox).toBeHidden({ timeout: 5000 });
  });

  test("HCD-005: lightbox close button dismisses the expanded image", async ({ authenticatedPage }) => {
    await openDashboardDoc(authenticatedPage);

    await authenticatedPage.locator('[data-testid="doc-image-trigger"]').first().click();
    const lightbox = authenticatedPage.locator('[data-testid="doc-image-lightbox"]');
    await expect(lightbox).toBeVisible({ timeout: 5000 });

    await authenticatedPage.locator('[data-testid="doc-image-lightbox-close"]').click();
    await expect(lightbox).toBeHidden({ timeout: 5000 });
  });

  test("HCD-006: closed drawer is aria-hidden + inert; opening restores it to the a11y tree", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // The drawer stays mounted (slide transition) but must be invisible to
    // assistive tech while closed — role queries respect aria-hidden, so the
    // heading must be unreachable until the drawer opens.
    const drawer = authenticatedPage.getByTestId("help-center-drawer");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
    await expect(authenticatedPage.getByRole("heading", { name: "Help & Guides" })).toHaveCount(0);

    await authenticatedPage.getByRole("button", { name: "Help Center", exact: true }).first().click();
    await expect(authenticatedPage.getByRole("heading", { name: "Help & Guides" })).toBeVisible();
    await expect(drawer).not.toHaveAttribute("aria-hidden", "true");
  });
});
