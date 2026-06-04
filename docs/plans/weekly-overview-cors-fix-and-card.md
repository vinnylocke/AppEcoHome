# Plan — Weekly Overview: Generate failure (CORS) + sneak-peek dashboard card

## Goal

1. **Fix the "fail to generate" bug** on `/weekly`. Root cause confirmed: the three Wave 21 edge functions (`generate-weekly-overviews`, `weekly-optimise-digest`, `fetch-pollen`) ship without CORS headers or an OPTIONS preflight handler. The browser's preflight request to `*.supabase.co` returns no `Access-Control-Allow-Origin`, so the actual POST is blocked. The toast says "Couldn't regenerate" but the function never actually ran from the browser. Also, the function ignores the `home_id` body parameter and re-processes every home in the project on each invocation — which is wrong (it notifies other users on a single user's regenerate tap) and unnecessarily slow.

2. **Replace the inline "Week ahead →" pill** on the dashboard with a richer **sneak-peek card** that reads the latest `weekly_overviews` row for the home and previews real data (tasks count, weather alerts, sow/harvest counts) plus a tap-to-open CTA. Surfaces value inline and is much harder to miss.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) — payload shape, regenerate flow, current entry points
- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) — where the new card slots into the dashboard component graph
- [`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — to confirm the three Wave 21 functions and their conventions
- [`docs/app-reference/99-cross-cutting/12-notifications.md`](../app-reference/99-cross-cutting/12-notifications.md) — confirms that the regenerate path was meant to also queue notifications; we'll suppress on manual regen to avoid duplicates

## Root cause (verified, not guessed)

I ran `curl -X OPTIONS https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-weekly-overviews` with `Origin: https://rhozly.com` and the response:
- returns HTTP 200 (preflight should be 204)
- **runs the full function body** (instead of returning preflight-only response)
- has **no `Access-Control-Allow-Origin` header**
- the actual function logic returns `{"success":true,"overviewsWritten":2,"notificationsQueued":3}` — confirming the function ignores `home_id` and processes every home

So when the browser preflights from `https://rhozly.com`, it gets a response with no CORS allowance → blocks the actual POST → the page's `supabase.functions.invoke` returns an `error` → "Couldn't regenerate" toast fires.

The pattern used by every working Rhozly function (e.g. `companion-planting/index.ts`) is:

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // ...
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

The three Wave 21 functions skipped this pattern entirely.

## Changes

### A. Edge function fix — `supabase/functions/generate-weekly-overviews/index.ts`

1. Add `corsHeaders` constant.
2. Add `OPTIONS` short-circuit at top of `serve` handler returning `new Response("ok", { headers: corsHeaders })`.
3. Parse JSON body **only for POST requests**. When `home_id` is provided and non-null:
   - Skip the `homes` enumeration; load only that one home (`.eq("id", body.home_id)`).
   - Default to **suppress notifications** for on-demand regenerate (the page already toasts success; users shouldn't get a duplicate push). Override with `notify: true` in body if the cron ever wants to call it (the cron itself passes no body, so the default-on path stays).
4. Spread `corsHeaders` into every `Response`'s headers (both success and 500 catch).

Logic stays identical otherwise — the rule engine, AI tips, upsert, notification insert blocks all unchanged. Just scoped to one home when invoked from the page.

### B. Same fix applied to `weekly-optimise-digest` and `fetch-pollen`

Both have the identical CORS bug. Apply the same `corsHeaders` + OPTIONS short-circuit + (where it makes sense) per-home scoping from body. `fetch-pollen` is cron-only today so just CORS; `weekly-optimise-digest` deserves the same `home_id` scoping treatment for consistency.

### C. New dashboard sneak-peek card — `src/components/shared/WeekAheadPreview.tsx`

New component, ~120 lines. Reads the latest `weekly_overviews` row for the home and renders a small card with:

```
┌─────────────────────────────────────────┐
│ 📅 YOUR WEEK AHEAD            Jun 8–14  │
│                                         │
│ 5 tasks · 2 weather alerts · 3 to sow   │
│                                         │
│  Open week →                            │
└─────────────────────────────────────────┘
```

- Reads `weekly_overviews` (same query the page does, single-row).
- Derives the chip strip from `task_counts`, `weather_events`, `sow_this_week`, `harvest_this_week`. Hides zero-count chips.
- When no row exists: card shows "Plan your Sunday — Tap to generate this week's overview".
- Whole card is a button → `navigate("/weekly")`.
- Tailwind: rounded-3xl, `bg-rhozly-surface-low/60`, amber-accented icon (matches the Quick Launcher tile's accent).
- `data-testid="dash-week-ahead-card"`.

### D. Wire the new card into `HomeDashboard.tsx`

- **Remove** the inline "Week ahead →" pill button added in v21.0002 (the `<div className="flex items-center gap-3">` wrapper around `dash-refresh`).
- **Restore** the original single Refresh-button header layout.
- **Insert** `<WeekAheadPreview homeId={homeId} />` just below `<TodayFocusCard />` and above the "This Week at a Glance" header.
- Reasoning for placement: TodayFocusCard answers "what's most important right now"; the new card answers "what's coming up". Both belong above the weekly stats.

## Files modified

| File | Change |
|------|--------|
| [`supabase/functions/generate-weekly-overviews/index.ts`](../../supabase/functions/generate-weekly-overviews/index.ts) | CORS + OPTIONS + body parsing + per-home scoping + suppress-notify on manual regen |
| [`supabase/functions/weekly-optimise-digest/index.ts`](../../supabase/functions/weekly-optimise-digest/index.ts) | CORS + OPTIONS + body parsing + per-home scoping |
| [`supabase/functions/fetch-pollen/index.ts`](../../supabase/functions/fetch-pollen/index.ts) | CORS + OPTIONS (cron-only, no scoping needed) |
| `src/components/shared/WeekAheadPreview.tsx` | **NEW** sneak-peek card component |
| [`src/components/HomeDashboard.tsx`](../../src/components/HomeDashboard.tsx) | Remove v21.0002 pill; mount `<WeekAheadPreview />` |

## Tests

- **Deno**: add a small fixture-driven test in `supabase/tests/` covering: (a) OPTIONS returns 204 + CORS, (b) body with `home_id` scopes to one home, (c) absent body keeps the original cron behaviour iterating all homes.
- **Vitest**: unit test for the new card's data-derivation helper (`describeWeekChips(payload) → string[]`) so the chip string logic is testable without React.
- **E2E (docs only for now)**: add row to `docs/e2e-test-plan.md` covering "Dashboard → sneak-peek card visible → tap → lands on /weekly".

## App-reference docs to update post-implement

| File | Update |
|------|--------|
| [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) | Entry points section: replace "pill in header" with "sneak-peek card below TodayFocusCard". Document the home_id scoping and notify suppression in Role 1 data flow. |
| [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) | Component graph: add `WeekAheadPreview` after `TodayFocusCard`. |
| [`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) | Note CORS + body-scoping contract for the three Wave 21 functions. |

## Risks / edge cases

- **Cron compatibility**: the cron job calls the function with no body (the script's `net.http_post` sends `'{}'` or a small payload — confirmed in the migration that schedules it). When body parsing yields no `home_id`, the function falls back to the original "iterate every home" path. Backwards-compatible.
- **Notification suppression**: today the cron call has body-less request → notifications still queue (correct). Manual regenerate (with `home_id`) → suppress notifications (correct, avoids duplicates). The optional `notify: true` override stays available for any future programmatic path.
- **No DB schema change**, no migration, no env-var change.
- **No tier gate change** — the function was already universally available.

## Deploy

- Three function deploys (`generate-weekly-overviews`, `weekly-optimise-digest`, `fetch-pollen`) + Vercel frontend deploy.
- Standard `npm run deploy` minor bump (→ 21.0003).
- Functions use `--use-api` already (Docker still off locally) — bake this into the deploy script as a follow-up if not already there.
