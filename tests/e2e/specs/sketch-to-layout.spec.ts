import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Sketch → Layout wizard — Section 22 (Garden Layout Builder), Sage+ AI feature.
// The default E2E worker accounts are not guaranteed to be Sage tier, so this
// spec is written to be robust either way: it always asserts the wizard opens
// and the AI gate testid is correct for non-Sage accounts, and only runs the
// full detect → scale → classify → review → create happy path when the tier
// gate is not showing (i.e. the account is Sage/Evergreen).

const MOCK_DETECTION = {
  detection: {
    garden_outline: { width_ratio: 1, height_ratio: 0.7 },
    shapes: [
      {
        detected_kind: "raised_bed",
        geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
        label_guess: "Bed 1",
        confidence: 0.9,
      },
      {
        detected_kind: "pond",
        geometry: { type: "circle", cx: 0.7, cy: 0.7, r: 0.1 },
        label_guess: null,
        confidence: 0.4,
      },
    ],
  },
  sketch_url: "https://example.test/s.jpg",
};

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test.describe("Sketch to Layout wizard (Section 22)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-sketch-layout").click();
  });

  test("SKL-001: wizard opens; tier gate shown for non-Sage accounts, happy path for Sage+", async ({
    authenticatedPage,
  }) => {
    const wizard = authenticatedPage.getByTestId("sketch-to-layout-wizard");
    await expect(wizard).toBeVisible({ timeout: 10000 });

    const gate = authenticatedPage.getByTestId("sketch-to-layout-ai-gate");
    const isGated = await gate.isVisible({ timeout: 5000 }).catch(() => false);

    if (isGated) {
      // Non-Sage account — confirm the tier gate renders and stop here.
      await expect(gate).toBeVisible();
      return;
    }

    // Sage+ account — exercise the full detect → scale → classify → review → create flow.
    await authenticatedPage.route("**/functions/v1/sketch-to-layout", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DETECTION),
      });
    });

    await authenticatedPage.getByTestId("sketch-upload-file").click();
    await authenticatedPage.locator('input[type="file"]:not([capture])').setInputFiles({
      name: "sketch.png",
      mimeType: "image/png",
      buffer: PNG_BUFFER,
    });

    const detectBtn = authenticatedPage.getByTestId("sketch-detect-btn");
    await expect(detectBtn).toBeEnabled({ timeout: 10000 });
    await detectBtn.click();

    // Step 1 — Scale
    const widthInput = authenticatedPage.getByTestId("sketch-scale-width");
    await expect(widthInput).toBeVisible({ timeout: 10000 });
    await widthInput.fill("10");
    await authenticatedPage.getByTestId("sketch-next").click();

    // Step 2 — Classify: both mocked shapes render a row.
    await expect(authenticatedPage.getByTestId("sketch-shape-row-0")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("sketch-shape-row-1")).toBeVisible();
    await authenticatedPage.getByTestId("sketch-next").click();

    // Step 3 — Review + create.
    await authenticatedPage.getByTestId("sketch-create-btn").click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
  });
});
