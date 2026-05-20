# Auth Screen

> The first surface every user sees if they're not logged in — sign in, sign up, or password reset. Also the entry point for Google and Apple OAuth.

**Route:** Renders when there's no Supabase session (handled at App.tsx top level — there's no dedicated path).
**Source file:** `src/components/Auth.tsx`

---

## Quick Summary

A single full-screen form with two modes (Sign In / Sign Up) and a third forgot-password mode. Email + password are the primary path; Google and Apple OAuth buttons sit above. Native (Capacitor) and web flows differ slightly — native uses an in-app Browser plugin to handle OAuth callbacks via the `com.rhozly.app://` scheme.

---

## Role 1 — Technical Reference

### Component graph

```
Auth (Auth.tsx)
├── Decorative floating-plant backdrops (unsplash images at 5% opacity)
├── Card
│   ├── Logo + tagline ("Plant care that fits your week")
│   ├── Mode tabs: Sign In / Sign Up
│   ├── (Sign Up only) First Name input
│   ├── (Sign Up only) Last Name input
│   ├── Email input
│   ├── Password input
│   ├── (Sign In) Forgot password link
│   ├── Submit button (Sign In / Sign Up)
│   ├── OAuth row
│   │   ├── Google button
│   │   └── Apple button
│   ├── Benefit chips (3 quick callouts about what the app does)
│   └── Footer
│       ├── Privacy Policy link → PrivacyPolicyModal
│       └── Cookie Policy link → CookiePolicyModal
├── PrivacyPolicyModal (when opened)
└── CookiePolicyModal (when opened)
```

### Local state

| State | Type | Purpose |
|-------|------|---------|
| `loading` | `boolean` | Submit in flight |
| `email`, `password`, `firstName`, `lastName` | `string` | Form fields |
| `isSignUp` | `boolean` | Mode toggle |
| `error` | `string \| null` | Top-of-card error banner |
| `fieldErrors` | `Record<string, string>` | Per-field inline errors |
| `successMessage` | `string \| null` | After sign-up, shows the confirmation-email instruction |
| `isForgotPassword` | `boolean` | Switches form to reset-password mode |
| `forgotPasswordSent` | `boolean` | Post-submit confirmation |
| `showPrivacy`, `showCookies` | `boolean` | Modal toggles |

### Auth methods invoked

| Method | When | Inputs | Outputs |
|--------|------|--------|---------|
| `supabase.auth.signInWithPassword({ email, password })` | Sign In submit | email + password | Session in `auth.users` |
| `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name } } })` | Sign Up submit | as above + name metadata | Creates `auth.users` row + sends confirmation email |
| `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | Forgot Password submit | email | Email with reset link |
| `supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect } })` | Google / Apple click | provider | OAuth URL (native uses `Browser.open(url)`) |

### Native (Capacitor) vs Web differences

- `Capacitor.isNativePlatform()` decides the redirect URL.
  - Web: `${window.location.origin}/`
  - Native: `com.rhozly.app://${provider}-callback`
- Native uses `Browser.open({ url: data.url })` to open the OAuth provider in an in-app browser instead of a full redirect.

### Data flow — write paths

#### Sign Up

1. `supabase.auth.signUp(...)` creates a user in `auth.users`.
2. A DB trigger creates a matching `user_profiles` row (via Supabase Auth Hooks). `first_name` and `last_name` are stored in `auth.users.raw_user_meta_data` and copied / read from there.
3. Confirmation email goes out — Resend or Supabase SMTP depending on config.
4. Once the user clicks the confirmation link, they land back on the app with an active session — App.tsx's session listener picks this up and shows HomeSetup if `profile.home_id` is null.

#### Sign In

1. `supabase.auth.signInWithPassword(...)` exchanges credentials for a session.
2. Session is stored in localStorage (Supabase JS default).
3. App.tsx's session listener triggers — user lands on `/dashboard`.

#### Reset Password

1. `supabase.auth.resetPasswordForEmail(...)` queues a reset email.
2. User clicks the link → lands on `/reset-password` route (not yet documented separately; renders a small password-change form).

### Field validation

`validateFields()`:
- First/last name required for Sign Up.
- Email regex check `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Password min 8 chars on Sign Up only (sign in doesn't validate length to allow legacy short passwords).

### Edge functions invoked

None directly. OAuth callback is handled by Supabase's hosted endpoint.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

None — every user sees the same Auth screen pre-login.

### Beta gating

None.

### Permissions / role-based UI

None.

### Error states

| State | Result |
|-------|--------|
| Invalid email format | Inline field error + focus to email input |
| Password too short on sign-up | Inline field error + focus |
| Wrong credentials | Top-of-card error banner; focus shifts to email |
| Email already registered | Same — Supabase returns "User already registered" |
| OAuth provider error | Top-of-card error banner |
| Network failure | Top-of-card error banner with generic message |

### Performance notes

- Lazy modal loading: Privacy + Cookie modals only render when `showPrivacy` / `showCookies` are true.
- No data fetching on this surface — pure form.
- Framer Motion is used for subtle entry animations.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the front door. New users land here to sign up; returning users sign in. There's no "skip account" or guest mode — Rhozly needs an account to know whose garden it is. The screen tries to make the first impression friendly: tagline, soft floral imagery, benefit chips that explain in one glance what the app does.

### Every flow on this screen

#### 1. Sign In

- **What you do:** type email + password → tap "Sign In".
- **What happens:** instant session if credentials match. Lands you on the dashboard.
- **If it fails:** error banner explains why (wrong password, network, etc.).

#### 2. Sign Up

- Switch the tab → fill first name, last name, email, password → tap "Create Account".
- After submit you see "🌱 Welcome to Rhozly! Check your email for a confirmation link — once you click it you'll land on the home setup screen and we'll get your garden going."
- The email goes out within seconds. Once clicked, you land back in the app with the session active and HomeSetup ready.

#### 3. Google / Apple Sign In

- One-tap auth via your provider. On native (the iOS / Android app), opens an in-app browser; on web, redirects.
- New accounts created via OAuth get a `user_profiles` row but no `first_name` / `last_name` set — they'll be prompted to fill these during Home Setup.

#### 4. Forgot Password

- Tap "Forgot password?" → email field stays + a Submit button replaces the form.
- You'll get a reset email; click the link to set a new password.

#### 5. Read Privacy / Cookie policy

- Footer links open the modal versions (no separate route). Self-contained legal copy.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Tagline | "Plant care that fits your week" — sets expectation |
| Mode tabs | Sign In vs Sign Up — toggle determines required fields |
| Benefit chips | Three callouts: "Recurring task reminders", "AI plant doctor", "Weather-aware advice" |
| Submit button label | "Sign In" or "Create Account" depending on mode |
| Privacy / Cookie links | Legal compliance |

### Tier-by-tier experience

None — this screen is pre-account, no tier yet.

### New user vs returning user

- **Brand new user**: switches to Sign Up tab, fills out form, gets confirmation email, returns to verify.
- **Returning user**: lands on the Sign In tab by default. If they have an active session from a previous visit, App.tsx never shows this screen — they skip straight to the Dashboard.

### Beta user experience

No difference — beta status is assigned post-signup by an admin via `user_profiles.is_beta`.

### Common mistakes / pitfalls

- **"I can't sign in even with the right password."** Check if email is confirmed. Some users miss the confirmation email step. Resend via the forgot-password flow.
- **OAuth on native opens browser, not in-app.** That's intentional — the in-app `Browser.open(...)` is by design, otherwise the OAuth provider blocks the request.
- **"Why do you need my name?"** Used for the personalised greeting on the Daily Brief Card and for any shared home invitations later.

### Recommended workflows

- **First-ever account:** Sign Up → confirm email → HomeSetup → done.
- **Lost password:** Sign In tab → Forgot Password → email → set new password → Sign In.

### What to do if something looks wrong

- **No confirmation email:** check spam. Resend via the forgot-password flow (which works the same way).
- **OAuth redirect fails:** native users should ensure the app's URL scheme is registered. Otherwise re-open and try web.
- **"Email already registered":** sign in instead, or use the Forgot Password flow.

---

## Related reference files

- [Home Setup](./03-home-setup.md)
- [Privacy Policy Modal](../08-modals-and-overlays/20-privacy-policy.md)
- [Cookie Policy Modal](../08-modals-and-overlays/21-cookie-policy.md)
- [Capacitor (cross-cutting)](../99-cross-cutting/23-capacitor.md)

## Code references for ongoing maintenance

- `src/components/Auth.tsx` — entire component
- `src/App.tsx` — session listener that gates the route (renders Auth when no session)
- `src/lib/supabase.ts` — Supabase client init
- Native URL scheme registered in `capacitor.config.ts`
