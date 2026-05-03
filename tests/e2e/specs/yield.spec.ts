import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { YieldPage } from "../pages/YieldPage";
import { mockEdgeFunction, MOCK_PREDICT_YIELD } from "../fixtures/api-mocks";

// Seeded plant instance used in these tests:
//   Basil (BAS-001) — planted in Raised Bed A
//   3 yield records seeded via 10_yield.sql (0.15 kg, 0.20 kg, 0.18 kg)
//   expected_harvest_date: 2026-06-01
//
// UUID prefixes are worker-specific (PLAYWRIGHT_WORKER_INDEX is 0-based;
// seed worker w = workerIndex+1 uses prefix 0000000{w}-0000-0000-):
//   worker 0 (test1) → prefix 00000001-0000-0000-
//   worker 1 (test2) → prefix 00000002-0000-0000-  etc.

function workerPrefix(): string {
  const w = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
  return `0000000${w}-0000-0000-`;
}

function workerLocationId(): string {
  return `${workerPrefix()}0001-000000000001`;
}

function workerAreaId(): string {
  return `${workerPrefix()}0002-000000000001`;
}

// BAS-001 instance_id — seeded as 00000000-0000-0000-0004-000000000002
function workerInstanceId(): string {
  return `${workerPrefix()}0004-000000000002`;
}

// Navigate directly to the instance URL — AreaDetails auto-opens the modal
// when instanceId is present and plants have loaded, avoiding fragile
// group-expand + gear-icon click sequences.
async function openBasilYieldTab(authenticatedPage: any) {
  await authenticatedPage.goto(
    `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${workerInstanceId()}`,
  );
  await authenticatedPage.waitForLoadState("networkidle");

  // Wait for the modal to open (AreaDetails instanceId effect fires after plants load)
  const yp = new YieldPage(authenticatedPage);
  await expect(yp.tab).toBeVisible({ timeout: 15000 });
  await yp.tab.click();
  await authenticatedPage.waitForTimeout(300);

  return yp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 16 — Yield: Stage 1 (all users)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Yield — Stage 1: recorder (Section 16)", () => {
  test("YLD-001: Yield tab is visible when opening an instance modal", async ({ authenticatedPage }) => {
    await authenticatedPage.goto(
      `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${workerInstanceId()}`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(
      authenticatedPage.getByTestId("instance-modal-tab-yield"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("YLD-002: Unit select contains all expected options", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    for (const unit of ["g", "kg", "lbs", "oz", "items", "bunches"]) {
      await expect(yp.unitSelect.locator(`option[value="${unit}"]`)).toHaveCount(1);
    }
  });

  test("YLD-003: Submitting value=0.5 unit=kg inserts record and shows it in history", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.valueInput.fill("0.5");
    await yp.unitSelect.selectOption("kg");
    await yp.logButton.click();

    await expect(
      authenticatedPage.getByTestId("yield-history-list"),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      authenticatedPage.getByTestId("yield-history-list").getByText("0.5").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("YLD-004: Second entry appears at top of history (newest first)", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.valueInput.fill("1.1");
    await yp.unitSelect.selectOption("kg");
    await yp.logButton.click();
    await authenticatedPage.waitForTimeout(300);

    await yp.valueInput.fill("2.2");
    await yp.unitSelect.selectOption("kg");
    await yp.logButton.click();
    await authenticatedPage.waitForTimeout(300);

    // Most recent entry (2.2) should appear before the earlier (1.1) in DOM order
    const list = authenticatedPage.getByTestId("yield-history-list");
    const items = list.locator("[data-testid^='yield-record-']");
    const firstText = await items.first().textContent();
    expect(firstText).toContain("2.2");
  });

  test("YLD-005: Submitting empty value shows validation error", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.logButton.click();

    await expect(yp.valueError).toBeVisible({ timeout: 3000 });
  });

  test("YLD-006: Submitting without notes succeeds", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.valueInput.fill("0.3");
    await yp.logButton.click();

    await expect(
      authenticatedPage.getByTestId("yield-history-list"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("YLD-007: Seeded yield records are visible on tab open", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    // Three seeded records (0.15, 0.20, 0.18 kg) should all be in history
    const list = authenticatedPage.getByTestId("yield-history-list");
    await expect(list).toBeVisible({ timeout: 5000 });

    await expect(list.getByText("0.15").first()).toBeVisible({ timeout: 5000 });
    await expect(list.getByText("0.2").first()).toBeVisible({ timeout: 5000 });
    await expect(list.getByText("0.18").first()).toBeVisible({ timeout: 5000 });
  });

  test("YLD-008: Deleting a record removes it from the history list", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    // Log a record so we have something guaranteed to delete
    await yp.valueInput.fill("9.9");
    await yp.unitSelect.selectOption("g");
    await yp.logButton.click();
    await authenticatedPage.waitForTimeout(400);

    // The new record is first in list; read its ID then delete it
    const firstRecord = authenticatedPage
      .getByTestId("yield-history-list")
      .locator("[data-testid^='yield-record-']")
      .first();
    const firstId = await firstRecord.getAttribute("data-testid");
    const id = firstId?.replace("yield-record-", "");

    await authenticatedPage.getByTestId(`yield-delete-${id}`).click();
    await authenticatedPage.waitForTimeout(400);

    // Assert the specific deleted record is gone (not just the first slot)
    await expect(authenticatedPage.getByTestId(`yield-record-${id}`)).not.toBeVisible({ timeout: 3000 });
  });

  test("YLD-009: History shows human-readable date", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);
    await expect(
      authenticatedPage.getByTestId("yield-history-list"),
    ).toBeVisible({ timeout: 5000 });

    // The seeded record from 2026-04-01 should render as "1 April 2026"
    await expect(
      authenticatedPage.getByTestId("yield-history-list").getByText(/April 2026/).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("YLD-010: After logging a yield, Plant Journal tab shows a yield_logged entry", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.valueInput.fill("0.75");
    await yp.logButton.click();
    await authenticatedPage.waitForTimeout(500);

    // Switch to journal tab
    await authenticatedPage
      .getByTestId("instance-modal-tab-journal")
      .click();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.getByText(/yield/i).first(),
    ).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 16 — Yield: Stage 2 (AI predictor)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Yield — Stage 2: predictor (Section 16)", () => {
  test("YLD-011: AI-enabled user sees Predict Yield button (not paywall)", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);

    // Seed sets ai_enabled=true for all test workers
    await expect(yp.predictButton).toBeVisible({ timeout: 5000 });
    await expect(yp.predictorPaywall).not.toBeVisible();
  });

  test("YLD-012: Expected harvest date input is visible for AI user", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);
    await expect(yp.harvestDateInput).toBeVisible({ timeout: 5000 });
  });

  test("YLD-013: Expected harvest date is pre-populated from seed", async ({ authenticatedPage }) => {
    const yp = await openBasilYieldTab(authenticatedPage);
    await expect(yp.harvestDateInput).toHaveValue("2026-06-01", { timeout: 5000 });
  });

  test("YLD-014: Clicking Predict Yield shows loading state", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "predict-yield", MOCK_PREDICT_YIELD);
    const yp = await openBasilYieldTab(authenticatedPage);

    // Click and immediately check for loading indicator (before response)
    await yp.predictButton.click();
    await expect(
      authenticatedPage.getByText(/Predicting/i),
    ).toBeVisible({ timeout: 3000 });
  });

  test("YLD-015: Mocked prediction renders estimated value on the card", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "predict-yield", MOCK_PREDICT_YIELD);
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.predictButton.click();

    await expect(yp.predictionCard).toBeVisible({ timeout: 8000 });
    await expect(yp.predictionValue).toHaveText("2.4", { timeout: 5000 });
  });

  test("YLD-016: Confidence badge reads 'Medium confidence' for medium response", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "predict-yield", MOCK_PREDICT_YIELD);
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.predictButton.click();
    await expect(yp.predictionCard).toBeVisible({ timeout: 8000 });

    await expect(yp.predictionConfidence).toContainText("Medium confidence", {
      timeout: 5000,
    });
  });

  test("YLD-017: Reasoning text from mock is visible on the card", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "predict-yield", MOCK_PREDICT_YIELD);
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.predictButton.click();
    await expect(yp.predictionCard).toBeVisible({ timeout: 8000 });

    await expect(yp.predictionReasoning).toContainText(
      "past harvests",
      { timeout: 5000 },
    );
  });

  test("YLD-018: Each tip from mock is rendered as a list item", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "predict-yield", MOCK_PREDICT_YIELD);
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.predictButton.click();
    await expect(yp.predictionCard).toBeVisible({ timeout: 8000 });

    const tips = yp.predictionTips.locator("li");
    await expect(tips).toHaveCount(2, { timeout: 5000 });
  });

  test("YLD-019: Clicking Predict Yield again replaces the previous prediction", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "predict-yield", MOCK_PREDICT_YIELD);
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.predictButton.click();
    await expect(yp.predictionCard).toBeVisible({ timeout: 8000 });

    await yp.predictButton.click();
    // Card should disappear momentarily during loading, then reappear
    await expect(yp.predictionCard).toBeVisible({ timeout: 8000 });
    // Only one card should exist
    await expect(yp.predictionCard).toHaveCount(1, { timeout: 3000 });
  });

  test("YLD-020: Edge Function error shows toast, no prediction card shown", async ({ authenticatedPage }) => {
    await mockEdgeFunction(
      authenticatedPage,
      "predict-yield",
      { error: "Internal error" },
      500,
    );
    const yp = await openBasilYieldTab(authenticatedPage);

    await yp.predictButton.click();

    await expect(
      authenticatedPage.getByText(/Failed to get yield prediction/i),
    ).toBeVisible({ timeout: 8000 });
    await expect(yp.predictionCard).not.toBeVisible({ timeout: 3000 });
  });
});
