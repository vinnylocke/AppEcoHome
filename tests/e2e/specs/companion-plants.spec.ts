import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// Seeded plants used: Lavender (source = 'api'), Tomato (source = 'manual')
// The companion-planting edge function is mocked so no real API/AI calls are made.

const MOCK_COMPANIONS = {
  beneficial: [
    { id: "verd-123", name: "Basil", scientificName: "Ocimum basilicum", reason: "Repels aphids and improves flavour." },
    { id: "verd-456", name: "Marigold", scientificName: "Tagetes erecta", reason: "Deters whitefly and nematodes." },
  ],
  harmful: [
    { id: "verd-789", name: "Fennel", scientificName: "Foeniculum vulgare", reason: "Inhibits growth of nearby plants." },
  ],
  neutral: [
    { id: null, name: "Parsley", scientificName: "Petroselinum crispum", reason: null },
  ],
};

const MOCK_AI_REQUIRED = { error: "ai_required" };

// ─────────────────────────────────────────────────────────────────────────────
// Section — Companion Plants Tab (CPT-001 – CPT-007)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Companion Plants Tab", () => {
  test("CPT-001: Companions tab button visible in PlantEditModal (shed plant)", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_COMPANIONS);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    // Click the first visible plant card to open PlantEditModal
    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    await expect(
      authenticatedPage.getByTestId("plant-modal-tab-companions"),
    ).toBeVisible({ timeout: 8000 });
  });

  test("CPT-002: Companions tab shows Beneficial section on click", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_COMPANIONS);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await firstCard.click();

    const companionsTab = authenticatedPage.getByTestId("plant-modal-tab-companions");
    await expect(companionsTab).toBeVisible({ timeout: 8000 });
    await companionsTab.click();

    await expect(
      authenticatedPage.getByTestId("companion-section-beneficial"),
    ).toBeVisible({ timeout: 8000 });
  });

  test("CPT-003: Beneficial section lists mocked plants", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_COMPANIONS);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await firstCard.click();

    await authenticatedPage.getByTestId("plant-modal-tab-companions").click();
    await expect(authenticatedPage.getByTestId("companion-section-beneficial")).toBeVisible({ timeout: 8000 });

    await expect(authenticatedPage.getByText("Basil")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByText("Marigold")).toBeVisible({ timeout: 5000 });
  });

  test("CPT-004: Harmful section lists mocked harmful plants", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_COMPANIONS);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await firstCard.click();

    await authenticatedPage.getByTestId("plant-modal-tab-companions").click();
    await expect(authenticatedPage.getByTestId("companion-section-harmful")).toBeVisible({ timeout: 8000 });

    await expect(authenticatedPage.getByText("Fennel")).toBeVisible({ timeout: 5000 });
  });

  test("CPT-005: Neutral section exists and is collapsed by default", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_COMPANIONS);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await firstCard.click();

    await authenticatedPage.getByTestId("plant-modal-tab-companions").click();
    await expect(authenticatedPage.getByTestId("companion-section-neutral")).toBeVisible({ timeout: 8000 });

    // Parsley should not be visible until the neutral section is expanded
    await expect(authenticatedPage.getByText("Parsley")).not.toBeVisible({ timeout: 3000 });

    // Expand neutral section
    await authenticatedPage.getByTestId("companion-section-neutral").click();
    await expect(authenticatedPage.getByText("Parsley")).toBeVisible({ timeout: 3000 });
  });

  test("CPT-006: Add to Shed button appears when a companion is checked", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_COMPANIONS);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await firstCard.click();

    await authenticatedPage.getByTestId("plant-modal-tab-companions").click();
    await expect(authenticatedPage.getByTestId("companion-section-beneficial")).toBeVisible({ timeout: 8000 });

    // Check the first companion (Basil)
    await authenticatedPage.getByTestId("companion-plant-verd-123").click();

    await expect(
      authenticatedPage.getByTestId("companion-add-to-shed"),
    ).toBeVisible({ timeout: 3000 });
  });

  test("CPT-007: ai_required error shows upgrade message", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "companion-planting", MOCK_AI_REQUIRED);

    await authenticatedPage.goto("/shed");
    await authenticatedPage.waitForLoadState("networkidle");

    const firstCard = authenticatedPage.locator("[data-plant-card]").first();
    await firstCard.click();

    await authenticatedPage.getByTestId("plant-modal-tab-companions").click();

    await expect(
      authenticatedPage.getByText("AI Add-on Required"),
    ).toBeVisible({ timeout: 8000 });
  });
});
