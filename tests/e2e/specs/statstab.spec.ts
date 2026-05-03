import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { InstanceStatsTabPage } from "../pages/InstanceStatsTabPage";

// Seeded plant instances used in these tests:
//   Basil (BAS-001) — instance 0004-000000000002 — has yield records, pruning task, ailment link
//   Tomato (TOM-001) — instance 0004-000000000001 — no stats data (empty states)
//
// UUID prefix is worker-specific (PLAYWRIGHT_WORKER_INDEX is 0-based):
//   worker 0 (test1) → 00000001-0000-0000-
//   worker 1 (test2) → 00000002-0000-0000-  etc.

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

function basilInstanceId(): string {
  return `${workerPrefix()}0004-000000000002`;
}

function tomatoInstanceId(): string {
  return `${workerPrefix()}0004-000000000001`;
}

async function openBasilStatsTab(authenticatedPage: any) {
  await authenticatedPage.goto(
    `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${basilInstanceId()}`,
  );
  await authenticatedPage.waitForLoadState("networkidle");

  const sp = new InstanceStatsTabPage(authenticatedPage);
  await expect(sp.tab).toBeVisible({ timeout: 15000 });
  await sp.tab.click();
  await authenticatedPage.waitForTimeout(500);
  return sp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 18 — Stats Tab: Instance Modal (STT-001 – STT-007)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Stats Tab — instance modal (Section 18)", () => {
  test("STT-001: Stats tab button is visible on instance modal", async ({ authenticatedPage }) => {
    await authenticatedPage.goto(
      `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${basilInstanceId()}`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(
      authenticatedPage.getByTestId("instance-modal-tab-stats"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("STT-002: Plant Info section shows a planted date", async ({ authenticatedPage }) => {
    const sp = await openBasilStatsTab(authenticatedPage);
    await expect(sp.plantInfoSection).toBeVisible({ timeout: 5000 });
    // Basil has planted_at seeded — the date should not be "Not recorded"
    const text = await sp.plantInfoSection.textContent();
    expect(text).not.toContain("Not recorded");
  });

  test("STT-003: Yield section shows count ≥ 1 (2 seeded records)", async ({ authenticatedPage }) => {
    const sp = await openBasilStatsTab(authenticatedPage);
    await expect(sp.yieldCount).toBeVisible({ timeout: 5000 });
    const count = parseInt(await sp.yieldCount.textContent() ?? "0", 10);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("STT-004: Pruning section shows count ≥ 1 (1 seeded prune task)", async ({ authenticatedPage }) => {
    const sp = await openBasilStatsTab(authenticatedPage);
    await expect(sp.pruneCount).toBeVisible({ timeout: 5000 });
    const count = parseInt(await sp.pruneCount.textContent() ?? "0", 10);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("STT-005: Issues section shows at least 1 ailment (seeded Aphid link)", async ({ authenticatedPage }) => {
    const sp = await openBasilStatsTab(authenticatedPage);
    await expect(sp.issuesSection).toBeVisible({ timeout: 5000 });
    await expect(sp.issueItems.first()).toBeVisible({ timeout: 5000 });
    expect(await sp.issueItems.count()).toBeGreaterThanOrEqual(1);
  });

  test("STT-006: Task total count element is visible", async ({ authenticatedPage }) => {
    const sp = await openBasilStatsTab(authenticatedPage);
    await expect(sp.taskTotal).toBeVisible({ timeout: 5000 });
  });

  test("STT-007: Empty states shown for Tomato (no yield, no pruning, no ailments)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto(
      `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${tomatoInstanceId()}`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    const sp = new InstanceStatsTabPage(authenticatedPage);
    // Tomato is Unplanted — navigate to shed and open the Tomato card instead
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const tomatoCard = authenticatedPage.getByText("Tomato").first();
    await expect(tomatoCard).toBeVisible({ timeout: 8000 });
    await tomatoCard.click();

    await expect(sp.tab).toBeVisible({ timeout: 8000 });
    await sp.tab.click();
    await authenticatedPage.waitForTimeout(500);

    // No yield records, no pruning tasks, no ailments → all empty states
    await expect(sp.issuesNone).toBeVisible({ timeout: 5000 });
    // Yield and prune sections exist but show empty text
    await expect(sp.yieldSection).toBeVisible({ timeout: 5000 });
    await expect(sp.pruneSection).toBeVisible({ timeout: 5000 });
    // Yield count should NOT be visible (empty state, not the number)
    await expect(sp.yieldCount).not.toBeVisible({ timeout: 3000 });
    await expect(sp.pruneCount).not.toBeVisible({ timeout: 3000 });
  });
});
