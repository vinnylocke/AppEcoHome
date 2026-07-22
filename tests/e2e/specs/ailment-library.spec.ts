import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// ─────────────────────────────────────────────────────────────────────────
// ailment-library.spec.ts — Hub v3 Stage F
//
// The /ailment-library browse page DIED: the Ailments tab's search is the
// field guide now, and the shareable detail contract is ?detail=<id> on
// /shed?tab=watchlist. URLs never die — this spec pins the redirect that
// keeps every old bookmark and share link working.
// (The old page's browse/detail coverage lives on in watchlist.spec.ts
// WL-E1/E1b/E2 and the takeover specs; library fixtures stay seeded as
// 16_ailment_library.sql — Tomato Hornworm 900001 / Late Blight 900002 /
// Japanese Knotweed 900003.)
// ─────────────────────────────────────────────────────────────────────────

test.describe("Ailment Library — Stage F redirects", () => {
  test("AL-R1: /ailment-library redirects to the Ailments tab", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/ailment-library");
    await expect(authenticatedPage).toHaveURL(/\/shed\?tab=watchlist/, { timeout: 10000 });
    // The watchlist surface actually renders (not a blank shell).
    await expect(
      authenticatedPage.getByRole("heading", { name: /^Watchlist/ }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("AL-R2: /ailment-library?ailment=<id> carries over to ?detail= and opens the field guide", async ({
    authenticatedPage,
  }) => {
    // 900001 = seeded library "Tomato Hornworm".
    await authenticatedPage.goto("/ailment-library?ailment=900001");
    await expect(authenticatedPage).toHaveURL(/\/shed\?tab=watchlist&detail=900001/, {
      timeout: 10000,
    });
    await expect(
      authenticatedPage.getByTestId("ailment-detail-modal"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.getByRole("heading", { name: "Tomato Hornworm" }),
    ).toBeVisible({ timeout: 5000 });
  });
});
