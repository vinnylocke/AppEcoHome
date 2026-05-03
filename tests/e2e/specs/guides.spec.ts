import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { GuidesPage } from "../pages/GuidesPage";

// All tests require an authenticated session.
// Seeded guides (07_guides.sql):
//   "Watering Basics"      — Beginner, labels: Watering, Beginner, Organic
//   "Pruning Techniques"   — Intermediate, labels: Pruning, Intermediate
//   "Composting 101"       — Beginner, labels: Soil, Beginner, Organic

// ─────────────────────────────────────────────────────────────────────────────
// Section 13 — Guides: display
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Guides — page structure (Section 13)", () => {
  test("GDE-001: Navigating to /guides renders the Rhozly Guides heading", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();

    await expect(guides.heading).toBeVisible({ timeout: 10000 });
  });

  test("GDE-002: Guides nav link navigates to /guides", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    await authenticatedPage
      .getByRole("button", { name: "Guides" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/guides");
  });

  test("GDE-003: Search input is visible", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();

    await expect(guides.searchInput).toBeVisible({ timeout: 10000 });
  });

  test("GDE-004: Tag filter button is visible", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await expect(guides.tagFilterButton).toBeVisible({ timeout: 10000 });
  });

  test("GDE-005: Seeded guide 'Watering Basics' is visible in the list", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await expect(
      guides.guideCard("Watering Basics"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("GDE-006: Seeded guide 'Pruning Techniques' is visible in the list", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await expect(guides.guideCard("Pruning Techniques")).toBeVisible({ timeout: 10000 });
  });

  test("GDE-007: Seeded guide 'Composting 101' is visible in the list", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await expect(guides.guideCard("Composting 101")).toBeVisible({ timeout: 10000 });
  });

  test("GDE-008: Guides display difficulty / label badges", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    // At least one difficulty label should be present (Beginner or Intermediate)
    const hasBeginner = await authenticatedPage.getByText("Beginner").first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasIntermediate = await authenticatedPage.getByText("Intermediate").first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasBeginner || hasIntermediate).toBe(true);
  });
});

test.describe("Guides — empty state (Section 13)", () => {
  test("GDE-003: No guides in DB — 'No guides found' is shown", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Mock the guides query to return an empty array
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/guides*`,
      (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );

    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await authenticatedPage.waitForTimeout(800);

    await expect(
      authenticatedPage.getByText("No guides found"),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Guides — search and filter (Section 13)", () => {
  test("GDE-009: Typing in the search box filters the guide list", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    // Type "Watering" in the search box
    await guides.searchInput.fill("Watering");
    await authenticatedPage.waitForTimeout(300);

    // "Watering Basics" should still be visible
    await expect(
      guides.guideCard("Watering Basics"),
    ).toBeVisible({ timeout: 5000 });

    // "Composting 101" should be filtered out
    await expect(
      guides.guideCard("Composting 101"),
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("GDE-010: Clearing the search box restores all guides", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await guides.searchInput.fill("Watering");
    await authenticatedPage.waitForTimeout(300);

    await guides.searchInput.fill("");
    await authenticatedPage.waitForTimeout(300);

    await expect(
      guides.guideCard("Composting 101"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("GDE-011: Clicking a guide card opens the guide detail view", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await guides.guideCard("Watering Basics").click();
    await authenticatedPage.waitForTimeout(400);

    // Detail view renders the guide title as h1
    await expect(
      authenticatedPage.getByRole("heading", { name: /Watering Basics/i }).first(),
    ).toBeVisible({ timeout: 8000 });
  });

  test("GDE-012: Back to Library button returns to the guide list", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await guides.guideCard("Watering Basics").click();
    await authenticatedPage.waitForTimeout(400);

    await expect(guides.backToLibraryButton).toBeVisible({ timeout: 5000 });
    await guides.backToLibraryButton.click();
    await authenticatedPage.waitForTimeout(300);

    // Back on the library — heading should be visible again
    await expect(guides.heading).toBeVisible({ timeout: 5000 });
  });

  test("GDE-013: Guide detail view shows section content", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await guides.guideCard("Watering Basics").click();
    await authenticatedPage.waitForTimeout(400);

    // Guide content is seeded with a text body about watering
    await expect(
      authenticatedPage.getByText(/watering/i).first(),
    ).toBeVisible({ timeout: 8000 });
  });

  test("GDE-014: Tag filter dropdown opens when clicked", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await guides.tagFilterButton.click();
    await authenticatedPage.waitForTimeout(300);

    // Dropdown should be expanded — look for "All" option (use first() to avoid strict-mode
    // if the tag filter button also contains "All" text in its label)
    await expect(
      authenticatedPage.getByText("All").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("GDE-015: Search with no match shows 'No guides found' empty state", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    await guides.searchInput.fill("xyzqwerty");
    await authenticatedPage.waitForTimeout(400);

    await expect(
      authenticatedPage.getByText("No guides found"),
    ).toBeVisible({ timeout: 5000 });

    // None of the seeded guide titles should be visible
    await expect(guides.guideCard("Watering Basics")).not.toBeVisible();
  });

  test("GDE-016: Filter by 'Beginner' label — only Beginner guides shown", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    // Open the tag filter dropdown
    await guides.tagFilterButton.click();
    await authenticatedPage.waitForTimeout(300);

    // Options are rendered as role="option" buttons inside the dropdown
    await authenticatedPage.getByRole("option", { name: /^Beginner$/i }).click();
    await authenticatedPage.waitForTimeout(400);

    // "Watering Basics" (Beginner) should still be visible
    await expect(guides.guideCard("Watering Basics")).toBeVisible({ timeout: 5000 });
    // "Pruning Techniques" (Intermediate) should be filtered out
    await expect(guides.guideCard("Pruning Techniques")).not.toBeVisible({ timeout: 3000 });
  });

  test("GDE-018: Guides fetch error — 'Failed to load guides' message is shown", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Mock the guides query to return a server error
    await authenticatedPage.route(`${supabaseUrl}/rest/v1/guides*`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal Server Error"}' }),
    );

    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await authenticatedPage.waitForTimeout(800);

    await expect(
      authenticatedPage.getByText(/Failed to load guides/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test("GDE-019: Clicking 'Try Again' after error reloads guides successfully", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    let callCount = 0;
    await authenticatedPage.route(`${supabaseUrl}/rest/v1/guides*`, (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"Internal Server Error"}' });
      } else {
        route.continue();
      }
    });

    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await authenticatedPage.waitForTimeout(800);

    // Error state should be showing
    await expect(
      authenticatedPage.getByText(/Failed to load guides/i),
    ).toBeVisible({ timeout: 10000 });

    // Click "Try Again" (the retry button rendered in the error state)
    const retryButton = authenticatedPage.getByRole("button", { name: /Try Again/i });
    await expect(retryButton).toBeVisible({ timeout: 5000 });
    await retryButton.click();

    // After retry the guides should load from the real DB
    await expect(
      guides.guideCard("Watering Basics"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("GDE-017: Clear label filter — selecting 'All' restores all guides", async ({ authenticatedPage }) => {
    const guides = new GuidesPage(authenticatedPage);
    await guides.goto();
    await guides.waitForLoad();

    // Apply Beginner filter first
    await guides.tagFilterButton.click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.getByRole("option", { name: /^Beginner$/i }).click();
    await authenticatedPage.waitForTimeout(400);

    // Verify Pruning Techniques is hidden
    await expect(guides.guideCard("Pruning Techniques")).not.toBeVisible({ timeout: 3000 });

    // Re-open dropdown and select "All" to clear the filter
    await guides.tagFilterButton.click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.getByRole("option", { name: /^All$/i }).click();
    await authenticatedPage.waitForTimeout(400);

    // All seeded guides should be visible again
    await expect(guides.guideCard("Pruning Techniques")).toBeVisible({ timeout: 5000 });
    await expect(guides.guideCard("Watering Basics")).toBeVisible({ timeout: 5000 });
    await expect(guides.guideCard("Composting 101")).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 13 — Guides tab on plant species (PlantEditModal)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Guides — plant species Guides tab (Section 13)", () => {
  test("GDE-021: Guides tab is visible on a plant in The Shed", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    // Click the first visible plant card edit button
    await authenticatedPage
      .locator('[data-testid^="plant-card-"]')
      .first()
      .click();

    // Wait for the modal
    await expect(
      authenticatedPage.locator('[data-testid="plant-modal-tab-guides"]'),
    ).toBeVisible({ timeout: 8000 });
  });

  test("GDE-022: Guides tab for Tomato shows 'Growing Tomatoes' guide card", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    // Open the Tomato plant modal
    await authenticatedPage
      .locator("h3, p")
      .filter({ hasText: "Tomato" })
      .first()
      .click();

    await authenticatedPage
      .locator('[data-testid="plant-modal-tab-guides"]')
      .click();

    // Guides are globally public (no RLS) so all 4 worker seeds are visible — use first()
    await expect(
      authenticatedPage.locator('[data-testid="guide-card-growing-tomatoes"]').first(),
    ).toBeVisible({ timeout: 8000 });
  });

  test("GDE-023: Clicking a guide card in the Guides tab opens the inline reader", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    await authenticatedPage
      .locator("h3, p")
      .filter({ hasText: "Tomato" })
      .first()
      .click();

    await authenticatedPage
      .locator('[data-testid="plant-modal-tab-guides"]')
      .click();

    // Guides are globally public — use first() to avoid strict mode violation
    await authenticatedPage
      .locator('[data-testid="guide-card-growing-tomatoes"]')
      .first()
      .click();

    await expect(
      authenticatedPage.locator('[data-testid="guide-reader-back"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  test("GDE-024: Back button in guide reader returns to guide list", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    await authenticatedPage
      .locator("h3, p")
      .filter({ hasText: "Tomato" })
      .first()
      .click();

    await authenticatedPage
      .locator('[data-testid="plant-modal-tab-guides"]')
      .click();

    // Guides are globally public — use first() to avoid strict mode violation
    await authenticatedPage
      .locator('[data-testid="guide-card-growing-tomatoes"]')
      .first()
      .click();

    await authenticatedPage
      .locator('[data-testid="guide-reader-back"]')
      .click();

    await expect(
      authenticatedPage.locator('[data-testid="plant-guides-list"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  test("GDE-025: Plant with no matching guides shows empty state", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    // Boston Fern has no matching guide labels or name matches
    await authenticatedPage
      .locator("h3, p")
      .filter({ hasText: "Boston Fern" })
      .first()
      .click();

    await authenticatedPage
      .locator('[data-testid="plant-modal-tab-guides"]')
      .click();

    await expect(
      authenticatedPage.locator('[data-testid="guides-empty-state"]'),
    ).toBeVisible({ timeout: 8000 });
  });
});
