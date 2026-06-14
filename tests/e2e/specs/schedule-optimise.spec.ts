import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { SchedulePage } from "../pages/SchedulePage";

// Schedule → Optimise (Suggestions) tab — SCH-029 → SCH-039.
//
// Seeded fixtures (03_tasks_blueprints.sql):
//   - South Border: 1 Pruning blueprint, no other recurring → "All good!" deterministic
//   - Greenhouse:   2 instance-level Watering blueprints (freqs 7 vs 3, different
//                   inventory items) → fragmentation deterministic.
//
// AI tests mock the `optimise-area-ai` edge function so they don't touch Gemini.
// The test profile's `ai_enabled = true` by default, so SCH-036 (button hidden
// when AI off) overrides `user_profiles` via page.route() to return false.

const OUTSIDE_GARDEN = "Outside Garden";
const GREENHOUSE = "Greenhouse";
const SOUTH_BORDER = "South Border";

test.describe("Schedule — Optimise tab (Section 06c)", () => {
  test("SCH-029: Tab bar renders both Routines + Suggestions tabs", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await expect(schedule.tabBlueprints).toBeVisible({ timeout: 10000 });
    await expect(schedule.tabOptimise).toBeVisible();
  });

  test("SCH-030: Switching to the Suggestions tab reveals the area selector + Analyse button", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.tabOptimise.click();

    await expect(schedule.optimiseScopeSingle).toBeVisible({ timeout: 10000 });
    await expect(schedule.optimiseAnalyseBtn).toBeVisible();
    // No area selected yet → Analyse is disabled.
    await expect(schedule.optimiseAnalyseBtn).toBeDisabled();
  });

  test("SCH-031: Analyse with no issues shows the 'All good!' state", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.tabOptimise.click();
    await expect(schedule.optimiseLocationSelect).toBeVisible({ timeout: 10000 });

    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await expect(schedule.optimiseAreaSelect).toBeVisible();
    await schedule.optimiseAreaSelect.selectOption({ label: SOUTH_BORDER });

    await schedule.optimiseAnalyseBtn.click();

    await expect(schedule.optimiseAllGood).toBeVisible({ timeout: 15000 });
  });

  test("SCH-032: Analyse on a fragmented area produces at least one proposal card", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });
    await schedule.optimiseAnalyseBtn.click();

    // At least one rule-based proposal card visible.
    await expect(schedule.anyProposalCard().first()).toBeVisible({ timeout: 15000 });
    await expect(schedule.optimiseSuggestionsFound).toBeVisible();
  });

  test("SCH-033: Toggling include/exclude on a proposal updates the selected count", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });
    await schedule.optimiseAnalyseBtn.click();

    await expect(schedule.optimiseSelectedCount).toBeVisible({ timeout: 15000 });
    const beforeText = (await schedule.optimiseSelectedCount.textContent()) ?? "";
    const beforeCount = parseInt(beforeText.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(beforeCount).toBeGreaterThan(0);

    await schedule.anyProposalToggle().first().click();

    await expect.poll(async () => {
      const text = (await schedule.optimiseSelectedCount.textContent()) ?? "";
      return parseInt(text.match(/(\d+)/)?.[1] ?? "0", 10);
    }).toBe(beforeCount - 1);
  });

  test("SCH-034: Apply optimisation shows confirmation, success toast, and a new history row", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });
    await schedule.optimiseAnalyseBtn.click();
    await expect(schedule.anyProposalCard().first()).toBeVisible({ timeout: 15000 });

    await schedule.optimiseApplyBtn.click();
    await expect(schedule.confirmModalConfirm).toBeVisible({ timeout: 10000 });
    await schedule.confirmModalConfirm.click();

    await expect(authenticatedPage.getByText(/Applied \d+ optimisation/i)).toBeVisible({ timeout: 15000 });
    await expect(schedule.optimisationHistory).toBeVisible();
    await expect(schedule.anySessionRow().first()).toBeVisible({ timeout: 15000 });
  });

  test("SCH-035: Undo on the most recent session reverses the changes", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    // Apply first so there's a session to undo. (Independent runs assume seed
    // re-created the Greenhouse pair from scratch — see 03_tasks_blueprints.sql
    // cleanup block.)
    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });
    await schedule.optimiseAnalyseBtn.click();
    const firstCard = schedule.anyProposalCard().first();
    if (await firstCard.isVisible({ timeout: 15000 }).catch(() => false)) {
      await schedule.optimiseApplyBtn.click();
      await schedule.confirmModalConfirm.click();
      await expect(authenticatedPage.getByText(/Applied \d+ optimisation/i)).toBeVisible({ timeout: 15000 });
    }

    // A session row should now exist with an enabled Undo button.
    const undoBtn = schedule.anyUndoSessionBtn().first();
    await expect(undoBtn).toBeVisible({ timeout: 15000 });
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();

    await expect(authenticatedPage.getByText(/Optimisation reversed/i)).toBeVisible({ timeout: 15000 });
  });

  test("SCH-036: AI Analyse button is hidden when ai_enabled is false", async ({ authenticatedPage }) => {
    // Override the user_profiles GET so ai_enabled comes back false. The shim
    // must be installed before navigation so it intercepts the App's initial
    // profile fetch.
    await authenticatedPage.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() !== "GET") return route.fallback();
      const upstream = await route.fetch();
      const json = await upstream.json().catch(() => null);
      const rows: any[] = Array.isArray(json) ? json : json ? [json] : [];
      const patched = rows.map((row) => ({ ...row, ai_enabled: false }));
      const body = Array.isArray(json) ? patched : (patched[0] ?? null);
      return route.fulfill({
        status: upstream.status(),
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });

    // AI button should never render.
    await expect(schedule.optimiseAnalyseBtn).toBeVisible({ timeout: 10000 });
    await expect(schedule.optimiseAiAnalyseBtn).toHaveCount(0);
  });

  test("SCH-037: AI Analyse populates proposals (edge function mocked)", async ({ authenticatedPage }) => {
    const greenhouseProposalId = "frequency-change-Watering-MOCK";
    await authenticatedPage.route("**/functions/v1/optimise-area-ai", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          proposals: [
            {
              id: greenhouseProposalId,
              scenario: "frequency-change",
              areaId: "mock",
              category: "Watering",
              source: "ai",
              displayText: "Test: watering frequency could be reduced in winter.",
              reasoning: "Mocked AI response for SCH-037.",
              before: [],
              after: [],
              blueprintsToArchive: [],
              plantInstanceIdsForNewBlueprint: [],
              frequencyChanges: [],
            },
          ],
        }),
      });
    });

    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });

    await expect(schedule.optimiseAiAnalyseBtn).toBeVisible({ timeout: 10000 });
    await schedule.optimiseAiAnalyseBtn.click();

    await expect(schedule.proposalCard(greenhouseProposalId)).toBeVisible({ timeout: 15000 });
    // AI badge present on AI-sourced cards.
    await expect(schedule.proposalCard(greenhouseProposalId).getByText("AI", { exact: true })).toBeVisible();
  });

  test("SCH-038: Thumbs-up on an AI proposal disables the feedback buttons", async ({ authenticatedPage }) => {
    const mockProposalId = "frequency-change-Watering-MOCK";
    await authenticatedPage.route("**/functions/v1/optimise-area-ai", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          proposals: [
            {
              id: mockProposalId,
              scenario: "frequency-change",
              areaId: "mock",
              category: "Watering",
              source: "ai",
              displayText: "Test: bump watering frequency for summer heat.",
              reasoning: "Mocked AI proposal for SCH-038.",
              before: [],
              after: [],
              blueprintsToArchive: [],
              plantInstanceIdsForNewBlueprint: [],
              frequencyChanges: [],
            },
          ],
        }),
      });
    });

    // Make the feedback upsert succeed without hitting the DB so the test
    // doesn't pollute optimiser_proposal_feedback.
    await authenticatedPage.route(/\/rest\/v1\/optimiser_proposal_feedback/, (route) => {
      return route.fulfill({ status: 204, contentType: "application/json", body: "" });
    });

    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });
    await schedule.optimiseAiAnalyseBtn.click();

    const thumbsUp = schedule.proposalThumbsUp(mockProposalId);
    await expect(thumbsUp).toBeVisible({ timeout: 15000 });
    await thumbsUp.click();

    // After clicking, both thumbs buttons should be disabled (feedbackState.rating set).
    await expect(thumbsUp).toBeDisabled();
  });

  test("SCH-039: Regenerate AI results opens the reason modal", async ({ authenticatedPage }) => {
    const mockProposalId = "frequency-change-Watering-MOCK";
    await authenticatedPage.route("**/functions/v1/optimise-area-ai", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          proposals: [
            {
              id: mockProposalId,
              scenario: "frequency-change",
              areaId: "mock",
              category: "Watering",
              source: "ai",
              displayText: "Test proposal for SCH-039.",
              reasoning: "Mocked.",
              before: [],
              after: [],
              blueprintsToArchive: [],
              plantInstanceIdsForNewBlueprint: [],
              frequencyChanges: [],
            },
          ],
        }),
      });
    });

    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.tabOptimise.click();
    await schedule.optimiseLocationSelect.selectOption({ label: OUTSIDE_GARDEN });
    await schedule.optimiseAreaSelect.selectOption({ label: GREENHOUSE });
    await schedule.optimiseAiAnalyseBtn.click();
    await expect(schedule.optimiseRegenerateBtn).toBeVisible({ timeout: 15000 });

    await schedule.optimiseRegenerateBtn.click();

    await expect(schedule.regenerateReasonInput).toBeVisible({ timeout: 10000 });
  });
});
