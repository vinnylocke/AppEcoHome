import type { Page, Locator } from "@playwright/test";

/**
 * Page object for /src/components/HomeSetup.tsx.
 *
 * Mirrors the three-step wizard:
 *   1. selection  — Create New Home tile vs Join Existing Home tile
 *   2. create     — name / postcode / country / timezone + Create Home
 *   3. join       — Home ID input + Join Home
 *
 * Designed to be driven from tests that intercept the underlying Supabase
 * REST and Edge Function calls (see fixtures/home-setup.ts) — the page
 * object only knows about the DOM.
 */
export class HomeSetupPage {
  readonly page: Page;

  // Selection step
  readonly createTile: Locator;
  readonly joinTile: Locator;
  readonly cancelX: Locator;

  // Create step
  readonly createStep: Locator;
  readonly backFromCreate: Locator;
  readonly homeNameInput: Locator;
  readonly postcodeInput: Locator;
  readonly countrySelect: Locator;
  readonly timezoneSelect: Locator;
  readonly hemisphereChip: Locator;
  readonly createSubmit: Locator;

  // Join step
  readonly joinStep: Locator;
  readonly backFromJoin: Locator;
  readonly homeIdInput: Locator;
  readonly joinSubmit: Locator;

  // Shared
  readonly formError: Locator;

  constructor(page: Page) {
    this.page = page;

    this.createTile = page.getByTestId("home-setup-create-tile");
    this.joinTile = page.getByTestId("home-setup-join-tile");
    this.cancelX = page.getByTestId("home-setup-cancel-x");

    this.createStep = page.getByTestId("home-setup-create-step");
    this.backFromCreate = page.getByTestId("home-setup-back-from-create");
    this.homeNameInput = page.locator("#homeName");
    this.postcodeInput = page.getByPlaceholder("e.g. CR3 5ED");
    this.countrySelect = page.getByTestId("home-setup-country");
    this.timezoneSelect = page.getByTestId("home-setup-timezone");
    this.hemisphereChip = page.getByText(/Northern|Southern/).first();
    this.createSubmit = page.getByTestId("home-setup-create-submit");

    this.joinStep = page.getByTestId("home-setup-join-step");
    this.backFromJoin = page.getByTestId("home-setup-back-from-join");
    this.homeIdInput = page.locator("#homeId");
    this.joinSubmit = page.getByTestId("home-setup-join-submit");

    this.formError = page.getByTestId("home-setup-form-error");
  }

  async goto() {
    await this.page.goto("/");
  }

  async pickCreate() {
    await this.createTile.click();
    await this.createStep.waitFor();
  }

  async pickJoin() {
    await this.joinTile.click();
    await this.joinStep.waitFor();
  }

  async fillCreate(args: {
    name?: string;
    postcode?: string;
  }) {
    if (args.name !== undefined) {
      await this.homeNameInput.fill(args.name);
    }
    if (args.postcode !== undefined) {
      await this.postcodeInput.fill(args.postcode);
    }
  }

  async submitCreate() {
    await this.createSubmit.click();
  }

  async fillJoin(homeId: string) {
    await this.homeIdInput.fill(homeId);
  }

  async submitJoin() {
    await this.joinSubmit.click();
  }
}
