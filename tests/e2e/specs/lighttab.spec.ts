import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { LightTabPage } from "../pages/LightTabPage";

// Seeded plants used in these tests:
//   Basil (BAS-001) — instance 0004-000000000002 — has sunlight: ["Full sun", "Partial shade"]
//   Tomato (TOM-001) — instance 0004-000000000001 — has sunlight: NULL (no-data case)
//
// UUID prefixes are worker-specific (PLAYWRIGHT_WORKER_INDEX is 0-based):
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

// Basil instance — has sunlight data
function basilInstanceId(): string {
  return `${workerPrefix()}0004-000000000002`;
}

// Tomato instance — no sunlight data (plant_id 1000001 has sunlight=NULL)
function tomatoInstanceId(): string {
  return `${workerPrefix()}0004-000000000001`;
}

async function openBasilLightTab(authenticatedPage: any) {
  await authenticatedPage.goto(
    `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${basilInstanceId()}`,
  );
  await authenticatedPage.waitForLoadState("networkidle");

  const lp = new LightTabPage(authenticatedPage);
  await expect(lp.tab).toBeVisible({ timeout: 15000 });
  await lp.tab.click();
  await authenticatedPage.waitForTimeout(300);
  return lp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 17 — Light Tab: Instance Modal (LGT-001 – LGT-006)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Light Tab — instance modal (Section 17)", () => {
  test("LGT-001: Light tab button is visible on instance modal", async ({ authenticatedPage }) => {
    await authenticatedPage.goto(
      `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${basilInstanceId()}`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(
      authenticatedPage.getByTestId("instance-modal-tab-light"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("LGT-002: Optimal range card is shown for Basil (has sunlight data)", async ({ authenticatedPage }) => {
    const lp = await openBasilLightTab(authenticatedPage);
    await expect(lp.optimalRangeCard).toBeVisible({ timeout: 5000 });
  });

  test("LGT-003: Get Reading button is visible when optimal range is shown", async ({ authenticatedPage }) => {
    const lp = await openBasilLightTab(authenticatedPage);
    await expect(lp.getReadingButton).toBeVisible({ timeout: 5000 });
  });

  test("LGT-004: Clicking Get Reading opens the sensor overlay", async ({ authenticatedPage }) => {
    const lp = await openBasilLightTab(authenticatedPage);
    await lp.getReadingButton.click();

    // Overlay shows the plant name heading and back button
    await expect(lp.backButton).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByText("Light Reading")).toBeVisible({ timeout: 5000 });
  });

  test("LGT-005: Sensor overlay contains a lux display element", async ({ authenticatedPage }) => {
    const lp = await openBasilLightTab(authenticatedPage);
    await lp.getReadingButton.click();

    // Lux element exists (value may be 0 in headless — just assert presence)
    await expect(lp.luxDisplay).toBeVisible({ timeout: 8000 });
  });

  test("LGT-006: Back button closes the sensor overlay", async ({ authenticatedPage }) => {
    const lp = await openBasilLightTab(authenticatedPage);
    await lp.getReadingButton.click();
    await expect(lp.backButton).toBeVisible({ timeout: 5000 });

    await lp.backButton.click();
    await expect(lp.backButton).not.toBeVisible({ timeout: 3000 });
    // Light tab content is visible again
    await expect(lp.getReadingButton).toBeVisible({ timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 17 — Light Tab: TheShed plant modal (LGT-007 – LGT-008)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Light Tab — shed plant modal (Section 17)", () => {
  test("LGT-007: Light tab is visible on plant modal opened from TheShed", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    // Click the first visible plant card to open PlantEditModal
    const plantCard = authenticatedPage
      .locator("[data-testid^='plant-card-']")
      .first();
    // Fallback: click any card that opens the modal (any non-archived plant card)
    await plantCard
      .click()
      .catch(() =>
        authenticatedPage.locator(".grid > div").first().click(),
      );

    await expect(
      authenticatedPage.getByTestId("plant-modal-tab-light"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("LGT-008: No-data card shown when plant has no sunlight in DB", async ({ authenticatedPage }) => {
    // Tomato (instance 0004-000000000001) references plant 1000001 which has sunlight=NULL
    await authenticatedPage.goto(
      `/dashboard?locationId=${workerLocationId()}&areaId=${workerAreaId()}&instanceId=${tomatoInstanceId()}`,
    );
    // Tomato is Unplanted so it won't be in Raised Bed A — navigate to shed instead
    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    // Find the Tomato plant card and open it
    const tomatoCard = authenticatedPage.getByText("Tomato").first();
    await expect(tomatoCard).toBeVisible({ timeout: 8000 });
    await tomatoCard.click();

    // Click the Light tab on the plant modal
    await expect(
      authenticatedPage.getByTestId("plant-modal-tab-light"),
    ).toBeVisible({ timeout: 8000 });
    await authenticatedPage.getByTestId("plant-modal-tab-light").click();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.getByTestId("light-tab-no-data"),
    ).toBeVisible({ timeout: 5000 });
  });
});
