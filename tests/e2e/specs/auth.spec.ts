import { test, expect } from "@playwright/test";
import { test as authTest } from "../fixtures/auth";
import { AuthPage } from "../pages/AuthPage";

// ---- Unauthenticated form tests (no real login needed) ----

test.describe("Auth — unauthenticated view", () => {
  test("visiting / when not logged in shows the sign-in form", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await expect(auth.heading).toContainText("Welcome Back");
    await expect(auth.emailInput).toBeVisible();
    await expect(auth.passwordInput).toBeVisible();
  });

  test("submitting an empty form shows field-level validation errors", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    // Disable native HTML5 validation so React's validateFields() can run and
    // render #field-error-email (the email input has required + type="email" which
    // otherwise intercepts the submit event before onSubmit fires).
    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (form) form.noValidate = true;
    });

    await auth.submitButton.click();

    const emailError = page.locator("#field-error-email");
    await expect(emailError).toBeVisible();
  });

  test("toggling to sign-up mode shows name fields and updated heading", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await auth.toggleToSignUp();

    await expect(auth.heading).toContainText("Create an Account");
    await expect(page.getByText("First Name")).toBeVisible();
    await expect(page.getByText("Last Name")).toBeVisible();
  });

  test("toggling back from sign-up to sign-in hides name fields", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await auth.toggleToSignUp();
    await auth.toggleToSignIn();

    await expect(auth.heading).toContainText("Welcome Back");
    await expect(page.getByText("First Name")).not.toBeVisible();
  });

  test("entering an invalid email format shows an email field error", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await auth.emailInput.fill("not-an-email");
    await auth.passwordInput.fill("somepassword");

    // Disable native HTML5 validation (type="email" blocks submit before onSubmit runs)
    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (form) form.noValidate = true;
    });

    await auth.submitButton.click();

    const emailError = page.locator("#field-error-email");
    await expect(emailError).toBeVisible();
  });

  test("entering wrong credentials shows an error alert", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await auth.login("nobody@invalid.example.com", "wrongpassword");

    // Supabase returns an error — the component renders it in role="alert"
    await expect(auth.errorAlert).toBeVisible({ timeout: 8000 });
  });

  test("Forgot Password link shows the password-reset form", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await page.getByRole("button", { name: "Forgot Password?" }).click();

    await expect(page.getByRole("button", { name: "Send Reset Link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to Sign In" })).toBeVisible();
  });
});

// ---- Authenticated sign-out test ----

authTest.describe("Auth — sign out", () => {
  authTest("clicking Sign Out returns the user to the sign-in form", async ({ authenticatedPage }) => {
    const auth = new AuthPage(authenticatedPage);

    await expect(auth.signOutButton).toBeVisible();
    await auth.signOutButton.click();

    // After sign-out the app should show the auth form again
    await expect(auth.heading).toContainText("Welcome Back", { timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-010 — Root redirect for authenticated users
// ─────────────────────────────────────────────────────────────────────────────

authTest.describe("Auth — root redirect (AUTH-010)", () => {
  authTest("AUTH-010: Authenticated user visiting / is redirected to /dashboard", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/");

    await expect(authenticatedPage).toHaveURL("/dashboard", { timeout: 10000 });
  });
});
