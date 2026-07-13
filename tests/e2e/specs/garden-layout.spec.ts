import { expect, type Page } from "@playwright/test";
import { test } from "../fixtures/auth";

// Garden Layout Builder — Section 20
// Covers Wave 1 changes: extracted toolbar, mode rename (Draw / Edit / Look),
// properties tabs (Style / Size / Link), sectioned shape rail, mobile floating bubble.

/**
 * Centre of the VISIBLE part of the Konva canvas. The canvas can extend far
 * past the viewport (seeded weather-alert banners push the editor down and
 * the stage is 1000px+ tall at 1280×800), and raw mouse events can't hit
 * off-viewport points — GLB-015 failed for weeks because the element-centre
 * maths landed below the fold. Always drag relative to this instead.
 */
async function visibleCanvasCentre(page: Page): Promise<{ cx: number; cy: number }> {
  const stage = page.locator("canvas").first();
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  if (!box) throw new Error("Canvas not measurable");
  const vp = page.viewportSize();
  if (!vp) throw new Error("Viewport size unavailable");
  const x1 = Math.max(box.x, 0);
  const y1 = Math.max(box.y, 0);
  const x2 = Math.min(box.x + box.width, vp.width);
  const y2 = Math.min(box.y + box.height, vp.height);
  if (x2 <= x1 || y2 <= y1) throw new Error("Canvas has no visible area in the viewport");
  return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

test.describe("Garden Layout — list (Section 20 Stage 1)", () => {
  test("GLB-001: layout list loads with create button", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/garden-layout");
    await expect(authenticatedPage.getByTestId("create-layout-btn")).toBeVisible({ timeout: 10000 });
  });

  test("GLB-002: blank-canvas wizard creates a layout and navigates to editor", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-blank-canvas").click();

    const nameInput = authenticatedPage.getByTestId("new-layout-name-input");
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(`Wave1 Test ${Date.now()}`);
    await authenticatedPage.getByTestId("create-layout-confirm").click();

    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
    await expect(authenticatedPage.getByTestId("back-to-layouts-btn")).toBeVisible();
  });
});

test.describe("Garden Layout — editor desktop toolbar (Section 20 Stage 2)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-blank-canvas").click();
    await authenticatedPage.getByTestId("new-layout-name-input").fill(`Wave1 Desktop ${Date.now()}`);
    await authenticatedPage.getByTestId("create-layout-confirm").click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
  });

  test("GLB-006: desktop toolbar renders single row with three mode buttons", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("editor-toolbar-desktop")).toBeVisible();
    await expect(authenticatedPage.getByTestId("mode-draw-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("mode-move-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("mode-rotate-btn")).toBeVisible();
  });

  test("GLB-007: mode buttons show Draw / Edit / Look labels (Wave 1B rename)", async ({ authenticatedPage }) => {
    const draw = authenticatedPage.getByTestId("mode-draw-btn");
    const edit = authenticatedPage.getByTestId("mode-move-btn");
    const look = authenticatedPage.getByTestId("mode-rotate-btn");
    await expect(draw).toContainText(/Draw/i);
    await expect(edit).toContainText(/Edit/i);
    await expect(look).toContainText(/Look/i);
  });

  test("GLB-008: 2D/3D toggle + zoom controls + settings button visible", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("view-2d-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("view-3d-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("zoom-in-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("zoom-out-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("canvas-settings-btn")).toBeVisible();
  });

  test("GLB-009: switching to 3D hides zoom controls", async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId("view-3d-btn").click();
    await expect(authenticatedPage.getByTestId("zoom-in-btn")).toHaveCount(0);
  });
});

test.describe("Garden Layout — shape rail sections (Section 20 Stage 2 — Wave 1D)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-blank-canvas").click();
    await authenticatedPage.getByTestId("new-layout-name-input").fill(`Wave1 Rail ${Date.now()}`);
    await authenticatedPage.getByTestId("create-layout-confirm").click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
  });

  test("GLB-010: shape rail has Beds / Structures / Hardscape / Features sections", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("rail-section-beds")).toBeVisible();
    await expect(authenticatedPage.getByTestId("rail-section-structures")).toBeVisible();
    await expect(authenticatedPage.getByTestId("rail-section-hardscape")).toBeVisible();
    await expect(authenticatedPage.getByTestId("rail-section-features")).toBeVisible();
  });

  test("GLB-011: known presets render in their sections", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("shape-tile-raised-bed")).toBeVisible();
    await expect(authenticatedPage.getByTestId("shape-tile-greenhouse")).toBeVisible();
    await expect(authenticatedPage.getByTestId("shape-tile-path")).toBeVisible();
    await expect(authenticatedPage.getByTestId("shape-tile-pond")).toBeVisible();
  });
});

test.describe("Garden Layout — phone READ-ONLY viewer (garden-layout-fixes-and-mobile-readonly)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-blank-canvas").click();
    await authenticatedPage.getByTestId("new-layout-name-input").fill(`Wave1 Mobile ${Date.now()}`);
    await authenticatedPage.getByTestId("create-layout-confirm").click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
  });

  test("GLB-012: mobile viewer renders two rows + floating bubble, row 2 is the view-only banner", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("editor-toolbar-mobile-row-1")).toBeVisible();
    await expect(authenticatedPage.getByTestId("editor-toolbar-mobile-row-2")).toBeVisible();
    await expect(authenticatedPage.getByTestId("viewonly-banner")).toBeVisible();
    await expect(authenticatedPage.getByTestId("editor-floating-bubble")).toBeVisible();
  });

  test("GLB-013: floating bubble keeps view + zoom + layers, hides settings (read-only)", async ({ authenticatedPage }) => {
    const bubble = authenticatedPage.getByTestId("editor-floating-bubble");
    await expect(bubble.getByTestId("bubble-view-btn")).toBeVisible();
    await expect(bubble.getByTestId("zoom-in-btn")).toBeVisible();
    await expect(bubble.getByTestId("zoom-out-btn")).toBeVisible();
    // Overlay layers are viewable on phones too (view-only still allows overlays)
    await expect(bubble.getByTestId("bubble-layers-btn")).toBeVisible();
    await expect(bubble.getByTestId("canvas-settings-btn")).toHaveCount(0);
  });

  test("GLB-014: no shape rail and no mode strip on the phone viewer", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("shape-rail-mobile")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("mode-draw-btn")).toHaveCount(0);
  });
});

test.describe("Garden Layout — phone list card actions (kebab)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.goto("/garden-layout");
  });

  test("GLB-017: card body tap opens the layout (not rename)", async ({ authenticatedPage }) => {
    const openBtn = authenticatedPage.locator('[data-testid^="open-layout-"]').first();
    await openBtn.waitFor({ state: "visible", timeout: 15000 });
    await openBtn.click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
    await expect(authenticatedPage.getByTestId("viewonly-banner")).toBeVisible({ timeout: 15000 });
  });

  test("GLB-018: kebab menu holds rename / duplicate / delete on phones", async ({ authenticatedPage }) => {
    const kebab = authenticatedPage.locator('[data-testid^="layout-menu-"]').first();
    await kebab.waitFor({ state: "visible", timeout: 15000 });
    const id = (await kebab.getAttribute("data-testid"))!.replace("layout-menu-", "");
    await kebab.click();
    await expect(authenticatedPage.getByTestId(`layout-menu-rename-${id}`)).toBeVisible();
    await expect(authenticatedPage.getByTestId(`layout-menu-duplicate-${id}`)).toBeVisible();
    await expect(authenticatedPage.getByTestId(`layout-menu-delete-${id}`)).toBeVisible();
    // Inline desktop action buttons are hidden at this width.
    await expect(authenticatedPage.getByTestId(`rename-layout-${id}`)).not.toBeVisible();
  });
});

test.describe("Garden Layout — overlays in both views (3D parity + 2D toolbar)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1440, height: 900 });
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-blank-canvas").click();
    await authenticatedPage.getByTestId("new-layout-name-input").fill(`Overlay Test ${Date.now()}`);
    await authenticatedPage.getByTestId("create-layout-confirm").click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
  });

  test("GLB-048: 2D toolbar shows every overlay toggle (layers no longer 3D-only)", async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId("toggle-lux-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("toggle-sun-btn")).toBeVisible(); // home lat/lng is seeded
    await expect(authenticatedPage.getByTestId("toggle-companions-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("toggle-frost-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("toggle-wind-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("toggle-ph-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("toggle-moisture-btn")).toBeVisible();
  });

  test("GLB-049: overlay toggles flip aria-pressed in 2D without crashing the stage", async ({ authenticatedPage }) => {
    for (const id of ["toggle-wind-btn", "toggle-ph-btn", "toggle-moisture-btn"]) {
      const btn = authenticatedPage.getByTestId(id);
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
    // Stage still alive after toggling
    await expect(authenticatedPage.locator("canvas").first()).toBeVisible();
  });

  test("GLB-050: sun overlay in 2D reveals time controls + Day/Live mode switch", async ({ authenticatedPage }) => {
    // Off: no sun time controls in 2D
    await expect(authenticatedPage.getByTestId("sun-time-slider")).toHaveCount(0);

    await authenticatedPage.getByTestId("toggle-sun-btn").click();
    await expect(authenticatedPage.getByTestId("sun-time-slider")).toBeVisible();
    await expect(authenticatedPage.getByTestId("sun-date-input")).toBeVisible();

    const day = authenticatedPage.getByTestId("sun-mode-day");
    const live = authenticatedPage.getByTestId("sun-mode-live");
    await expect(day).toHaveAttribute("aria-pressed", "true"); // default mode
    await live.click();
    await expect(live).toHaveAttribute("aria-pressed", "true");
    await expect(day).toHaveAttribute("aria-pressed", "false");
  });

  test("GLB-051: overlay toggles stay available and functional in 3D", async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId("view-3d-btn").click();
    for (const id of ["toggle-frost-btn", "toggle-ph-btn", "toggle-moisture-btn", "toggle-companions-btn"]) {
      const btn = authenticatedPage.getByTestId(id);
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
    // 3D canvas survived the overlay toggles
    await expect(authenticatedPage.locator("canvas").first()).toBeVisible();
  });

  test("GLB-052: Live sun mode works in 3D and scrubbing the slider keeps the scene alive", async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId("view-3d-btn").click();
    await authenticatedPage.getByTestId("toggle-sun-btn").click();
    await authenticatedPage.getByTestId("sun-mode-live").click();
    await expect(authenticatedPage.getByTestId("sun-mode-live")).toHaveAttribute("aria-pressed", "true");

    const slider = authenticatedPage.getByTestId("sun-time-slider");
    await slider.fill("720");  // midday
    await slider.fill("1200"); // 20:00
    await expect(authenticatedPage.locator("canvas").first()).toBeVisible();
  });
});

test.describe("Garden Layout — properties tabs (Wave 1C)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto("/garden-layout");
    await authenticatedPage.getByTestId("create-layout-btn").click();
    await authenticatedPage.getByTestId("create-blank-canvas").click();
    await authenticatedPage.getByTestId("new-layout-name-input").fill(`Wave1 Props ${Date.now()}`);
    await authenticatedPage.getByTestId("create-layout-confirm").click();
    await expect(authenticatedPage).toHaveURL(/\/garden-layout\/.+/, { timeout: 10000 });
  });

  test("GLB-015: drawing a shape opens properties with three tabs", async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId("shape-tile-raised-bed").click();

    const { cx, cy } = await visibleCanvasCentre(authenticatedPage);
    await authenticatedPage.mouse.move(cx - 80, cy - 50);
    await authenticatedPage.mouse.down();
    await authenticatedPage.mouse.move(cx + 80, cy + 50);
    await authenticatedPage.mouse.up();

    await expect(authenticatedPage.getByTestId("property-tab-style")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId("property-tab-size")).toBeVisible();
    await expect(authenticatedPage.getByTestId("property-tab-link")).toBeVisible();
  });

  test("GLB-016: Style tab shows label + colour, Size tab shows dimensions, Link tab shows delete", async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId("shape-tile-raised-bed").click();
    const { cx, cy } = await visibleCanvasCentre(authenticatedPage);
    await authenticatedPage.mouse.move(cx - 60, cy - 40);
    await authenticatedPage.mouse.down();
    await authenticatedPage.mouse.move(cx + 60, cy + 40);
    await authenticatedPage.mouse.up();

    await expect(authenticatedPage.getByTestId("property-tab-style")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId("shape-label-input")).toBeVisible();

    await authenticatedPage.getByTestId("property-tab-size").click();
    await expect(authenticatedPage.getByTestId("shape-width-input")).toBeVisible();
    await expect(authenticatedPage.getByTestId("shape-height-input")).toBeVisible();
    await expect(authenticatedPage.getByTestId("shape-rotation-input")).toBeVisible();

    await authenticatedPage.getByTestId("property-tab-link").click();
    await expect(authenticatedPage.getByTestId("link-area-btn")).toBeVisible();
    await expect(authenticatedPage.getByTestId("delete-shape-btn")).toBeVisible();
  });
});
