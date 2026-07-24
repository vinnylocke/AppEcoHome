import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Regression guards for the navigation audit fixes — params that destinations
// now consume (and strip), plus the retargeted dashboard tiles.

test.describe("Navigation deep-links", () => {
  // NAV-001 (Dashboard 'Completed' stat tile → calendar agenda) RETIRED
  // 2026-07-20 — the Garden Snapshot stat wall was deleted outright in the home
  // stats+locations redesign Stage 2; the dash-stat-* tiles no longer exist. The
  // calendar deep-link contract is still covered by NAV-004 + the CAL-* suite.

  test("NAV-002: /schedule redirects into the Calendar section's Routines tab (#12 IA reorg)", async ({ authenticatedPage }) => {
    // Routines left the standalone /schedule route for /calendar?tab=routines;
    // the old URL redirects. Any legacy ?category= is dropped by the redirect —
    // no live caller relies on it (the dashboard category chips were retired).
    await authenticatedPage.goto("/schedule?category=Pruning");
    await expect(authenticatedPage).toHaveURL(/\/calendar\?tab=routines/, { timeout: 10000 });
    await expect(authenticatedPage).not.toHaveURL(/category=/);
  });

  // NAV-003 (/gardener?section=quick-launcher → Account picker anchor) RETIRED
  // 2026-07-23 — the quick-launcher customiser was removed outright; the
  // ?section=quick-launcher deep link and its picker no longer exist.

  test("NAV-004: legacy /dashboard?view=calendar&date=YYYY-MM-DD lands on the Calendar section with the date consumed", async ({ authenticatedPage }) => {
    // #12 IA reorg — the legacy ?view=calendar link redirects to /calendar
    // (carrying ?date=), then TaskCalendar selects that day and strips the param.
    await authenticatedPage.goto("/dashboard?view=calendar&date=2026-06-19");
    await expect(authenticatedPage).toHaveURL(/\/calendar/, { timeout: 10000 });
    await expect(authenticatedPage).not.toHaveURL(/date=/);
  });
});
