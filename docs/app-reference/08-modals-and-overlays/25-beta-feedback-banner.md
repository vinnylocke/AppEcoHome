# Beta Feedback Banner + Modal

> The amber banner that sits across the top of the app for beta users. Plus thumbs / "Give feedback" CTA that opens a modal with area selector + free-text + quick-rate buttons. Submissions land in `beta_feedback`.

**Source files:**
- `src/components/BetaFeedbackBanner.tsx` — banner + modal
- `src/context/BetaFeedbackContext.tsx` — submit helpers
- `src/constants/betaFeedbackContexts.ts` — area registry

---

## Quick Summary

Only rendered when `profile.is_beta === true`. Banner has thumbs-up / thumbs-down (quick rate) + "Give feedback" (opens modal). Modal lets user pick an area (general or one of the registered contexts) + free-text body. All submissions go to `beta_feedback` for the admin team to review.

---

## Role 1 — Technical Reference

### Component graph

```
BetaFeedbackBanner
├── Amber sticky banner
│   ├── FlaskConical icon
│   ├── Quick thumbs-up
│   ├── Quick thumbs-down
│   ├── Give feedback → opens modal
│   └── Dismiss (X) (per session)
└── Modal
    ├── Area dropdown (general + BETA_FEEDBACK_CONTEXTS)
    ├── Description textarea
    ├── Submit
    └── Cancel
```

### Hook: `useBetaFeedbackContext()`

```ts
{
  isBeta: boolean,
  requestFeedback(actionContext): void,   // for contextual prompts elsewhere
  submitGeneralFeedback(area, body): Promise<void>,
}
```

### Areas

`BETA_FEEDBACK_CONTEXTS` is a registry like:

```ts
{
  shopping_item_check: { label: "How was checking off shopping items?" },
  plant_doctor_diagnose: { label: "How was the diagnosis?" },
  // ...
}
```

Plus the catch-all "general".

### Data flow — write paths

```ts
supabase.from("beta_feedback").insert({
  user_id, action_context, description, ratings?,
  admin_status: "open",
});
```

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — but `is_beta` flag is required to render.

### Beta gating

This *is* the beta surface.

### Permissions

- Insert is per-user; RLS scopes via `auth.uid()`.

### Error states

| State | Result |
|-------|--------|
| Submit fails | Toast |
| Empty description on full submit | Disabled state |

### Performance

- Banner lightweight; modal lazy on open.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this banner

You're a beta user — Rhozly wants to hear what's working + what isn't. The banner is the persistent "tap here to talk to us" signal.

### Every flow on this banner

#### 1. Quick rate

- 👍 / 👎 → instant submission with no detail. Useful for "I just used X and it was good/bad".

#### 2. Give feedback (modal)

- Pick an area + write a description → submit.
- "General" if none of the listed areas fit.

#### 3. Dismiss

- X closes the banner for the session (not permanently).

### Tier-by-tier experience

Banner only renders for `is_beta = true` users.

### Common mistakes / pitfalls

- **Confusing with Contact Support.** Beta feedback is for product feedback; Contact Support is for help.
- **Quick-rating without context.** Quick rates are most useful right after using a feature.

### Recommended workflows

- **In-flow:** when something works well or annoys you, tap thumbs immediately. Don't save it for later.

### What to do if something looks wrong

- **Banner won't dismiss:** session storage may be cleared. Refresh.
- **Submission failed silently:** check `beta_feedback` row in your account; if missing, retry.

---

## Related reference files

- [Beta Feedback Sheet](./26-beta-feedback-sheet.md)
- [My Beta Feedback Section](../06-account/05-my-feedback.md)
- [Beta Gating (cross-cutting)](../99-cross-cutting/18-beta-gating.md)

## Code references for ongoing maintenance

- `src/components/BetaFeedbackBanner.tsx`
- `src/context/BetaFeedbackContext.tsx`
- `src/constants/betaFeedbackContexts.ts`
- `supabase/migrations/*_beta_feedback.sql`
