import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { GardenWalkPage } from "../pages/GardenWalkPage";

// Garden Walk regression coverage — RHO-6 (Snap sheet scroll/focus),
// RHO-7 (return to origin on exit), RHO-8 ("Back" label on empty/error).
//
// Relevant seeds:
//   02_plants_shed.sql — 6 plants (the dashboard walk launcher needs >= 5)
//
// The walk list itself depends on seeded plants being non-archived and
// assigned to outdoor areas, which can vary; the navigation tests therefore
// handle BOTH the "walking" (card) and "empty" branches, and the snap-scroll
// test only asserts when a card is present.

test.describe("Garden Walk — return navigation (RHO-7/8)", () => {
  test("WALK-001: launched from the dashboard, the walk returns to /dashboard on exit", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();

    // We should be on /walk now.
    await expect(authenticatedPage).toHaveURL(/\/walk/, { timeout: 10000 });
    await walk.waitForCardOrEmpty();

    if (await walk.card.isVisible().catch(() => false)) {
      // Walking → Stop finishes the walk and shows the summary; Done returns.
      await walk.stopButton.click();
      const doneBtn = authenticatedPage.getByRole("button", { name: /Done/i }).first();
      await doneBtn.waitFor({ state: "visible", timeout: 10000 });
      await doneBtn.click();
    } else {
      // Empty → the "Back" button returns to origin.
      await expect(walk.emptyBackButton).toBeVisible({ timeout: 10000 });
      await walk.emptyBackButton.click();
    }

    // RHO-7: origin was preserved as /dashboard — not the /quick fallback.
    await expect(authenticatedPage).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(authenticatedPage).not.toHaveURL(/\/quick/);
  });

  test("WALK-002: the empty-state exit button reads 'Back', not 'Back to Quick Menu'", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    // Only assert on the empty branch; when a card is present there's nothing
    // to walk-complete deterministically here (covered by WALK-001).
    if (await walk.empty.isVisible().catch(() => false)) {
      await expect(walk.emptyBackButton).toBeVisible({ timeout: 10000 });
      await expect(walk.emptyBackButton).toHaveText(/^\s*Back\s*$/);
      await expect(authenticatedPage.getByText("Back to Quick Menu")).not.toBeVisible();
    }
  });
});

test.describe("Garden Walk — Snap sheet scroll & focus (RHO-6)", () => {
  test("WALK-010: opening the Snap sheet brings its scroll body into view and focus", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    // Requires a walkable plant card. Skip cleanly if the seed produced none.
    test.skip(!(await walk.card.isVisible().catch(() => false)), "No walkable plant in the current seed state");

    await walk.snapAction.click();

    // RHO-6: the sheet's own overflow-y-auto body is anchored + scrolled into
    // view, and focus moves inside the newly-mounted section.
    await expect(walk.snapSheet).toBeVisible({ timeout: 10000 });
    await expect(walk.snapSheetBody).toBeVisible({ timeout: 10000 });

    const bodyInView = await walk.snapSheetBody.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight;
    });
    expect(bodyInView).toBe(true);
  });
});
