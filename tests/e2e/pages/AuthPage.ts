import type { Page, Locator } from "@playwright/test";

export class AuthPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly submitButton: Locator;
  readonly footerToggleButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorAlert: Locator;
  readonly successStatus: Locator;
  /** Profile dropdown trigger — the "you're logged in" indicator that
   *  replaced the top-level Sign Out button. Always visible in the
   *  authenticated layout. */
  readonly profileTrigger: Locator;
  /** Sign Out menu item — visible only after the dropdown is opened. */
  readonly signOutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 2 });
    this.emailInput = page.getByPlaceholder("hello@rhozly.com");
    this.passwordInput = page.getByPlaceholder("••••••••");
    this.firstNameInput = page.getByTestId("auth-first-name");
    this.lastNameInput = page.getByTestId("auth-last-name");
    // The submit button sits inside a form; footer toggle is a plain type=button outside it.
    // In sign-in mode the submit button reads "Sign In"; in sign-up mode "Create Account".
    this.submitButton = page.getByRole("button", { name: /^(Sign In|Create Account)$/ }).first();
    this.footerToggleButton = page.getByRole("button", { name: /^(Create Account|Sign In)$/ }).last();
    this.forgotPasswordLink = page.getByTestId("auth-forgot-password");
    this.errorAlert = page.getByRole("alert");
    this.successStatus = page.getByRole("status");
    this.profileTrigger = page.getByTestId("user-profile-trigger");
    this.signOutButton = page.getByTestId("user-profile-sign-out");
  }

  /** Open the profile dropdown and click Sign Out. The button moved into
   *  UserProfileDropdown after the Wave 1D nav cleanup. */
  async signOut() {
    await this.profileTrigger.click();
    await this.signOutButton.click();
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

  /** Fill all sign-up fields. Caller must be in sign-up mode. */
  async fillSignUp(args: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    await this.firstNameInput.fill(args.firstName);
    await this.lastNameInput.fill(args.lastName);
    await this.emailInput.fill(args.email);
    await this.passwordInput.fill(args.password);
  }

  /** Open the forgot-password sub-flow. Caller must be in sign-in mode. */
  async openForgotPassword() {
    await this.forgotPasswordLink.click();
  }
}
