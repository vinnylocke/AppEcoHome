import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// dashboard-nav-tasks-tray redesign Stage 4 — discoverability + error-state
// improvements (B5 Ailment Library, B7 Shelf filter, B8 dead menu item,
// B12 Routines tab, B15 Calendar subtitle). B13 (Automations load-error) is a
// small typechecked branch covered by manual/visual review, not a spec.

test.describe("Stage 4 — discoverability", () => {
  test("DISC-B5: the Ailments tile is gone from the Tools hub (Hub v3 made the hub the one ailment surface)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/tools");
    // Another Tools tile anchors the page having loaded before we assert absence.
    await expect(authenticatedPage.getByTestId("tools-hub-plant-doctor")).toBeVisible({ timeout: 10000 });
    // Removed 2026-07-22 — the tile duplicated the Garden Hub's Ailments tab.
    await expect(authenticatedPage.getByTestId("tools-hub-ailment-library")).toHaveCount(0);
  });

  test("DISC-B12: the Planner has a Routines tab that opens the routine manager", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/planner");
    const tab = authenticatedPage.getByTestId("planner-hub-tab-routines");
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();
    await expect(authenticatedPage).toHaveURL(/tab=routines/, { timeout: 8000 });
    // BlueprintManager renders the seeded blueprints under the tab.
    await expect(authenticatedPage.getByText("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
  });

  test("DISC-B8: the no-op 'Getting Started' account-menu item was removed (Help remains)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.getByTestId("user-profile-trigger").click();
    await expect(authenticatedPage.getByTestId("user-profile-dropdown")).toBeVisible({ timeout: 8000 });
    await expect(authenticatedPage.getByTestId("user-profile-getting-started")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("user-profile-help")).toBeVisible();
  });

  test("DISC-IA1: 'Routines' left the account menu; Sync/Check moved to a System section", async ({ authenticatedPage }) => {
    // 2026-07-23 IA reorg — Routines is feature nav (already under Planner), so
    // it was pulled out of the account dropdown's Management section. Sync now /
    // Check for update are system actions, split out of "Help" into "System".
    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.getByTestId("user-profile-trigger").click();
    await expect(authenticatedPage.getByTestId("user-profile-dropdown")).toBeVisible({ timeout: 8000 });
    // Routines gone; the two management CRUD items remain.
    await expect(authenticatedPage.getByTestId("user-profile-task-manager")).toHaveCount(0);
    await expect(authenticatedPage.getByTestId("user-profile-location-management")).toBeVisible();
    // Sync now / Check for update still reachable (now under the System label).
    await expect(authenticatedPage.getByTestId("user-profile-check-for-update")).toBeVisible();
  });

  test("DISC-B16: Garden Reports is routed and reachable from the Tools hub", async ({ authenticatedPage }) => {
    // Stage 5 — the fully-built reports view was orphaned (no route); now wired
    // to /reports. 2026-07-23 IA reorg moved the tile from "Measure & Track"
    // into the new "Review & Plan Ahead" group (tools-group-review).
    await authenticatedPage.goto("/tools");
    await expect(authenticatedPage.getByTestId("tools-group-review")).toBeVisible({ timeout: 10000 });
    const tile = authenticatedPage.getByTestId("tools-hub-garden-reports");
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.click();
    await expect(authenticatedPage).toHaveURL(/\/reports/, { timeout: 8000 });
    // The reports view renders (its Monthly / Year-in-Review toggle is the stable anchor).
    await expect(authenticatedPage.getByTestId("reports-view-toggle")).toBeVisible({ timeout: 15000 });
  });

  test("DISC-B16b: Weekly Overview has a Tools-hub tile that routes to /weekly", async ({ authenticatedPage }) => {
    // 2026-07-23 IA reorg — /weekly was in the Tools nav matchPaths but had no
    // tile (only reachable from the dashboard Week Ahead card). Now surfaced in
    // the "Review & Plan Ahead" group alongside Garden Reports.
    await authenticatedPage.goto("/tools");
    const tile = authenticatedPage.getByTestId("tools-hub-weekly-overview");
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.click();
    await expect(authenticatedPage).toHaveURL(/\/weekly/, { timeout: 8000 });
  });

  test("DISC-B15: the Schedule header shows a live task summary, not 'Operational Hub'", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/calendar");
    await expect(authenticatedPage.getByTestId("calendar-view-toggle")).toBeVisible({ timeout: 15000 });
    await expect(authenticatedPage.getByText("Operational Hub")).toHaveCount(0);
  });
});

test.describe("Stage 4 — Shelf overflow (mobile)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("DISC-B7: the Shelf lists only true overflow — not the Deck's Home/Plants tabs", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.getByTestId("bottom-tab-more").click();
    const drawer = authenticatedPage.getByTestId("mobile-nav-drawer");
    await expect(drawer).toBeVisible({ timeout: 8000 });
    // True overflow is present (Planner joined it 2026-07-22 when its Deck
    // slot became the Tasks tray)…
    await expect(drawer.getByText("Tools", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Planner", { exact: true })).toBeVisible();
    // …but the Deck's nav destinations are not re-listed here.
    await expect(drawer.getByText("Plants", { exact: true })).toHaveCount(0);
  });
});
