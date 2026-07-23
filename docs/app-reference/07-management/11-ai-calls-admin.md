# AI Calls Admin

> Admin-only, cross-home log of every AI call Rhozly has made — cost, tokens, model, status, and (for the last 30 days) the actual prompt/context/result payload — plus a rollup of the 👍/👎 learning signal users have left on AI outputs. Gated on `user_profiles.is_admin = true`.

**Route:** `/admin/ai-calls`
**Source files:**
- `src/components/admin/AiCallsAdmin.tsx` — the page (single file)
- `supabase/functions/_shared/aiUsage.ts` — `logAiUsage()`, the helper every AI-calling edge function uses to write a row
- `supabase/functions/_shared/geminiCost.ts` — cost-estimation authority (`estimateGeminiCostUsd`) that computes `estimated_cost_usd`
- `supabase/migrations/20260812000000_ai_observability.sql` — extends `ai_usage_log` with cost/status/payload columns + the admin read policy, and adds `ai_feedback`

---

## Quick Summary

A flat, filterable table of every row in `ai_usage_log` across every home (latest 250), with a function-name filter and a status filter (ok / error / fallback). Each row expands to show the request's token breakdown, duration, any error, and — when captured and not yet pruned — the raw context block, prompt, and model response. A small "Feedback" strip above the table rolls up 👍/👎 counts from `ai_feedback` (the AI learning signal, distinct from `content_feedback`) with the 5 most recent negative ratings that carry a comment.

---

## Role 1 — Technical Reference

### Component graph

```
AiCallsAdmin (mounted at /admin/ai-calls)
├── Redirect guard — useEffect navigates to /dashboard if !isAdmin
├── Header (title + Refresh button)
├── Filter bar (function-name text filter · status select: all/ok/error/fallback)
├── Summary strip (call count · total cost shown · error count · "latest 250" note)
├── Feedback signal card (data-testid="ai-feedback-summary")
│   ├── 👍/👎 counts (from ai_feedback)
│   └── Recent 👎 list (up to 5, with comment if present)
└── Table (divide-y rows, one per ai_usage_log row)
    └── per row: collapsed summary line (timestamp · function/action · model · tokens · cost · status chip)
        └── expanded detail (data-testid="ai-call-detail-{id}") — user/home id, token breakdown,
            duration, error, and 3 lazy-fetched Section blocks: Context / Prompt / Raw result
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `isAdmin` | `boolean` | App.tsx (`profile.is_admin`) | Client-side redirect guard; the route itself is only registered when `profile?.is_admin` is true |

### State (local)

| State | Purpose |
|-------|---------|
| `rows` | The loaded `ai_usage_log` rows (latest 250, filtered) |
| `loading` | Table loading spinner |
| `fnFilter` | Function-name text filter (applied via `ilike`, Enter or Refresh triggers reload) |
| `statusFilter` | `"all" \| "ok" \| "error" \| "fallback"` |
| `expanded` | Which row id (if any) has its detail panel open |
| `payloads` | Per-row cache of the lazily-fetched `{ context_block, prompt, raw_result }` |
| `loadingPayload` | Row id currently fetching its payload |
| `fb` | Feedback rollup: `{ up, down, recent[] }` computed from `ai_feedback` |

### Data flow — read paths

**List query** (fires on mount and whenever `fnFilter`/`statusFilter` change and Refresh/Enter is pressed):
```ts
supabase.from("ai_usage_log")
  .select("id, created_at, user_id, home_id, function_name, action, model, prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens, total_tokens, image_count, estimated_cost_usd, duration_ms, status, error")
  .order("created_at", { ascending: false })
  .limit(250);
// + .ilike("function_name", `%${fnFilter}%`) if set
// + .eq("status", statusFilter) if not "all"
```
RLS: the `admins_read_all_ai_usage` policy on `ai_usage_log` (added in `20260812000000_ai_observability.sql`) lets any `user_profiles.is_admin = true` account read every row regardless of `home_id` — this is the one surface in the app where AI usage is visible cross-home. The pre-existing `ai_usage_log_select` policy (own rows, or a home's rows if the reader has audit access via `can_audit_home_member`) still powers the per-home AI Usage panel on [Audit Log](./08-audit-log.md).

**Feedback rollup** (fires once on mount):
```ts
supabase.from("ai_feedback")
  .select("id, function_name, action, rating, comment, created_at")
  .order("created_at", { ascending: false })
  .limit(500);
```
Computed client-side: `up` = count where `rating === 1`, `down` = count where `rating === -1`, `recent` = the 5 most recent `rating === -1` rows (regardless of whether they have a comment).

**Payload fetch** (on-demand, when a row is expanded for the first time):
```ts
supabase.from("ai_usage_log")
  .select("context_block, prompt, raw_result")
  .eq("id", id)
  .maybeSingle();
```
Cached in `payloads` state so re-expanding a row doesn't re-fetch. `context_block` / `prompt` / `raw_result` are truncated to 16,000 chars and base64-image-stripped at write time by `logAiUsage()`, and nulled entirely by a 30-day prune cron — older rows show "Not captured" instead of the payload.

**Totals** — `count`, `cost`, `errors` are `useMemo`-derived from the currently-loaded `rows` (client-side reduce, not a separate query) — they reflect the filtered latest-250 window, not the true all-time total.

### Data flow — write paths

Read-only page. Rows are written by `logAiUsage()` inside every AI-calling edge function (see [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) and [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md)) — never from this page directly.

### Edge functions invoked

None directly. This page only reads `ai_usage_log` / `ai_feedback` via PostgREST.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `prune-ai-usage-payloads` (daily 04:00 UTC) — nulls `context_block` / `prompt` / `raw_result` on `ai_usage_log` rows older than 30 days, keeping the cost/token row itself | Rows older than 30 days show "Not captured" in the expanded detail instead of the real payload |

### Realtime channels

None — the page is a manual-refresh admin tool (`data-testid="ai-calls-refresh"`), not a live dashboard.

### Tier gating

None at the tier level — gated purely by `user_profiles.is_admin`, independent of `subscription_tier`.

### Beta gating

None.

### Permissions / role-based UI

`is_admin` only. The route in `App.tsx` is registered inside `{profile?.is_admin && (<Route path="/admin/ai-calls" .../>)}`, so non-admins never receive the route at all (not just a client-side redirect — the `<Route>` element itself doesn't exist in the tree). The component's own `useEffect` redirect to `/dashboard` is defence-in-depth for the edge case of a stale `isAdmin` prop. RLS on `ai_usage_log` additionally blocks a non-admin's `select` even if they hit the table directly. Hidden from [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) for everyone else.

### Error states

| State | Result |
|-------|--------|
| List query fails | `rows` stays `[]`; table shows "No AI calls found." (no explicit error toast — a silent soft-fail) |
| Feedback query fails | `fb` stays at its default zero state; feedback card shows "No feedback yet" |
| Payload fetch fails | Row stays expanded with all three Sections showing "Not captured…" |

### Performance notes

- Hard-capped at 250 rows per list query (`.limit(250)`) and 500 for feedback — no pagination beyond that; "latest 250" is called out in the UI so admins don't mistake it for a full history.
- Payload fetch is lazy (only on row expand) and cached per row for the component's lifetime.
- No realtime subscription — cheapest option for a page only admins visit.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the platform-wide AI cost and health dashboard — the admin's answer to "what is every user's AI usage actually costing us, and is anything failing quietly?" Unlike the home-scoped AI Usage tab on [Audit Log](./08-audit-log.md) (which one home's owner can see for their own home), this page sees every call from every home in one flat list — it's for the team running Rhozly, not for gardeners.

### Every flow on this page

#### 1. Scan the summary strip

- Call count, total cost of the shown window, and an error count chip (only shown if > 0) tell you at a glance whether anything's on fire.

#### 2. Filter

- Type a function name (e.g. `plant-doctor-diagnose`) to isolate one feature's calls.
- Pick a status (`ok` / `error` / `fallback`) to hunt for problems — `fallback` means the primary model failed and a cheaper/different model in the cascade picked up the call.

#### 3. Expand a row

- Tap any row to see the token breakdown (prompt / output / cached / thinking), duration, and — for calls in the last 30 days — the actual context, prompt, and raw model response the call used. This is the fastest way to reproduce or debug a bad AI output a user reported.

#### 4. Check the Feedback strip

- 👍/👎 counts show how users are rating AI outputs app-wide (the `ai_feedback` learning signal — distinct from [Content Feedback](./12-content-feedback-admin.md), which covers guides/docs/help, not live AI answers).
- The "Recent 👎" list surfaces the freshest negative ratings with a comment attached — the highest-signal complaints to read first.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Timestamp | When the call was logged |
| Function · action | Which edge function made the call, and which internal action/step within it |
| Model | The Gemini model that actually served the call (may differ from the "preferred" model if the cascade fell back) |
| Tokens | `total_tokens`, or `N img` for pure image-generation (Imagen) calls that don't report text tokens |
| Cost | `estimated_cost_usd` — computed at insert time from `geminiCost.ts`'s per-model rates, not a live provider invoice |
| Status chip | `ok` (green) / `fallback` (amber — cascade moved to a backup model) / `error` (red — the call failed outright) |
| user / home (expanded) | First 8 chars of the acting user's and home's UUIDs — enough to spot a pattern, not a full lookup |
| prompt/out/cache/think (expanded) | The four token buckets Gemini bills separately |
| Context / Prompt / Raw result (expanded) | The actual payload sent to and returned from the model, when still within the retention window |

### Tier-by-tier experience

Not tier-gated — page visibility depends only on `is_admin`, and every home's calls appear regardless of that home's subscription tier.

### New user vs returning user vs power user

Not applicable — this is an internal admin tool, not a gardener-facing surface. "New" here means a newly-promoted admin: their first visit is usually to spot-check that a just-shipped AI feature is logging correctly and its cost looks sane.

### Beta user experience

No difference — beta status doesn't affect this page.

### Common mistakes / pitfalls

- **Reading the summary strip as an all-time total.** It's only the currently-loaded latest-250 (filtered) window — for real historical analysis, narrow the function filter and treat the strip as a sample, not a ledger.
- **Expecting old rows to show their prompt/result.** Payloads are nulled after 30 days by the prune cron — "Not captured" on an old row is expected, not a bug.
- **Confusing this with Content Feedback.** This page's Feedback strip is `ai_feedback` (ratings on live AI answers); [Content Feedback Admin](./12-content-feedback-admin.md) is `content_feedback` (ratings on static guides/docs/help/workflows) — separate tables, separate concerns.

### Recommended workflows

- **Cost spike investigation:** filter by function name, sort by scanning the cost column, expand the priciest rows to see if a caller is sending oversized prompts or images.
- **Debugging a user-reported bad answer:** filter by function name + narrow the time window mentally by scrolling, find the call, expand it, read the Context/Prompt/Raw result trio to reproduce.
- **Weekly health check:** glance at the error count chip and the Recent 👎 list; investigate any cluster.

### What to do if something looks wrong

- **Page redirects to /dashboard immediately:** your `user_profiles.is_admin` is false (or the profile hasn't loaded yet on a hard refresh). Ask an existing admin to promote you.
- **All rows show "error" status:** likely a `GEMINI_API_KEY` or quota issue upstream — check the function logs for the affected `function_name`, same triage as [Plant Library Admin](./10-plant-library-admin.md)'s seed/verify failures.
- **A row's cost looks wildly wrong:** check `src/lib/geminiPricing.ts` / `supabase/functions/_shared/geminiCost.ts` are in sync with Google's current published rates — a stale rate table is the usual cause.

---

## Related reference files

- [Audit Log](./08-audit-log.md) — the home-scoped AI Usage tab overlaps with this page's data (same `ai_usage_log` table, filtered to one home instead of cross-home)
- [Content Feedback Admin](./12-content-feedback-admin.md) — the sibling admin tool for content-quality feedback (`content_feedback`, distinct from this page's `ai_feedback`)
- [Plant Library Admin](./10-plant-library-admin.md) — another `is_admin`-gated tool, same permission model
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — the cascade, cost model, and every function that calls `logAiUsage()`
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md)
- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) — "AI Calls" link in the Admin & Oversight section

## Code references for ongoing maintenance

- `src/components/admin/AiCallsAdmin.tsx`
- `supabase/functions/_shared/aiUsage.ts` — `logAiUsage()` writer, truncation + base64-stripping
- `supabase/functions/_shared/geminiCost.ts` — cost estimation authority
- `src/lib/geminiPricing.ts` — client-side mirror of the pricing table
- `supabase/migrations/20260812000000_ai_observability.sql` — `ai_usage_log` extensions + `admins_read_all_ai_usage` policy + `ai_feedback` table
- `supabase/migrations/20260813000000_ai_cost_backfill_stripe_sync.sql` — `prune-ai-usage-payloads` daily cron (04:00 UTC)
- `src/App.tsx` — `/admin/ai-calls` route registration (`profile?.is_admin` gate)
- `src/components/UserProfileDropdown.tsx` — Admin & Oversight section link
