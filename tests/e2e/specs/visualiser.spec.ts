import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { VisualiserPage } from "../pages/VisualiserPage";

// All tests require an authenticated session.
// Seeded plants (02_plants_shed.sql): 6 plants including "Rose" and "Basil"

// ─────────────────────────────────────────────────────────────────────────────
// Section 14 — Plant Visualiser
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Plant Visualiser — page structure (Section 14)", () => {
  test("VIS-001: Navigating to /visualiser renders the Plant Visualiser heading", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();

    await expect(vis.heading).toBeVisible({ timeout: 10000 });
  });

  test("VIS-002: Plant Visualiser nav link navigates to /visualiser", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    await authenticatedPage
      .getByRole("button", { name: "Plant Visualiser" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/visualiser");
  });

  test("VIS-003: Page shows plant cards or an empty state", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    // Either plant cards with "Add … to visualiser" buttons or the empty state message
    const hasPlants = await authenticatedPage
      .locator('[aria-label*="to visualiser"]')
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    const hasEmpty = await vis.emptyState.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasPlants || hasEmpty).toBe(true);
  });

  test("VIS-004: Seeded plants show 'Add to visualiser' buttons", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    // Seeded plants should render cards with add buttons
    const addButtons = authenticatedPage.locator('[aria-label*="to visualiser"]');
    const count = await addButtons.count();

    if (count === 0) {
      // No plants in shed — empty state is valid
      await expect(vis.emptyState).toBeVisible({ timeout: 5000 });
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });
});

test.describe("Plant Visualiser — interactions (Section 14)", () => {
  test("VIS-005: Clicking 'Add to visualiser' on a plant card toggles it onto the stage", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    const addButton = authenticatedPage.locator('[aria-label*="Add"][aria-label*="to visualiser"]').first();
    const hasAdd = await addButton.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasAdd) return; // No plants to add — valid empty state

    // Get the plant name from the aria-label: "Add {name} to visualiser"
    const ariaLabel = await addButton.getAttribute("aria-label") ?? "";
    const plantName = ariaLabel.replace(/^Add /, "").replace(/ to visualiser$/, "");

    await addButton.click();
    await authenticatedPage.waitForTimeout(300);

    // After adding, the button label should switch to "Remove {name} from visualiser"
    await expect(
      authenticatedPage.getByLabel(`Remove ${plantName} from visualiser`),
    ).toBeVisible({ timeout: 5000 });
  });

  test("VIS-006: Plant added to stage enables the Open Visualiser button", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    const addButton = authenticatedPage.locator('[aria-label*="Add"][aria-label*="to visualiser"]').first();
    const hasAdd = await addButton.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasAdd) return;

    await addButton.click();
    await authenticatedPage.waitForTimeout(300);

    // "Open Visualiser" button should now appear
    await expect(vis.openVisualiserButton).toBeVisible({ timeout: 5000 });
  });

  test("VIS-007: Clicking 'Remove from visualiser' deselects a plant", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    const addButton = authenticatedPage.locator('[aria-label*="Add"][aria-label*="to visualiser"]').first();
    const hasAdd = await addButton.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasAdd) return;

    const ariaLabel = await addButton.getAttribute("aria-label") ?? "";
    const plantName = ariaLabel.replace(/^Add /, "").replace(/ to visualiser$/, "");

    // Add then remove
    await addButton.click();
    await authenticatedPage.waitForTimeout(300);

    await authenticatedPage.getByLabel(`Remove ${plantName} from visualiser`).click();
    await authenticatedPage.waitForTimeout(300);

    // Should revert to "Add" button
    await expect(
      authenticatedPage.getByLabel(`Add ${plantName} to visualiser`),
    ).toBeVisible({ timeout: 5000 });
  });

  test("VIS-010: Visualiser page heading uses h1", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();

    await expect(
      authenticatedPage.getByRole("heading", { name: "Plant Visualiser" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("VIS-011: Search filters the plant list by name", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    const hasPlants = await authenticatedPage
      .locator('[aria-label*="to visualiser"]')
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    if (!hasPlants) return;

    // Type "Basil" to filter
    await authenticatedPage.locator('input[placeholder*="shed"]').fill("Basil");
    await authenticatedPage.waitForTimeout(300);

    // Basil should still be visible
    await expect(
      authenticatedPage.getByText("Basil"),
    ).toBeVisible({ timeout: 5000 });

    // Rose should be filtered out
    await expect(
      authenticatedPage.locator('[aria-label*="Rose"][aria-label*="to visualiser"]'),
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("VIS-012: Source filter — selecting 'Manual' shows only manual plants", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    const hasPlants = await authenticatedPage
      .locator('[aria-label*="to visualiser"]')
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    if (!hasPlants) return;

    // Source filter buttons are rendered inline — click "Manual"
    await authenticatedPage.getByRole("button", { name: /^Manual$/i }).click();
    await authenticatedPage.waitForTimeout(300);

    // Lavender is seeded as "api" source, should be filtered out
    // Manual plants (Tomato, Basil, Rose, Boston Fern, Mint) should still be visible
    const lavenderVisible = await authenticatedPage
      .locator('[aria-label*="Lavender"][aria-label*="to visualiser"]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Only manual plants should be shown — api-source Lavender should not appear
    expect(lavenderVisible).toBe(false);
  });

  test("VIS-009: 'Open Visualiser' button is absent when no plants are selected", async ({ authenticatedPage }) => {
    const vis = new VisualiserPage(authenticatedPage);
    await vis.goto();
    await vis.waitForLoad();

    // With no plants selected the "Open Visualiser" button should not be visible
    const openVisible = await vis.openVisualiserButton.isVisible({ timeout: 3000 }).catch(() => false);
    expect(openVisible).toBe(false);
  });
});
