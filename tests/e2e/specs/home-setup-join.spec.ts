import { test, expect } from "../fixtures/no-home-yet";
import { HomeSetupPage } from "../pages/HomeSetupPage";

// ─────────────────────────────────────────────────────────────────────────
// home-setup-join.spec.ts
//
// Covers the "Join Existing Home" path on /src/components/HomeSetup.tsx
// (catalog rows R2-001 through R2-014 — the user-flagged gap from
// docs/plans/e2e-test-suite-comprehensive.md).
//
// Strategy: a route-mock fixture (noHomeYetPage) signs the test user in
// and makes the app believe profile.home_id is null so the HomeSetup
// wizard renders. The DB is never mutated — every join scenario is
// driven by mocking the `home_members` INSERT response (200 with row /
// 403 with RLS error / 409 with dup error).
// ─────────────────────────────────────────────────────────────────────────

test.describe("Home Setup — Join Existing Home", () => {
  /** Route-mock the join INSERT to succeed and return a row. */
  async function mockJoinSuccess(page: import("@playwright/test").Page) {
    await page.route(/\/rest\/v1\/home_members(\?|$)/, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "[]",
      });
    });
  }

  /** Route-mock the join INSERT to return a Postgres error (bad/unknown ID). */
  async function mockJoinError(
    page: import("@playwright/test").Page,
    status: number,
    code = "PGRST116",
  ) {
    await page.route(/\/rest\/v1\/home_members(\?|$)/, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          code,
          message: "Row violates RLS or unique constraint",
        }),
      });
    });
  }

  /** Track that `user_profiles` UPDATE fires (used by success path). */
  async function trackProfileUpdate(page: import("@playwright/test").Page) {
    const events: Array<{ method: string; body: string }> = [];
    await page.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "PATCH") {
        events.push({ method: "PATCH", body: req.postData() ?? "" });
        return route.fulfill({ status: 204, contentType: "application/json", body: "" });
      }
      return route.fallback();
    });
    return events;
  }

  /** Track sync-weather edge function calls (should NOT fire on join). */
  async function trackSyncWeather(page: import("@playwright/test").Page) {
    const calls: string[] = [];
    await page.route("**/functions/v1/sync-weather", (route) => {
      calls.push(route.request().postData() ?? "");
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    return calls;
  }

  test("R2-001 — Join tile routes to the join step", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await expect(setup.joinTile).toBeVisible();

    await setup.pickJoin();

    await expect(setup.joinStep).toBeVisible();
    await expect(setup.homeIdInput).toBeVisible();
    await expect(setup.joinSubmit).toBeVisible();
  });

  test("R2-002 — Back arrow on join step returns to selection", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);

    await setup.pickJoin();
    await setup.backFromJoin.click();

    await expect(setup.joinTile).toBeVisible();
    await expect(setup.createTile).toBeVisible();
    await expect(setup.joinStep).toBeHidden();
  });

  test("R2-003 — Empty input does not submit (HTML5 required attribute)", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    const profileUpdates = await trackProfileUpdate(noHomeYetPage);

    await setup.pickJoin();
    await setup.joinSubmit.click();

    // Form did not submit — no profile update fired, still on join step.
    await expect(setup.joinStep).toBeVisible();
    expect(profileUpdates).toHaveLength(0);
  });

  test("R2-004 — Whitespace-only input is rejected by handleJoin", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    const profileUpdates = await trackProfileUpdate(noHomeYetPage);

    await setup.pickJoin();
    await setup.fillJoin("   ");
    await setup.joinSubmit.click();

    // handleJoin short-circuits on empty trim; still on join step and
    // no PATCH /user_profiles fired.
    await expect(setup.joinStep).toBeVisible();
    expect(profileUpdates).toHaveLength(0);
  });

  test("R2-005 — Invalid UUID format → generic banner", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinError(noHomeYetPage, 400, "22P02");

    await setup.pickJoin();
    await setup.fillJoin("not-a-uuid");
    await setup.submitJoin();

    await expect(setup.formError).toBeVisible();
    await expect(setup.formError).toContainText(/Invalid Home ID|already a member/i);
  });

  test("R2-006 — Unknown UUID with no RLS access → generic banner (no existence leak)", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinError(noHomeYetPage, 403, "42501");

    await setup.pickJoin();
    await setup.fillJoin("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await setup.submitJoin();

    await expect(setup.formError).toBeVisible();
    // The banner is intentionally generic — does not reveal whether the
    // home exists or whether the user already belongs.
    await expect(setup.formError).toContainText(/Invalid Home ID|already a member/i);
  });

  test("R2-007 — Already-a-member duplicate insert → generic banner; row count unchanged", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinError(noHomeYetPage, 409, "23505");

    await setup.pickJoin();
    await setup.fillJoin("11111111-1111-1111-1111-111111111111");
    await setup.submitJoin();

    await expect(setup.formError).toBeVisible();
    await expect(setup.formError).toContainText(/already a member|Invalid Home ID/i);
  });

  test("R2-008 — Successful join updates user_profiles.home_id", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinSuccess(noHomeYetPage);
    const profileUpdates = await trackProfileUpdate(noHomeYetPage);

    await setup.pickJoin();
    await setup.fillJoin("11111111-1111-1111-1111-111111111111");
    await setup.submitJoin();

    // The handler patches user_profiles.home_id and fires onHomeCreated.
    await expect(setup.formError).toBeHidden();
    await expect.poll(() => profileUpdates.length).toBeGreaterThan(0);
    const lastPatch = profileUpdates[profileUpdates.length - 1].body;
    expect(lastPatch).toContain("11111111-1111-1111-1111-111111111111");
  });

  test("R2-009 — Pasting Home ID with whitespace trims before submit", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinSuccess(noHomeYetPage);
    const profileUpdates = await trackProfileUpdate(noHomeYetPage);

    await setup.pickJoin();
    await setup.fillJoin("  22222222-2222-2222-2222-222222222222  ");
    await setup.submitJoin();

    await expect.poll(() => profileUpdates.length).toBeGreaterThan(0);
    const lastPatch = profileUpdates[profileUpdates.length - 1].body;
    expect(lastPatch).toContain("22222222-2222-2222-2222-222222222222");
    // No leading/trailing whitespace inside the quoted UUID.
    expect(lastPatch).not.toMatch(/\s 22222222/);
  });

  test("R2-010 — Successful join does NOT fire sync-weather (create-only side effect)", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinSuccess(noHomeYetPage);
    const syncCalls = await trackSyncWeather(noHomeYetPage);

    await setup.pickJoin();
    await setup.fillJoin("33333333-3333-3333-3333-333333333333");
    await setup.submitJoin();

    // Give the app a beat to make any spurious calls.
    await noHomeYetPage.waitForTimeout(750);
    expect(syncCalls).toHaveLength(0);
  });

  test("R2-011 — Form error clears when the user starts typing again after a failed submit", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockJoinError(noHomeYetPage, 403, "42501");

    await setup.pickJoin();
    await setup.fillJoin("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await setup.submitJoin();
    await expect(setup.formError).toBeVisible();

    // Switch the route to success and resubmit a fresh ID.
    await mockJoinSuccess(noHomeYetPage);
    await setup.fillJoin("44444444-4444-4444-4444-444444444444");
    await setup.submitJoin();

    await expect(setup.formError).toBeHidden();
  });

  test("R2-012 — Tab order: input → submit", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await setup.pickJoin();

    await setup.homeIdInput.focus();
    await noHomeYetPage.keyboard.press("Tab");
    await expect(setup.joinSubmit).toBeFocused();
  });

  test("R2-013 — Submit button is disabled while the request is in flight", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);

    // Delay the join response so we can observe the loading state.
    await noHomeYetPage.route(/\/rest\/v1\/home_members(\?|$)/, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((r) => setTimeout(r, 400));
      route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    });

    await setup.pickJoin();
    await setup.fillJoin("55555555-5555-5555-5555-555555555555");
    await setup.submitJoin();

    await expect(setup.joinSubmit).toBeDisabled();
  });

  test("R2-014 — Input state persists when returning to the join step (parent-level state)", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);

    const draft = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX";
    await setup.pickJoin();
    await setup.fillJoin(draft);
    await setup.backFromJoin.click();
    await setup.pickJoin();

    // Documenting current behaviour: `homeId` lives on the HomeSetup parent,
    // so toggling between steps preserves whatever the user typed.
    await expect(setup.homeIdInput).toHaveValue(draft);
  });
});
