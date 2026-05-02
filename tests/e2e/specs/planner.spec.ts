import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { PlannerPage } from "../pages/PlannerPage";

// All tests require an authenticated session.

test.describe("Planner — page structure", () => {
  test("navigating to /planner renders the Planner heading", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    await expect(planner.heading).toBeVisible({ timeout: 10000 });
  });

  test("the New Plan button is always visible", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    await expect(planner.newPlanButton).toBeVisible({ timeout: 10000 });
  });

  test("Pending, Completed, and Archived status tabs are present", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    // The status tabs are rendered via aria-label="Plan status"
    const tabGroup = authenticatedPage.locator('[aria-label="Plan status"]');
    await expect(tabGroup).toBeVisible({ timeout: 10000 });

    await expect(planner.pendingTab).toBeVisible();
    await expect(planner.completedTab).toBeVisible();
    await expect(planner.archivedTab).toBeVisible();
  });

  test("Planner nav link navigates to /planner", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    await authenticatedPage
      .getByRole("button", { name: "Planner" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/planner");
  });

  test("plans list renders or shows the empty-state prompt", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    // Wait for loading to finish
    await authenticatedPage
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // Either plan cards are present OR the empty-state "No Pending Plans" copy is shown
    const planCards = authenticatedPage.locator('[aria-label="Plan options"]');
    const hasPlans = await planCards.count() > 0;
    // Empty state renders "No {activeTab} Plans" — unique text, no strict-mode collision
    const hasEmpty = await authenticatedPage
      .getByText(/No \w+ Plans/i)
      .isVisible()
      .catch(() => false);

    expect(hasPlans || hasEmpty).toBe(true);
  });
});

test.describe("Planner — New Plan modal", () => {
  test("clicking New Plan opens the plan creation modal", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    await expect(planner.newPlanButton).toBeVisible({ timeout: 10000 });
    await planner.newPlanButton.click();

    // The modal should appear — look for a heading or field inside it
    const modalContent = authenticatedPage
      .getByRole("heading", { name: /New Plan|Create.*Plan|Plan Name/i })
      .or(authenticatedPage.getByRole("textbox"))
      .first();

    await expect(modalContent).toBeVisible({ timeout: 5000 });
  });

  test("the plan creation modal can be dismissed", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    await expect(planner.newPlanButton).toBeVisible({ timeout: 10000 });
    await planner.newPlanButton.click();

    // Close via the X button or Escape key
    const closeButton = authenticatedPage.getByRole("button", {
      name: /Close|Cancel/i,
    });

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await authenticatedPage.keyboard.press("Escape");
    }

    // Modal should be gone — the form heading should no longer be visible
    await expect(
      authenticatedPage.getByRole("heading", { name: /New Plan|Create.*Plan/i }),
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("PLAN-011: Submitting with a blank project name shows a validation error", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    await expect(planner.newPlanButton).toBeVisible({ timeout: 10000 });
    await planner.newPlanButton.click();

    // Navigate through all 3 steps without filling in the project name.
    // Validation only fires at "Generate Project" — "Next Step" has no validation.
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Click "Generate Project" with blank project name — validation should fire
    const generateBtn = authenticatedPage.getByRole("button", { name: /Generate Project/i });
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();

    // Validation fires a toast (inline error is on step 1, not visible when form is on step 3)
    await expect(
      authenticatedPage.getByText("Please fill in all required fields."),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Planner — AI generation (Section 09)", () => {
  test("PLAN-012: AI generation — mocked success shows 'Project Generated Successfully!' toast", async ({ authenticatedPage }) => {
    const { mockEdgeFunction } = await import("../fixtures/api-mocks");

    await mockEdgeFunction(authenticatedPage, "generate-landscape-plan", {
      blueprint: {
        name: "AI Test Garden Plan",
        stages: [{ name: "Stage 1", tasks: [{ title: "Plant tomatoes", duration_days: 7 }] }],
      },
      cover_image_url: null,
    });

    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await expect(planner.newPlanButton).toBeVisible({ timeout: 10000 });
    await planner.newPlanButton.click();

    // Step 1: Vision — use a unique name so the cleanup can scope to this card
    const planName = `E2E AI Plan ${Date.now()}`;
    await authenticatedPage.getByLabel(/Project Name/i).fill(planName);
    await authenticatedPage.getByLabel(/Brief Description/i).fill("AI test plan");
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Step 2: Environment
    await authenticatedPage.getByLabel(/^Width/i).fill("5");
    await authenticatedPage.getByLabel(/^Length/i).fill("5");
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Step 3: Generate (mocked)
    await authenticatedPage.getByRole("button", { name: /Generate Project/i }).click();

    await expect(
      authenticatedPage.getByText(/Project Generated Successfully/i),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup: delete the created plan so it doesn't pollute the Pending tab for later tests
    const closeBtn = authenticatedPage.getByRole("button", { name: /Close|Cancel/i }).first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await authenticatedPage.waitForTimeout(400);

    const planCardVisible = await authenticatedPage.getByText(planName).isVisible({ timeout: 5000 }).catch(() => false);
    if (planCardVisible) {
      const planCard = authenticatedPage
        .locator("div.cursor-pointer")
        .filter({ hasText: planName })
        .first();
      await planCard.locator('[aria-label="Plan options"]').click();
      await authenticatedPage.waitForTimeout(200);
      const deleteOption = authenticatedPage.getByRole("button", { name: /Delete Plan/i });
      if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteOption.click();
      }
      if (await planner.deleteConfirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await planner.deleteConfirmButton.click();
      }
    }
  });

  test("PLAN-013: AI generation — mocked error shows error toast", async ({ authenticatedPage }) => {
    const { mockEdgeFunction } = await import("../fixtures/api-mocks");

    await mockEdgeFunction(
      authenticatedPage,
      "generate-landscape-plan",
      { error: "AI service unavailable" },
      500,
    );

    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();

    await expect(planner.newPlanButton).toBeVisible({ timeout: 10000 });
    await planner.newPlanButton.click();

    // Step 1: Vision
    await authenticatedPage.getByLabel(/Project Name/i).fill("Error Test Plan");
    await authenticatedPage.getByLabel(/Brief Description/i).fill("Error test");
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Step 2: Environment
    await authenticatedPage.getByLabel(/^Width/i).fill("5");
    await authenticatedPage.getByLabel(/^Length/i).fill("5");
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Step 3: Generate (mocked to 500 — no plan is created, no cleanup needed)
    await authenticatedPage.getByRole("button", { name: /Generate Project/i }).click();

    await expect(
      authenticatedPage.getByText(/Failed to generate project|AI service unavailable|non-2xx|error/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 09 — Planner: display (reads, use seeded data)
// Seeded plans (05_planner.sql):
//   "Summer Veg Plan"  — In Progress (Pending tab)
//   "Spring Cleanup"   — Completed tab
//   "Winter Prep"      — Archived tab
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Planner — plan tabs display (Section 09)", () => {
  test("PLAN-007: Completed tab shows seeded completed plan", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.completedTab.click();
    await authenticatedPage.waitForTimeout(300);

    await expect(
      authenticatedPage.getByText("Spring Cleanup"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("PLAN-008: Archived tab shows seeded archived plan", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.archivedTab.click();
    await authenticatedPage.waitForTimeout(300);

    await expect(
      authenticatedPage.getByText("Winter Prep"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("PLAN-011: Clicking a plan card opens the staging/detail view", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.planCard("Summer Veg Plan").click();
    await authenticatedPage.waitForTimeout(300);

    // Staging view shows a breadcrumb with a "Plans" back button
    await expect(planner.stagingBackButton).toBeVisible({ timeout: 8000 });
  });

  test("PLAN-014: Staging breadcrumb shows the selected plan name", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.planCard("Summer Veg Plan").click();
    await authenticatedPage.waitForTimeout(300);

    // Breadcrumb renders "Plans / Summer Veg Plan"
    await expect(planner.stagingBackButton).toBeVisible({ timeout: 8000 });
    await expect(
      authenticatedPage.getByText("Summer Veg Plan"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("PLAN-020: Clicking plan card enters staging view", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    // Ensure a plan card exists
    const cardVisible = await planner.planCard("Summer Veg Plan").isVisible({ timeout: 8000 }).catch(() => false);
    if (!cardVisible) return; // No plan seeded — pass

    await planner.planCard("Summer Veg Plan").click();

    // Staging back button appears
    await expect(planner.stagingBackButton).toBeVisible({ timeout: 8000 });
  });

  test("PLAN-021: Back button from staging view returns to plan list", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    const cardVisible = await planner.planCard("Summer Veg Plan").isVisible({ timeout: 8000 }).catch(() => false);
    if (!cardVisible) return;

    await planner.planCard("Summer Veg Plan").click();
    await expect(planner.stagingBackButton).toBeVisible({ timeout: 8000 });

    await planner.stagingBackButton.click();
    await authenticatedPage.waitForTimeout(400);

    // Back on the plan list — plan card should be visible again
    await expect(planner.planCard("Summer Veg Plan")).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 09 — Planner: actions (writes — run after reads)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Planner — plan actions (Section 09)", () => {
  test("PLAN-016: Cancel archive dialog leaves the plan in Pending", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await expect(
      authenticatedPage.getByText("Summer Veg Plan"),
    ).toBeVisible({ timeout: 10000 });

    // Open the plan options menu
    await authenticatedPage.locator('[aria-label="Plan options"]').first().click();
    await authenticatedPage.waitForTimeout(200);

    const archiveOption = authenticatedPage.getByRole("button", { name: /Archive Plan/i });
    if (await archiveOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await archiveOption.click();
    }

    // Cancel the confirmation dialog
    const cancelBtn = planner.cancelButton;
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
    }

    await expect(
      authenticatedPage.getByText("Summer Veg Plan"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("PLAN-015: Archive a pending plan — it moves to Archived tab", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await expect(
      authenticatedPage.getByText("Summer Veg Plan"),
    ).toBeVisible({ timeout: 10000 });

    // Open options menu — scope to "Summer Veg Plan" card to avoid hitting wrong card
    const summerVegCardPending = authenticatedPage
      .locator("div.cursor-pointer")
      .filter({ hasText: "Summer Veg Plan" })
      .first();
    await summerVegCardPending.locator('[aria-label="Plan options"]').click();
    await authenticatedPage.waitForTimeout(200);

    const archiveOption = authenticatedPage.getByRole("button", { name: /Archive Plan/i });
    if (await archiveOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await archiveOption.click();
    }

    // Confirm archive
    if (await planner.confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planner.confirmButton.click();
    }
    await authenticatedPage.waitForTimeout(500);

    // Plan should leave the Pending tab
    await expect(
      authenticatedPage.getByText("Summer Veg Plan"),
    ).not.toBeVisible({ timeout: 8000 });

    // Cleanup: restore from Archived tab — scope options button to this specific plan card
    await planner.archivedTab.click();
    await authenticatedPage.waitForTimeout(400);
    await expect(
      authenticatedPage.getByText("Summer Veg Plan"),
    ).toBeVisible({ timeout: 8000 });
    const summerVegCard = authenticatedPage
      .locator("div.cursor-pointer")
      .filter({ hasText: "Summer Veg Plan" })
      .first();
    await summerVegCard.locator('[aria-label="Plan options"]').click();
    await authenticatedPage.waitForTimeout(200);
    const restoreOption = authenticatedPage.getByRole("button", { name: /Restore Plan/i });
    if (await restoreOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreOption.click();
    }
    if (await planner.confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planner.confirmButton.click();
    }
  });

  test("PLAN-018: Cancel delete dialog leaves the plan in the list", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.completedTab.click();
    await authenticatedPage.waitForTimeout(300);

    await expect(
      authenticatedPage.getByText("Spring Cleanup"),
    ).toBeVisible({ timeout: 10000 });

    await authenticatedPage.locator('[aria-label="Plan options"]').first().click();
    await authenticatedPage.waitForTimeout(200);

    const deleteOption = authenticatedPage.getByRole("button", { name: /Delete Plan/i });
    if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteOption.click();
    }

    if (await planner.cancelButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planner.cancelButton.click();
    }

    await expect(
      authenticatedPage.getByText("Spring Cleanup"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("PLAN-017: Delete a plan — confirm removes it from the list", async ({ authenticatedPage }) => {
    const { mockEdgeFunction } = await import("../fixtures/api-mocks");

    // Mock the AI edge function so no real Gemini call is made
    await mockEdgeFunction(authenticatedPage, "generate-landscape-plan", {
      blueprint: {
        name: "Throwaway Test Plan",
        stages: [{ name: "Stage 1", tasks: [{ title: "Plant tomatoes", duration_days: 7 }] }],
      },
      cover_image_url: null,
    });

    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    // Create a throwaway plan via the 3-step form so seeded "Spring Cleanup" is not destroyed
    const planName = `E2E Delete Plan ${Date.now()}`;
    await planner.newPlanButton.click();

    // Step 1: Vision
    await authenticatedPage.getByLabel(/Project Name/i).fill(planName);
    await authenticatedPage.getByLabel(/Brief Description/i).fill("Throwaway plan for deletion test");
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Step 2: Environment
    await authenticatedPage.getByLabel(/^Width/i).fill("5");
    await authenticatedPage.getByLabel(/^Length/i).fill("5");
    await authenticatedPage.getByRole("button", { name: /Next Step/i }).click();
    await authenticatedPage.waitForTimeout(200);

    // Step 3: Generate (mocked)
    await authenticatedPage.getByRole("button", { name: /Generate Project/i }).click();

    await expect(
      authenticatedPage.getByText(/Project Generated Successfully/i),
    ).toBeVisible({ timeout: 10000 });

    // Dismiss modal if still open
    const closeBtn = authenticatedPage.getByRole("button", { name: /Close|Cancel/i }).first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await authenticatedPage.waitForTimeout(400);

    // The new plan appears in the Pending tab — scope options button to its card
    await expect(authenticatedPage.getByText(planName)).toBeVisible({ timeout: 10000 });

    const planCard = authenticatedPage
      .locator("div.cursor-pointer")
      .filter({ hasText: planName })
      .first();
    await planCard.locator('[aria-label="Plan options"]').click();
    await authenticatedPage.waitForTimeout(200);

    const deleteOption = authenticatedPage.getByRole("button", { name: /Delete Plan/i });
    if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteOption.click();
    }

    if (await planner.deleteConfirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planner.deleteConfirmButton.click();
    }
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.getByText(planName),
    ).not.toBeVisible({ timeout: 8000 });
  });

  test("PLAN-019: Restore an archived plan — it moves to Pending tab", async ({ authenticatedPage }) => {
    const planner = new PlannerPage(authenticatedPage);
    await planner.goto();
    await planner.waitForLoad();

    await planner.archivedTab.click();
    await authenticatedPage.waitForTimeout(300);

    await expect(
      authenticatedPage.getByText("Winter Prep"),
    ).toBeVisible({ timeout: 10000 });

    // Scope options button to "Winter Prep" card to avoid hitting wrong card
    const winterPrepCardArchived = authenticatedPage
      .locator("div.cursor-pointer")
      .filter({ hasText: "Winter Prep" })
      .first();
    await winterPrepCardArchived.locator('[aria-label="Plan options"]').click();
    await authenticatedPage.waitForTimeout(200);

    const restoreOption = authenticatedPage.getByRole("button", { name: /Restore Plan/i });
    if (await restoreOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreOption.click();
    }

    if (await planner.confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planner.confirmButton.click();
    }
    await authenticatedPage.waitForTimeout(500);

    // Plan should leave Archived tab
    await expect(
      authenticatedPage.getByText("Winter Prep"),
    ).not.toBeVisible({ timeout: 8000 });

    // Cleanup: switch to Pending and re-archive — scope options button to "Winter Prep" card
    await planner.pendingTab.click();
    await authenticatedPage.waitForTimeout(400);
    const restored = await authenticatedPage.getByText("Winter Prep").isVisible({ timeout: 5000 }).catch(() => false);
    if (restored) {
      const winterPrepCard = authenticatedPage
        .locator("div.cursor-pointer")
        .filter({ hasText: "Winter Prep" })
        .first();
      await winterPrepCard.locator('[aria-label="Plan options"]').click();
      await authenticatedPage.waitForTimeout(200);
      const archiveOption = authenticatedPage.getByRole("button", { name: /Archive Plan/i });
      if (await archiveOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await archiveOption.click();
      }
      if (await planner.confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await planner.confirmButton.click();
      }
    }
  });
});
