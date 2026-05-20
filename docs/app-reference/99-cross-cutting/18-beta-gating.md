# Beta Gating — `is_beta` Flag

> A separate flag `user_profiles.is_beta` controls whether the user sees beta-only features (BetaFeedbackBanner, BetaFeedbackSheet, some experimental UI). Independent of tier — beta status can be granted to any tier.

---

## Quick Summary

```
user_profiles.is_beta: bool
```

Drives:
- BetaFeedbackBanner visibility
- BetaFeedbackSheet (contextual prompts)
- Some experimental features gated behind `is_beta` checks
- The "Beta" badge in some UI surfaces

---

## Role 1 — Technical Reference

### Where it's checked

```ts
const { isBeta } = useBetaFeedbackContext();
if (!isBeta) return null;
```

Or directly on profile in App.tsx.

### Surfaces gated by `is_beta`

| Surface | Purpose |
|---------|---------|
| BetaFeedbackBanner | Top-of-app feedback banner |
| BetaFeedbackSheet | Contextual feedback prompts via `requestFeedback(...)` |
| Some Wave-N experimental features | Gradual rollout |
| Beta-only Plan Staging variants | When applicable |

### Admin assignment

Beta status is admin-toggled. `scripts/invite-beta-users.mjs` exists in repo to grant beta to a list of emails.

### Beta vs tier

| Concept | Stored in | Purpose |
|---------|-----------|---------|
| Tier | `subscription_tier` + flags | Paid feature gating |
| Beta | `is_beta` | Experimental feature gating |

Both can be true simultaneously: a Sage user on beta gets AI + experimental UI.

### Feedback table

`beta_feedback` rows are scoped per user — see [My Beta Feedback Section](../06-account/05-my-feedback.md).

---

## Role 2 — Expert Gardener's Guide

### Why beta exists

To test new features with a willing subset of users before shipping to everyone. Beta users get early access in exchange for feedback.

### Implications

- If you see "Beta" badges or feedback prompts, you're on beta.
- Banner can be dismissed for the session but always returns.
- Feedback shapes the next release.

### Opting in / out

Currently admin-managed. Email support to request beta access or be removed.

---

## Related reference files

- [Beta Feedback Banner + Modal](../08-modals-and-overlays/25-beta-feedback-banner.md)
- [Beta Feedback Sheet](../08-modals-and-overlays/26-beta-feedback-sheet.md)
- [My Beta Feedback Section](../06-account/05-my-feedback.md)

## Code references for ongoing maintenance

- `src/context/BetaFeedbackContext.tsx`
- `src/constants/betaFeedbackContexts.ts`
- `scripts/invite-beta-users.mjs`
- `supabase/migrations/*_beta_feedback.sql`
