# My Beta Feedback Section

> A list of every beta feedback submission the user has made, with admin status (Awaiting review / Acknowledged / Resolved) and any admin response.

**Trigger:** Rendered inside Account Tab (Account Settings).
**Source file:** `src/components/GardenerProfile.tsx` — `MyFeedbackSection()` function (~lines 315–386)

---

## Quick Summary

Fetches `beta_feedback` rows for the current user, newest first. Each row shows the `action_context` (where the feedback was given), the description, ratings, status pill, admin response (if any), and date. Section hides entirely when the user has submitted nothing.

---

## Role 1 — Technical Reference

### Component graph

```
MyFeedbackSection
├── Header (icon, title, "N submitted" badge)
├── List of feedback items (3 shown by default; "Show all" expands)
│   └── Feedback row
│       ├── action_context chip
│       ├── Status pill
│       ├── Description body
│       ├── Admin response card (if present)
│       └── Date
└── Show more / Show less toggle
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `userId` | `string` | parent | Scope |

### Local state

| State | Purpose |
|-------|---------|
| `items` | Fetched rows |
| `expanded` | Show all vs first 3 |

### Status meta

| `admin_status` | Label | Pill colour |
|---------------|-------|-------------|
| `open` | Awaiting review | surface-low |
| `acknowledged` | Acknowledged | amber |
| `resolved` | Resolved | emerald |

### Data flow — read paths

```ts
supabase.from("beta_feedback")
  .select("id, action_context, description, ratings, admin_status, admin_response, created_at")
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .limit(50);
```

### Data flow — write paths

None — read-only from the user's side. Admin response writes happen via the admin UI.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None — fetched once on mount.

### Tier gating

None — every user with beta access sees this. Section auto-hides for users with zero submissions.

### Beta gating

None — once submitted, history is always visible regardless of current beta status.

### Permissions

- RLS scopes to `auth.uid() = user_id`.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Section silently hides (items null) |
| No items | Section hides (items.length === 0) |

### Performance

- Single query.
- Limit 50 — anything beyond that is paginated (future).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why look at this section

If you've submitted beta feedback (via the Beta Feedback Banner or Sheet that pops up after using new features), this is where it goes. Useful for:
- Tracking what you've already raised.
- Reading admin responses.
- Avoiding duplicate submissions.

### Every flow on this section

#### 1. Browse

- 3 most recent shown by default.
- "Show all" expands.

#### 2. Read admin response

- If admin has replied, it shows under the description as a tinted callout.
- This is one-way (no thread); future improvements may make it conversational.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| action_context | Where in the app you gave the feedback (e.g. "shopping_item_check") |
| Status pill | Open / Acknowledged / Resolved |
| Description | Your free-text |
| Ratings | Star ratings if you gave any |
| Admin response | Reply from the Rhozly team |
| Date | Submission date |

### Tier-by-tier experience

Same for every tier — but only beta users tend to submit feedback (banner only appears for `is_beta = true`).

### Common mistakes / pitfalls

- **Expecting a real conversation thread.** Today the response is one-way. If you want to follow up, submit new feedback.
- **Wondering why your feedback "disappeared".** Section hides if items.length === 0 — make sure you're logged in as the user that submitted.

### Recommended workflows

- **Periodic review:** check once a fortnight to see admin responses.
- **Before submitting new feedback:** scan history to avoid duplicates.

### What to do if something looks wrong

- **My submission isn't here:** the insert may have failed silently. Re-submit.
- **Status stuck on "Awaiting review":** admins haven't gotten to it yet — be patient.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Beta Feedback Banner + Modal](../08-modals-and-overlays/25-beta-feedback-banner.md)
- [Beta Feedback Sheet](../08-modals-and-overlays/26-beta-feedback-sheet.md)
- [Beta Gating (cross-cutting)](../99-cross-cutting/18-beta-gating.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — `MyFeedbackSection` function
- `src/context/BetaFeedbackContext.tsx` — `requestFeedback` flow
- `supabase/migrations/*_beta_feedback.sql` — schema + RLS
