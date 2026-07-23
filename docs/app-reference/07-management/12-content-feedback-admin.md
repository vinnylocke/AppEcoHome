# Content Feedback Admin

> Admin-only viewer for the 👍/👎 + optional comment users leave on guides, documentation, help answers, and onboarding workflows. Distinct from the AI learning signal (`ai_feedback`, see [AI Calls Admin](./11-ai-calls-admin.md)) — this is content-quality feedback on static/authored content. Gated on `user_profiles.is_admin = true`.

**Route:** `/admin/content-feedback`
**Source files:**
- `src/components/admin/ContentFeedbackAdmin.tsx` — the page (single file)
- `src/components/feedback/ContentFeedback.tsx` — the reusable 👍/👎 control every surface embeds to write a row
- `supabase/migrations/20260817000000_content_feedback.sql` — `content_feedback` table + RLS

---

## Quick Summary

A flat, filterable list of every row in `content_feedback` (latest 300), each showing a thumbs icon, the `surface` it came from, an optional `target_label`, an optional free-text comment, and a timestamp. A surface dropdown (populated from the rows already loaded) and an all/👍/👎 rating toggle narrow the list; a summary count shows total ups vs downs for the current filter.

---

## Role 1 — Technical Reference

### Component graph

```
ContentFeedbackAdmin (mounted at /admin/content-feedback)
├── Redirect guard — useEffect navigates to /dashboard if !isAdmin
├── Header (title + subtitle + Refresh button)
├── Filter bar
│   ├── Surface select (options derived from the currently loaded rows, not a fixed enum)
│   ├── Rating toggle (All / 👍 / 👎)
│   └── Running 👍/👎 count (right-aligned)
└── Row list (data-testid="content-feedback-row" × N)
    └── per row: thumbs-up/down icon · surface chip · target_label (if present) ·
        comment (if present, quoted) · timestamp + target_id
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `isAdmin` | `boolean` | App.tsx (`profile.is_admin`) | Client-side redirect guard; the route itself is only registered when `profile?.is_admin` is true |

### State (local)

| State | Purpose |
|-------|---------|
| `rows` | Loaded `content_feedback` rows (latest 300, filtered) |
| `loading` | List loading spinner |
| `surfaceFilter` | Selected `surface` value, `""` = all |
| `ratingFilter` | `"all" \| "up" \| "down"` |

### `surfaces` (derived, not fetched)

`useMemo` over the currently-loaded `rows` — builds the surface dropdown's option list from whatever `surface` values are present in the latest 300 rows, sorted alphabetically. This means the dropdown only ever offers surfaces that have at least one row in the current window; a brand-new surface with zero feedback yet won't appear until it has one.

### Data flow — read paths

```ts
supabase.from("content_feedback")
  .select("id, created_at, user_id, home_id, surface, target_kind, target_id, target_label, rating, comment")
  .order("created_at", { ascending: false })
  .limit(300);
// + .eq("surface", surfaceFilter) if set
// + .eq("rating", ratingFilter === "up" ? 1 : -1) if not "all"
```
RLS: the `users_read_own_or_admin_content_feedback` policy on `content_feedback` lets a row's own author read it, OR any `user_profiles.is_admin = true` account read every row regardless of author/home — this page relies on the admin branch to see cross-user, cross-home feedback in one list.

`ups` / `downs` are derived client-side from the currently-loaded (filtered) `rows` via `.filter(...).length` — like AI Calls Admin, these reflect the filtered latest-300 window, not an all-time total.

### Data flow — write paths

Read-only page. Rows are written by the embedded `<ContentFeedback>` control (`src/components/feedback/ContentFeedback.tsx`) wherever it's mounted — a thumbs-down inserts the rating immediately, then an optional "what's wrong?" box patches the same row with a comment a moment later (so a negative signal is never lost even if the user doesn't leave a comment). Never written from this admin page.

### Edge functions invoked

None. Pure PostgREST reads.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None — manual-refresh admin tool (`data-testid="content-feedback-refresh"`).

### Tier gating

None — gated purely by `user_profiles.is_admin`, independent of `subscription_tier`.

### Beta gating

None.

### Permissions / role-based UI

`is_admin` only. The route in `App.tsx` is registered inside `{profile?.is_admin && (<Route path="/admin/content-feedback" .../>)}` — non-admins never receive the route element at all. The component's own `useEffect` redirect to `/dashboard` is defence-in-depth. RLS on `content_feedback` additionally blocks a non-admin's cross-user `select` even if they hit the table directly (they can still read their own rows). Hidden from [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) for everyone else.

### Error states

| State | Result |
|-------|--------|
| List query fails | `rows` stays `[]`; list shows "No feedback yet." (silent soft-fail, no toast) |

### Performance notes

- Hard-capped at 300 rows per query, no pagination beyond that.
- Surface filter options come from the loaded window, not a separate distinct-values query — cheap, but can under-represent rare surfaces.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is where the team reads what gardeners actually think of the written content — guide accuracy, whether a help answer solved the problem, whether an onboarding step made sense. It's the qualitative counterpart to [AI Calls Admin](./11-ai-calls-admin.md)'s quantitative cost/error view: that page tells you if AI is broken, this page tells you if the *content* is wrong or confusing.

### Every flow on this page

#### 1. Scan the running count

- The 👍/👎 tally at the top-right (scoped to the current filter) is the fastest health signal — a surface trending heavily negative deserves attention.

#### 2. Filter by surface

- Pick a surface (e.g. `rhozly-guide`, `app-help`, `onboarding-flow`) to focus on one part of the app's content.

#### 3. Filter by rating

- Switch to 👎-only to triage complaints without wading through the (usually larger) positive pile.

#### 4. Read a row

- The `target_label` (e.g. a guide's title) tells you which specific piece of content was rated. The comment, if present, is the user's own words on what was wrong.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Thumb icon | 👍 (green, `rating = 1`) or 👎 (red, `rating = -1`) |
| Surface chip | Which kind of content produced this feedback — `rhozly-guide` \| `grow-guide` \| `app-help` \| `onboarding-flow` (free-text in the schema, populated by whatever callers pass) |
| Target label | Human-readable title of the rated item (guide title, flow name) — not always present |
| Comment | Free-text the user typed when explaining a 👎 (thumbs-up rarely carries a comment) |
| Timestamp + target id | When it was left, and the raw target identifier (guide id / `plant_<id>` / question hash / flow id) for looking up the exact content |

### Tier-by-tier experience

Not tier-gated — page visibility depends only on `is_admin`; feedback rows themselves can come from any tier's users.

### New user vs returning user vs power user

Not applicable — internal admin tool. A newly-promoted admin's first visit is typically a scan for any glaring 👎 clusters on recently-published guides.

### Beta user experience

No difference — beta status doesn't affect this page.

### Common mistakes / pitfalls

- **Treating the count strip as all-time.** It's scoped to the loaded latest-300 (filtered) window, same caveat as AI Calls Admin's summary strip.
- **Confusing this with AI Calls Admin's Feedback card.** This page (`content_feedback`) covers guides/docs/help/workflows; the AI Calls page's Feedback strip (`ai_feedback`) covers live AI-generated answers — separate tables, separate purposes.
- **Expecting every row to have a comment.** Comments are optional even on a 👎 — a bare thumbs-down with no text is still a valid, actionable signal (something's wrong, just not explained).

### Recommended workflows

- **Content health sweep:** filter 👎-only, scan for a surface or target_label appearing repeatedly — that's your fix-first candidate.
- **Post-publish check:** after shipping a new guide, filter by its surface and target_label to see early reaction.

### What to do if something looks wrong

- **Page redirects to /dashboard immediately:** your `user_profiles.is_admin` is false, or the profile hasn't loaded yet on a hard refresh. Ask an existing admin to promote you.
- **A surface never appears in the dropdown despite having feedback:** the dropdown only reflects the currently-loaded latest-300 window — if that surface's feedback is older than the 300 most recent rows, it won't show. There is no separate "all surfaces" query.

---

## Related reference files

- [AI Calls Admin](./11-ai-calls-admin.md) — the sibling admin tool; its `ai_feedback` Feedback strip is the AI-output learning signal, distinct from this page's content-quality signal
- [Guides List](../05-tools/07-guides-list.md) — one of the surfaces embedding `<ContentFeedback>`
- [Help Center Drawer](../08-modals-and-overlays/24-help-center.md) — another embedding surface (`app-help`)
- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) — "Content Feedback" link in the Admin & Oversight section

## Code references for ongoing maintenance

- `src/components/admin/ContentFeedbackAdmin.tsx`
- `src/components/feedback/ContentFeedback.tsx` — the reusable 👍/👎 control that writes rows
- `supabase/migrations/20260817000000_content_feedback.sql` — schema + RLS
- `src/App.tsx` — `/admin/content-feedback` route registration (`profile?.is_admin` gate)
- `src/components/UserProfileDropdown.tsx` — Admin & Oversight section link
