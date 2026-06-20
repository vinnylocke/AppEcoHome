# Account Tab

> The headline tab inside Account Settings — display name, email, password, subscription tier switching, AI usage panel, accessibility, data export, "My Feedback", and the danger-zone Delete Account flow.

**Route:** Inside Account Settings (parent screen `GardenerProfile`), `?tab=account` (default).
**Source file:** `src/components/GardenerProfile.tsx` (contains `AccountTab` ~lines 390–870)

---

## Quick Summary

A long-scroll page with grouped sections:

| Section | What it does |
|---------|--------------|
| Display name | Update `user_profiles.display_name` |
| Email | Trigger Supabase Auth email-change flow |
| Password | Re-auth with current password → update new |
| Subscription Tier | Switch between Sprout / Botanist / Sage / Evergreen. Non-admins write `subscription_tier`/`ai_enabled`/`enable_perenual` directly; admins (Stripe sandbox phase) go through Checkout + the `stripe-webhook` sync |
| AI Usage | `AIUsagePanel` — quota + history |
| Accessibility | High-contrast toggle |
| Data Export | GDPR ZIP download |
| My Feedback | History of submitted beta feedback |
| Delete Account | Destructive flow with text-confirm |

---

## Role 1 — Technical Reference

### Component graph

```
GardenerProfile (parent — top tab bar)
└── AccountTab
    ├── Display name section
    ├── Email section
    ├── Password section
    ├── Subscription Tier section (with confirm modal)
    ├── AIUsagePanel (only if aiEnabled)
    ├── AccessibilitySection
    ├── DataExportSection
    ├── MyFeedbackSection
    └── Delete Account section (with confirm modal)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `userId` | `string` | App.tsx | Profile row + auth |
| `homeId` | `string` | App.tsx | Some sections |
| `displayName` | `string \| null` | App.tsx | Initial value |
| `email` | `string \| null` | App.tsx | Re-auth + display |
| `subscriptionTier` | `TierId \| null` | App.tsx | Current tier |
| `onDisplayNameChange` | `(name) => void` | App.tsx | Lift state |
| `onTierChange` | `(tier, aiEnabled, perenualEnabled) => void` | App.tsx | Lift state |

### Local state (AccountTab)

| State | Purpose |
|-------|---------|
| `nameValue`, `isSavingName` | Display name editor |
| `newEmail`, `isSavingEmail` | Email change |
| `currentPassword`, `newPassword`, `confirmPassword`, `isSavingPassword` | Password change |
| `showDeleteModal`, `deleteConfirmText`, `isDeleting` | Delete flow |
| `pendingTier`, `showTierConfirmModal`, `isSwitchingTier` | Tier switch flow |

### Data flow — write paths

#### Display name
```ts
supabase.from("user_profiles").update({ display_name }).eq("uid", userId);
```

#### Email
```ts
supabase.auth.updateUser({ email: newEmail });
// User must confirm via email link before change takes effect
```

#### Password
1. Re-auth: `supabase.auth.signInWithPassword({ email, password: currentPassword })`.
2. On success: `supabase.auth.updateUser({ password: newPassword })`.

#### Tier switch

**Non-admin (honour-system, current default):**
```ts
supabase.from("user_profiles").update({
  subscription_tier: tier.id,
  ai_enabled:        tier.ai_enabled,
  enable_perenual:   tier.enable_perenual,
}).eq("uid", userId);
```
Then `onTierChange()` lifts new flags into App state to update gating across the app without a refetch.

**Admin (Stripe, sandbox phase):** paid-tier selection calls `stripe-create-checkout` → redirect to Stripe-hosted Checkout; "Manage billing" calls `stripe-portal`. The DB is **not** written client-side here — the `stripe-webhook` function is the authoritative writer of `subscription_tier` + flags on `customer.subscription.*`. On return (`?checkout=success&tier=`) the UI optimistically calls `onTierChange()` while the webhook persists. The Stripe billing UI is gated to `isAdmin` for now; everyone else keeps the honour-system switch above.

#### Delete account
Multi-step destructive flow. See [08-delete-account.md](./08-delete-account.md).

### Edge functions invoked

- `delete-account` (destructive flow) — purges all user-scoped data + auth user.
- `stripe-create-checkout` (admin, paid-tier select) — creates a Stripe Checkout Session; returns its hosted URL.
- `stripe-portal` (admin, "Manage billing") — creates a Billing Portal session; returns its URL.
- `stripe-webhook` (no direct UI call) — Stripe → server sync that writes the tier + flags into `user_profiles`.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

- AI Usage panel only shown when `aiEnabled = true`.
- Tier switcher is visible to every tier. **Non-admins:** honour-system (direct DB write). **Admins (Stripe sandbox phase):** paid tiers go through Stripe Checkout + the billing portal, with `stripe-webhook` as the authoritative writer. Going live = swap the Supabase secret to a live key + drop the `isAdmin` gate.

### Beta gating

None.

### Permissions

- All sections are personal — no home-membership permissions apply.

### Error states

| State | Result |
|-------|--------|
| Name update fails | Toast |
| Email update fails | Toast (e.g. invalid email) |
| Re-auth fails (password) | Toast "Current password is incorrect" |
| New password too short | Inline error |
| Tier switch fails | Toast; reverts pendingTier |
| Delete fails | Modal stays; error message |

### Performance

- Per-section saves; no batched form.
- Confirm modals lazy-render.

### Linked storage buckets

- `user-data-exports` — Data Export section.

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

Every setting that isn't gardening-specific lives here — name, email, password, plan, accessibility, and the nuclear options (Export Data, Delete Account). Most users visit twice: once after sign-up to set the name/tier, then rarely afterwards.

### Every flow on this tab

#### 1. Display name

- Type → Save. Updates name shown in header + comments.

#### 2. Email

- Type new email → Save → Supabase sends a confirmation email to the *new* address. The change only takes effect once you click that link.
- If you mistyped, log in with the old email and try again.

#### 3. Password

- Type current + new (×2) → Save.
- Server re-authenticates with current before accepting the new.

#### 4. Switch Tier

- Pick a tier → confirm modal.
- Writes the new tier + AI flag + Perenual flag.
- Take effect immediately across the app — no refresh needed.

#### 5. AI Usage

- Sage / Evergreen only. Shows how many AI calls you've made this month and what they cost.

#### 6. Accessibility

- High-contrast toggle. See [06-accessibility-section.md](./06-accessibility-section.md).

#### 7. Data Export

- Generates a ZIP of all your data (GDPR). See [07-data-export.md](./07-data-export.md).

#### 8. My Feedback

- History of beta feedback you've submitted with admin status. See [05-my-feedback.md](./05-my-feedback.md).

#### 9. Delete Account

- Last section. Destructive. See [08-delete-account.md](./08-delete-account.md).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Display name | Public-ish — shown in headers, community comments |
| Email | Login + notifications target |
| Current tier | Sprout / Botanist / Sage / Evergreen — drives gating |
| AI quota | Tokens / cost used this month |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | No AI Usage panel. |
| Sage / Evergreen | Full panel with charts. |

### Common mistakes / pitfalls

- **Changing email but never confirming.** The new email isn't active until you click the link in the new address. If you mistyped, the link goes nowhere.
- **Forgetting current password.** Use the Forgot Password flow on the Auth screen instead.
- **Switching down a tier expecting AI to keep working.** Tier flags drive gating; downgrade = AI buttons paywall.
- **Confusing Delete Account with Logout.** Delete is permanent; sign out is in the User Profile Dropdown.

### Recommended workflows

- **Post-signup:** set display name + confirm tier.
- **Rare:** change password annually as good hygiene.
- **Before leaving:** export data first, then delete.

### What to do if something looks wrong

- **Email change didn't trigger:** check spam folder. Re-trigger from this screen.
- **Tier didn't update:** check `user_profiles.subscription_tier` directly. May be RLS issue.
- **Saved name still old in header:** `onDisplayNameChange` callback didn't fire — refresh.

---

## Related reference files

- [Notifications Tab](./02-notifications-tab.md)
- [Awards Tab](./03-awards-tab.md)
- [Stats Tab](./04-stats-tab.md)
- [My Feedback Section](./05-my-feedback.md)
- [Accessibility Section](./06-accessibility-section.md)
- [Data Export Section](./07-data-export.md)
- [Delete Account Modal](./08-delete-account.md)
- [User Profile Dropdown](./09-user-profile-dropdown.md)
- [Tier Gating (cross-cutting)](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — parent + AccountTab
- `src/components/AIUsagePanel.tsx` — usage chart
- `src/constants/tiers.ts` — tier definitions
- `supabase/functions/stripe-create-checkout/index.ts`, `stripe-portal/index.ts`, `stripe-webhook/index.ts` — Stripe billing
- `supabase/functions/_shared/stripeTiers.ts` — price↔tier + tier→flags mapping
- `supabase/migrations/20260811000000_stripe_subscriptions.sql` — `user_profiles` Stripe columns
- `supabase/functions/delete-account/index.ts` — destructive edge fn
