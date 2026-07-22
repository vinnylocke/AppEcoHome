import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Seeded fixtures (13_integrations.sql, worker-prefixed):
//   Soil sensor  {prefix}0014-000000000001 — "Raised Bed A Sensor", fresh reading
//   Soil profile — soil_moisture_profiles row: balanced 5.2%/day, day 24.5°C /
//                  night 12°C, EC stable 620 µS/cm (renders the behaviour panel)

function workerPrefix(): string {
  const w = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
  return `0000000${w}-0000-0000-`;
}

const soilDeviceId = () => `${workerPrefix()}0014-000000000001`;

// ─────────────────────────────────────────────────────────────────────────────
// Integrations — Device detail modal (IDD-001)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Integrations — device detail", () => {
  test("IDD-001: soil sensor modal shows the Soil behaviour indicators from the seeded profile", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/integrations");
    await authenticatedPage.waitForLoadState("networkidle");

    await authenticatedPage.getByTestId(`device-card-${soilDeviceId()}`).click();
    const modal = authenticatedPage.getByTestId("device-detail-modal");
    await expect(modal).toBeVisible({ timeout: 10000 });

    const panel = modal.getByTestId("soil-behaviour-panel");
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Drainage tile — the seeded drydown profile.
    await expect(panel.getByTestId("soil-behaviour-drainage")).toContainText("Balanced drainage");
    await expect(panel.getByTestId("soil-behaviour-drainage")).toContainText("5.2%/day");

    // Day/night temperature tile (24.5 → ~25°C peak, 12°C nights).
    await expect(panel.getByTestId("soil-behaviour-temp")).toContainText("Days peak ~25°C");
    await expect(panel.getByTestId("soil-behaviour-temp")).toContainText("nights ~12°C");

    // EC tile — stable, calibrated µS/cm.
    await expect(panel.getByTestId("soil-behaviour-ec")).toContainText("EC stable around 620 µS/cm");
    await expect(panel.getByTestId("soil-behaviour-ec")).toContainText("holding steady");
  });
});
