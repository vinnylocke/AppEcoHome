import type { Page, Locator } from "@playwright/test";

export class AuthPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly footerToggleButton: Locator;
  readonly errorAlert: Locator;
  readonly successStatus: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 2 });
    this.emailInput = page.getByPlaceholder("hello@rhozly.com");
    this.passwordInput = page.getByPlaceholder("••••••••");
    // The submit button sits inside a form; footer toggle is a plain type=button outside it.
    // In sign-in mode the submit button reads "Sign In"; in sign-up mode "Create Account".
    this.submitButton = page.getByRole("button", { name: /^(Sign In|Create Account)$/ }).first();
    this.footerToggleButton = page.getByRole("button", { name: /^(Create Account|Sign In)$/ }).last();
    this.errorAlert = page.getByRole("alert");
    this.successStatus = page.getByRole("status");
    this.signOutButton = page.getByRole("button", { name: "Sign Out" });
  }

  async goto() {
    await this.page.goto("/");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async toggleToSignUp() {
    // Footer link reads "Create Account" when in sign-in mode
    await this.page.getByRole("button", { name: "Create Account" }).last().click();
  }

  async toggleToSignIn() {
    // Footer link reads "Sign In" when in sign-up mode
    await this.page.getByRole("button", { name: "Sign In" }).last().click();
  }
}
