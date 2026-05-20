# Beta Feedback Sheet

> The bottom-sheet prompt that appears after a beta user uses a specific feature. Asks them to rate a few criteria (1-5 stars each) + optional description. Triggered via `requestFeedback("context_key")` from any screen.

**Source files:**
- `src/components/BetaFeedbackSheet.tsx`
- `src/context/BetaFeedbackContext.tsx`
- `src/constants/betaFeedbackContexts.ts`

---

## Quick Summary

Contextual variant of the Banner modal. When a screen calls `requestFeedback("shopping_item_check")` (for example), the sheet slides up with the question for that context + the per-context criteria as 5-star inputs. Quick thumbs available for low-effort submissions.

---

## Role 1 — Technical Reference

### Component graph

```
BetaFeedbackSheet (Portal, bottom-sheet)
├── Backdrop (dismiss on click)
├── Header (X)
├── Context question ("How was checking off shopping items?")
├── Per-criterion star inputs (1-5)
├── Optional description textarea
├── Quick thumbs-up / thumbs-down
├── Submit (enabled when all criteria rated)
└── Animate in/out
```

### Hook surface

`useBetaFeedbackContext()` exposes:

```ts
{
  isBeta,
  pendingFeedback: { context: string } | null,
  requestFeedback(context: string): void,         // adds to queue
  submitFeedback(ratings, description): Promise<void>,
  dismissFeedback(): void,
}
```

### `BETA_FEEDBACK_CONTEXTS` registry

```ts
{
  shopping_item_check: {
    label: "How was checking off shopping items?",
    criteria: ["Speed", "Clarity", "Usefulness"],
  },
  // ...
}
```

### Data flow — write paths

```ts
supabase.from("beta_feedback").insert({
  user_id, action_context: pendingFeedback.context,
  description, ratings, admin_status: "open",
});
```

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — but only rendered when a screen requests it AND `is_beta = true`.

### Beta gating

Yes — `is_beta` required.

### Permissions

Per-user. RLS scopes via `auth.uid()`.

### Error states

| State | Result |
|-------|--------|
| Submit fails | Stays open; user can retry |
| Some criteria un-rated | Submit disabled (Quick thumbs always allowed) |

### Performance

- Sheet lazy-renders on `requestFeedback`.
- Animates in next paint via double-RAF.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this sheet

Banner is the always-on signal. The Sheet is targeted — "you just did X, how was it?". Beta users get these post-flow for new features.

### Every flow on this sheet

#### 1. Read the question

- "How was X?"

#### 2. Rate criteria

- 1-5 stars per criterion.

#### 3. (Optional) Free text

- Add detail.

#### 4. Submit or quick thumbs

- Quick thumbs fast-paths (sets all criteria to 1 or 5).

#### 5. Dismiss

- Tap backdrop → no feedback recorded.

### Tier-by-tier experience

Beta only.

### Common mistakes / pitfalls

- **Dismissing all sheets.** Reduces signal quality. If a sheet annoys you, dismiss the banner-level master toggle instead.

### Recommended workflows

- **First time using a new feature:** rate honestly. Helps Rhozly improve.

### What to do if something looks wrong

- **Sheet keeps re-appearing:** the context may not be marking-as-asked correctly. File a bug.

---

## Related reference files

- [Beta Feedback Banner](./25-beta-feedback-banner.md)
- [My Beta Feedback Section](../06-account/05-my-feedback.md)

## Code references for ongoing maintenance

- `src/components/BetaFeedbackSheet.tsx`
- `src/context/BetaFeedbackContext.tsx`
- `src/constants/betaFeedbackContexts.ts`
