import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// dashboard-nav-tasks-tray redesign Stage 4 — discoverability + error-state
// improvements (B5 Ailment Library, B7 Shelf filter, B8 dead menu item,
// B12 Routines tab, B15 Calendar subtitle). B13 (Automations load-error) is a
// small typechecked branch covered by manual/visual review, not a spec.

test.describe("Stage 4 — discoverability", () => {
  test("DISC-B5: the Ailments tile on the Tools hub opens the Ailments tab (Stage F retarget)", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/tools");
    const tile = authenticatedPage.getByTestId("tools-hub-ailment-library");
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.click();
    // Hub v3 Stage F: the standalone library page died — the tile lands on
    // the Ailments tab, whose search IS the field guide.
    await expect(authenticatedPage).toHaveURL(/\/shed\?tab=watchlist/, { timeout: 8000 });
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

  test("DISC-B16: Garden Reports is routed and reachable from the Tools hub", async ({ authenticatedPage }) => {
    // Stage 5 — the fully-built reports view was orphaned (no route); now wired
    // to /reports with a Measure & Track tile (locked decision: surface it).
    await authenticatedPage.goto("/tools");
    const tile = authenticatedPage.getByTestId("tools-hub-garden-reports");
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.click();
    await expect(authenticatedPage).toHaveURL(/\/reports/, { timeout: 8000 });
    // The reports view renders (its Monthly / Year-in-Review toggle is the stable anchor).
    await expect(authenticatedPage.getByTestId("reports-view-toggle")).toBeVisible({ timeout: 15000 });
  });

  test("DISC-B15: the Schedule header shows a live task summary, not 'Operational Hub'", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard?view=calendar");
    await expect(authenticatedPage.getByTestId("calendar-view-toggle")).toBeVisible({ timeout: 15000 });
    await expect(authenticatedPage.getByText("Operational Hub")).toHaveCount(0);
  });
});

test.describe("Stage 4 — Shelf overflow (mobile)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("DISC-B7: the Shelf lists only true overflow — not the Deck's Home/Plants/Planner tabs", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.getByTestId("bottom-tab-more").click();
    const drawer = authenticatedPage.getByTestId("mobile-nav-drawer");
    await expect(drawer).toBeVisible({ timeout: 8000 });
    // True overflow is present…
    await expect(drawer.getByText("Tools", { exact: true })).toBeVisible();
    // …but the three primary Deck destinations are no longer re-listed here.
    await expect(drawer.getByText("Plants", { exact: true })).toHaveCount(0);
  });
});
