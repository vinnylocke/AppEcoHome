# 2. Authentication

**Spec file:** `tests/e2e/specs/auth.spec.ts`
**Page Object:** `tests/e2e/pages/AuthPage.ts`
**Seed dependencies:** `00_bootstrap.sql`
**App-reference:** _Not currently in app-reference (auth pre-dates the doc system)._

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| AUTH-001 | ✅ | Navigate to `/` unauthenticated → sign-in heading + email/password inputs visible | — | ✅ Passing |
| AUTH-002 | ✅ | Sign in — valid credentials → redirected to `/dashboard` | — | ✅ Passing |
| AUTH-003 | ❌ | Sign in — wrong password → error message visible, no redirect | — | ✅ Passing |
| AUTH-004 | ❌ | Submit form with blank email → email validation error visible | — | ✅ Passing |
| AUTH-005 | ❌ | Enter `notanemail` → format error, form not submitted | — | ✅ Passing |
| AUTH-006 | ❌ | Submit with blank password → error visible | — | ✅ Passing |
| AUTH-007 | ✅ | Authenticated → click Sign Out → redirected to auth page | — | ✅ Passing |
| AUTH-008 | ✅ | Reload page after sign-in → still authenticated, dashboard shown | — | ✅ Passing |
| AUTH-009 | ✅ | Navigate to `/dashboard` without session → redirected to `/` | — | ✅ Passing |
| AUTH-010 | ✅ | Navigate to `/` while authenticated → URL becomes `/dashboard` | — | ✅ Passing |
| AUTH-020 | ❌ | Sign-up — First Name required → `#field-error-firstName` visible | — | ✅ Passing |
| AUTH-021 | ❌ | Sign-up — Last Name required → `#field-error-lastName` visible | — | ✅ Passing |
| AUTH-022 | ❌ | Sign-up — password < 8 chars rejected → "at least 8 characters" error | — | ✅ Passing |
| AUTH-023 | ✅ | Sign-up — valid data fires signup + success banner | `auth/v1/signup` | ✅ Passing |
| AUTH-030 | ❌ | Forgot password — empty email blocked | — | ✅ Passing |
| AUTH-031 | ✅ | Forgot password — valid email confirmation panel | `auth/v1/recover` | ✅ Passing |
| AUTH-040 | ✅ | OAuth Google + Apple buttons visible on sign-in form | — | ✅ Passing |
| AUTH-050 | ✅ | Session persists across reload — Sign Out still visible | — | ✅ Passing |
