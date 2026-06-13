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

  // ── Sign-up form validation ────────────────────────────────────────────

  test("AUTH-020 — sign-up requires First Name (field-level error)", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.toggleToSignUp();

    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (form) form.noValidate = true;
    });

    // Skip first name; fill the rest so only firstName is invalid.
    await auth.lastNameInput.fill("Doe");
    await auth.emailInput.fill("new@example.com");
    await auth.passwordInput.fill("longenoughpassword");
    await auth.submitButton.click();

    await expect(page.locator("#field-error-firstName")).toBeVisible();
  });

  test("AUTH-021 — sign-up requires Last Name (field-level error)", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.toggleToSignUp();

    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (form) form.noValidate = true;
    });

    await auth.firstNameInput.fill("Jane");
    await auth.emailInput.fill("new@example.com");
    await auth.passwordInput.fill("longenoughpassword");
    await auth.submitButton.click();

    await expect(page.locator("#field-error-lastName")).toBeVisible();
  });

  test("AUTH-022 — sign-up rejects passwords under 8 chars (field-level error)", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.toggleToSignUp();

    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (form) form.noValidate = true;
    });

    await auth.fillSignUp({
      firstName: "Jane",
      lastName: "Doe",
      email: "new@example.com",
      password: "short",
    });
    await auth.submitButton.click();

    const passwordError = page.locator("#field-error-password");
    await expect(passwordError).toBeVisible();
    await expect(passwordError).toContainText(/at least 8/i);
  });

  test("AUTH-023 — sign-up with valid data calls supabase.auth.signUp and shows the email-confirmation banner", async ({ page }) => {
    const auth = new AuthPage(page);

    // Intercept the Supabase signup endpoint so no real account is created.
    const signUpHits: string[] = [];
    await page.route("**/auth/v1/signup**", (route) => {
      signUpHits.push(route.request().postData() ?? "");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "00000000-0000-0000-0000-000000000099", email: "new@example.com" },
          session: null,
        }),
      });
    });

    await auth.goto();
    await auth.toggleToSignUp();
    await auth.fillSignUp({
      firstName: "Jane",
      lastName: "Doe",
      email: "new@example.com",
      password: "ValidLongPassword1",
    });
    await auth.submitButton.click();

    await expect.poll(() => signUpHits.length).toBeGreaterThan(0);
    expect(signUpHits[0]).toContain("Jane");
    expect(signUpHits[0]).toContain("Doe");
    await expect(auth.successStatus).toContainText(/Welcome to Rhozly/i, { timeout: 8000 });
  });

  // ── Forgot password ────────────────────────────────────────────────────

  test("AUTH-030 — Forgot Password without an email surfaces an inline field error", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.openForgotPassword();

    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await expect(page.locator("#field-error-email")).toBeVisible();
  });

  test("AUTH-031 — Forgot Password with a valid email fires resetPasswordForEmail and shows the confirmation panel", async ({ page }) => {
    const auth = new AuthPage(page);

    const recoverHits: string[] = [];
    await page.route("**/auth/v1/recover**", (route) => {
      recoverHits.push(route.request().postData() ?? "");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await auth.goto();
    await auth.openForgotPassword();
    await auth.emailInput.fill("recover@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await expect.poll(() => recoverHits.length).toBeGreaterThan(0);
    await expect(page.getByText(/Check Your Email|Reset Link Sent|sent.*reset/i).first()).toBeVisible({ timeout: 8000 });
  });

  // ── OAuth ──────────────────────────────────────────────────────────────

  test("AUTH-040 — OAuth buttons for Google and Apple are present on the sign-in form", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();

    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Apple/i })).toBeVisible();
  });
});

// ---- Authenticated sign-out test ----

authTest.describe("Auth — sign out", () => {
  authTest("clicking Sign Out returns the user to the sign-in form", async ({ authenticatedPage }) => {
    const auth = new AuthPage(authenticatedPage);

    // Sign Out lives inside the profile dropdown — open it first.
    await expect(auth.profileTrigger).toBeVisible();

    // The auth fixture intercepts `/auth/v1/user` to return the seeded user
    // unconditionally — that lets the app boot without flake under parallel
    // load. After sign-out we WANT supabase-js's session check to actually
    // return unauthenticated, so release the mock before clicking.
    await authenticatedPage.unroute("**/auth/v1/user");

    await auth.signOut();

    // After sign-out the app should show the auth form again. Use a
    // role+name selector so we ignore the dashboard's many other h2s.
    await expect(
      authenticatedPage.getByRole("heading", { name: /Welcome Back/i }),
    ).toBeVisible({ timeout: 8000 });
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

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-050 — Session persistence across page reload
// ─────────────────────────────────────────────────────────────────────────────

authTest.describe("Auth — session persistence (AUTH-050)", () => {
  authTest("AUTH-050: Reloading an authenticated page keeps the user signed in", async ({ authenticatedPage }) => {
    const auth = new AuthPage(authenticatedPage);
    await expect(auth.profileTrigger).toBeVisible();

    await authenticatedPage.reload();

    // Still signed in after reload — profile dropdown trigger is back in
    // the nav, and the auth-screen "Welcome Back" heading is NOT rendered.
    await expect(auth.profileTrigger).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.getByRole("heading", { name: /Welcome Back/i }),
    ).toHaveCount(0);
  });
});
