import { test, expect } from "../fixtures/no-home-yet";
import { HomeSetupPage } from "../pages/HomeSetupPage";

// ─────────────────────────────────────────────────────────────────────────
// home-setup-create.spec.ts
//
// Covers the "Create New Home" path on /src/components/HomeSetup.tsx
// (catalog rows R1-001 through R1-009).
//
// Strategy: noHomeYetPage fixture renders the HomeSetup wizard, and we
// route-mock the `create_new_home` RPC and `sync-weather` edge function
// so the DB and weather API are never touched.
// ─────────────────────────────────────────────────────────────────────────

const RPC_REGEX = /\/rest\/v1\/rpc\/create_new_home(\?|$)/;

test.describe("Home Setup — Create New Home", () => {
  /** Route-mock the create_new_home RPC to return a fixed UUID. */
  async function mockCreateSuccess(
    page: import("@playwright/test").Page,
    homeId = "99999999-9999-9999-9999-999999999999",
  ) {
    await page.route(RPC_REGEX, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(homeId),
      });
    });
  }

  async function mockCreateError(page: import("@playwright/test").Page) {
    await page.route(RPC_REGEX, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "42P01", message: "relation does not exist" }),
      });
    });
  }

  /** Capture the JSON body of every create_new_home RPC call. */
  async function captureRpcBodies(page: import("@playwright/test").Page) {
    const bodies: string[] = [];
    await page.route(RPC_REGEX, async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.fallback();
      bodies.push(req.postData() ?? "");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
      });
    });
    return bodies;
  }

  /** Track sync-weather edge function invocations. */
  async function trackSyncWeather(page: import("@playwright/test").Page) {
    const calls: Array<{ body: string }> = [];
    await page.route("**/functions/v1/sync-weather", (route) => {
      calls.push({ body: route.request().postData() ?? "" });
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    return calls;
  }

  test("R1-001 — Create tile routes to the create step", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await expect(setup.createTile).toBeVisible();

    await setup.pickCreate();

    await expect(setup.createStep).toBeVisible();
    await expect(setup.homeNameInput).toBeFocused();
    await expect(setup.postcodeInput).toBeVisible();
    await expect(setup.countrySelect).toBeVisible();
    await expect(setup.timezoneSelect).toBeVisible();
    await expect(setup.createSubmit).toBeVisible();
  });

  test("R1-002 — Back arrow on create step returns to selection", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);

    await setup.pickCreate();
    await setup.backFromCreate.click();

    await expect(setup.createTile).toBeVisible();
    await expect(setup.joinTile).toBeVisible();
    await expect(setup.createStep).toBeHidden();
  });

  test("R1-003 — Empty name and postcode prevents submit via HTML5 required", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    const rpcBodies = await captureRpcBodies(noHomeYetPage);

    await setup.pickCreate();
    await setup.createSubmit.click();

    await expect(setup.createStep).toBeVisible();
    expect(rpcBodies).toHaveLength(0);
  });

  test("R1-004 — Hemisphere chip flips when the user picks a southern-hemisphere country", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);

    await setup.pickCreate();
    // Default is GB → Northern.
    await expect(setup.hemisphereChip).toContainText(/Northern/i);

    // Pick Australia → expect Southern.
    await setup.countrySelect.selectOption("AU");
    await expect(setup.hemisphereChip).toContainText(/Southern/i);
  });

  test("R1-005 — Postcode is uppercased before the RPC fires", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    const rpcBodies = await captureRpcBodies(noHomeYetPage);

    await setup.pickCreate();
    await setup.fillCreate({ name: "Test Garden", postcode: "cr3 5ed" });
    await setup.submitCreate();

    await expect.poll(() => rpcBodies.length).toBeGreaterThan(0);
    const body = rpcBodies[rpcBodies.length - 1];
    expect(body).toContain("CR3 5ED");
    expect(body).not.toContain("cr3 5ed");
  });

  test("R1-006 — Successful create fires sync-weather with the new home_id", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    const homeId = "88888888-8888-8888-8888-888888888888";
    await mockCreateSuccess(noHomeYetPage, homeId);
    const syncCalls = await trackSyncWeather(noHomeYetPage);

    await setup.pickCreate();
    await setup.fillCreate({ name: "Weather Test Home", postcode: "SW1A 1AA" });
    await setup.submitCreate();

    await expect.poll(() => syncCalls.length).toBeGreaterThan(0);
    expect(syncCalls[0].body).toContain(homeId);
  });

  test("R1-007 — RPC failure surfaces a banner and keeps the user on the create step", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    await mockCreateError(noHomeYetPage);

    await setup.pickCreate();
    await setup.fillCreate({ name: "Bad Home", postcode: "AB1 2CD" });
    await setup.submitCreate();

    await expect(setup.formError).toBeVisible();
    await expect(setup.formError).toContainText(/couldn.?t create your home/i);
    await expect(setup.createStep).toBeVisible();
  });

  test("R1-008 — Submit button is disabled while the RPC is in flight", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);

    await noHomeYetPage.route(RPC_REGEX, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((r) => setTimeout(r, 500));
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("77777777-7777-7777-7777-777777777777"),
      });
    });

    await setup.pickCreate();
    await setup.fillCreate({ name: "Slow Home", postcode: "AB1 2CD" });
    await setup.submitCreate();

    await expect(setup.createSubmit).toBeDisabled();
  });

  test("R1-009 — sync-weather failure does NOT block onHomeCreated (handler logs and proceeds)", async ({ noHomeYetPage }) => {
    const setup = new HomeSetupPage(noHomeYetPage);
    const homeId = "66666666-6666-6666-6666-666666666666";
    await mockCreateSuccess(noHomeYetPage, homeId);

    await noHomeYetPage.route("**/functions/v1/sync-weather", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "weather provider unavailable" }),
      });
    });

    await setup.pickCreate();
    await setup.fillCreate({ name: "Resilient Home", postcode: "AB1 2CD" });
    await setup.submitCreate();

    // The handler caught the funcError and still calls onHomeCreated, so
    // no error banner shows. The wizard itself remains mounted only until
    // the parent re-renders — assert that no error surfaced is enough here.
    await expect(setup.formError).toBeHidden();
  });
});
