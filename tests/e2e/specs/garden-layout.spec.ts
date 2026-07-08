import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Garden Layout Builder — Section 20
// Covers Wave 1 changes: extracted toolbar, mode rename (Draw / Edit / Look),
// properties tabs (Style / Size / Link), sectioned shape rail, mobile floating bubble.

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

  test("GLB-013: floating bubble keeps view + zoom, hides settings (read-only)", async ({ authenticatedPage }) => {
    const bubble = authenticatedPage.getByTestId("editor-floating-bubble");
    await expect(bubble.getByTestId("bubble-view-btn")).toBeVisible();
    await expect(bubble.getByTestId("zoom-in-btn")).toBeVisible();
    await expect(bubble.getByTestId("zoom-out-btn")).toBeVisible();
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

    const stage = authenticatedPage.locator("canvas").first();
    const box = await stage.boundingBox();
    if (!box) throw new Error("Canvas not measurable");
    const x1 = box.x + box.width / 2 - 80;
    const y1 = box.y + box.height / 2 - 50;
    const x2 = box.x + box.width / 2 + 80;
    const y2 = box.y + box.height / 2 + 50;
    await authenticatedPage.mouse.move(x1, y1);
    await authenticatedPage.mouse.down();
    await authenticatedPage.mouse.move(x2, y2);
    await authenticatedPage.mouse.up();

    await expect(authenticatedPage.getByTestId("property-tab-style")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId("property-tab-size")).toBeVisible();
    await expect(authenticatedPage.getByTestId("property-tab-link")).toBeVisible();
  });

  test("GLB-016: Style tab shows label + colour, Size tab shows dimensions, Link tab shows delete", async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId("shape-tile-raised-bed").click();
    const stage = authenticatedPage.locator("canvas").first();
    const box = await stage.boundingBox();
    if (!box) throw new Error("Canvas not measurable");
    await authenticatedPage.mouse.move(box.x + 200, box.y + 200);
    await authenticatedPage.mouse.down();
    await authenticatedPage.mouse.move(box.x + 320, box.y + 280);
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
