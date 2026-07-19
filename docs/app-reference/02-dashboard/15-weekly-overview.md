# Weekly Overview Page

> Sunday-morning summary of the gardener's upcoming week — tasks, weather alerts, sowing suggestions, harvest + pruning windows opening, maintenance roll-up, pest/disease risk lines, pollen forecast, and AI-grounded seasonal tips. Auto-generated weekly by the `generate-weekly-overviews` cron; user can force-regenerate from the page.

**Route:** `/weekly`
**Source file:** [`src/components/WeeklyOverviewPage.tsx`](../../../src/components/WeeklyOverviewPage.tsx)

---

## Quick Summary

A single read-mostly page that surfaces "your week" in seven sections. The data lives in `public.weekly_overviews` as a jsonb payload generated server-side every Sunday at 06:00 UTC. The matching notification (`type = 'weekly_overview'`) lands at the same time and deep-links here.

Default-on pref: `weeklyOverview` in the [Notifications Tab](../06-account/02-notifications-tab.md).

### Entry points

- **Dashboard** — `WeekAheadPreview` sneak-peek card on the merged home's **Detailed density** ([Home (Main Dashboard)](./17-home-main.md)), between the full task list and the Garden Snapshot, inside `FeatureGate feature="ai_insights"` ([`src/components/shared/WeekAheadPreview.tsx`](../../../src/components/shared/WeekAheadPreview.tsx)). Reads the latest `weekly_overviews` row and surfaces a chip strip (e.g. "5 tasks · 2 weather alerts · 3 to sow"). Whole card is a button → `/weekly`. Renders a generic "Tap to generate this week's overview" CTA when no row exists yet.
- **Quick Launcher** — opt-in tile (`weekly` catalogue id, accent amber). Not in the default pin set; users add it from Account Settings → Quick Launcher.
- **Push notification** — Sunday morning `weekly_overview` notification deep-links to `/weekly`.
- **URL** — `/weekly`.

### Edge function contract (Wave 21.0003 update)

The `generate-weekly-overviews` function now accepts an optional JSON body:

```ts
{ home_id?: string, notify?: boolean }
```

- **No body** (cron path) — iterates every home and inserts a `weekly_overview` notification per member, exactly as before.
- **`home_id` set** (manual regen from `/weekly`) — scopes all queries + upsert to that single home. **The caller must be a member of that home**: the function resolves the caller from the JWT (401 if unauthenticated) and checks `home_members` (403 "Not a member of that home" otherwise) — without this, any authenticated user could regenerate (and with `notify: true`, re-notify) another home's overview. `notify` defaults to **false** on this path so users don't receive a duplicate push from their own Regenerate tap. Override with `notify: true` if you ever need a programmatic notification trigger.

**Wind events fixed:** `extractWeatherEvents` now reads the correct Open-Meteo daily snapshot key `windspeed_10m_max` (no underscore between wind/speed — matching sync-weather's request). It previously read `wind_speed_10m_max`, which never exists in the snapshot, so wind was always 0 and strong-wind lines could never fire.

The function also responds correctly to `OPTIONS` preflights with the standard `corsHeaders` constant — required for browser-side `supabase.functions.invoke` calls from `https://rhozly.com`. Same pattern applied to `weekly-optimise-digest` and `fetch-pollen`.

---

## Role 1 — Technical Reference

### Component graph

```
WeeklyOverviewPage
├── Header — title + date range + "Last updated" + Regenerate button
├── Empty state (no row yet)
├── Section — Tasks this week (chips per task type)
├── Section — Weather watch (per-day alert badges)
├── SeasonalPicksCard (titled "Sow & grow this week" on the dashboard variant —
│                       canonical sow surface as of Wave 21.0006)
├── Section — Ready to harvest (tiles)
├── Section — Pruning windows (tiles)
├── Section — Routine maintenance (count + Calendar link)
├── Section — Risks to watch (pest/disease rule output)
├── Section — Pollen forecast (per-day per-pollen badges)
└── Section — Tips for the week (bulleted, AI-grounded when available)

> The pre-Wave-21.0006 "Sow this week" deterministic chip strip was dropped because its source table (`public.sowing_calendar`) was never migrated, so the section had been silently empty on every overview since launch. SeasonalPicksCard is now the canonical sow surface.
```

### Props

| Prop | Type | Source |
|------|------|--------|
| `homeId` | `string` | App.tsx — gates the page render |
| `aiEnabled` | `boolean?` | App.tsx — threaded into the embedded `SeasonalPicksCard` for tier-aware picks |
| `isPremium` | `boolean?` | App.tsx — threaded into `SeasonalPicksCard`'s `PlantDetailModal` overlay |

### Data flow — read paths

- `weekly_overviews` — latest row by `week_start DESC` for the home.

### Data flow — write paths

- `Regenerate` button → `supabase.functions.invoke("generate-weekly-overviews", { body: { home_id } })`. The function upserts on `(home_id, week_start)` so this is idempotent.

### Edge functions invoked

| Function | When |
|----------|------|
| `generate-weekly-overviews` | Sunday 06:00 UTC cron + manual regenerate. Builds the payload and writes the `weekly_overview` notification. |

### Cron / scheduled jobs

| Cron | Schedule | Effect |
|------|----------|--------|
| `generate-weekly-overviews` | `0 6 * * 0` | Build new row + notify members |
| `weekly-optimise-digest` | `0 7 * * 0` | Separate weekly digest (not the same page) — see [Optimise Tab](../04-schedule/02-optimise-tab.md) |
| `fetch-pollen-daily` | `0 2 * * *` | Refreshes `pollen_snapshots` consumed by the overview generator |
| `daily-batch-notifications` | existing | Now also queues Golden Hour notifications per home |

### Realtime channels

None subscribed.

### Tier gating

None. The page is available on every tier. AI-generated tips are appended to the deterministic seasonal tips when `GEMINI_API_KEY` is configured on the cron's edge function; missing the key just falls back to seasonal tips, no error surfaced.

### Beta gating

None.

### Permissions

- `home_members` membership required (enforced by RLS on `weekly_overviews`).

### Error states

| State | Result |
|-------|--------|
| No row yet | Empty state with "Generate now" CTA |
| Manual regenerate fails | Toast + page keeps the existing row |
| Pollen unavailable (region) | Pollen section is omitted entirely |

### Performance

- Single supabase select on mount (returns one jsonb row).
- Regenerate triggers the edge function which iterates every home in the project — bounded by the cron's `EdgeRuntime.waitUntil` budget.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this page

It's the Sunday-night planning view. Tasks, weather, what to sow, what's ripe, what's about to need pruning, plus a handful of seasonal tips and any risks brewing this week (blight after warm/wet stretches, mildew after heat, slug pressure after rain, drought stress when forecast turns dry).

The notification lands in your phone first thing Sunday with a one-line headline; tap through and you've got the whole week in front of you.

### Every flow on this page

- **Read it top to bottom** — the order is "what's already on my list, what's the weather doing, what should I be doing differently this week".
- **Regenerate** — if you've added new plants, postponed tasks, or just want to refresh after a forecast change, the button rebuilds the row on demand.
- **Section deep links** — Maintenance has a link straight into the calendar so you can act on the roll-up; harvest / prune tiles read-only (action lives on the plant or in the task modal).

### Tier-by-tier experience

No differences. AI-grounded tips are appended to the deterministic seasonal tips silently when the back-end has access.

### Common mistakes / pitfalls

- **Empty sections aren't bugs** — the page only renders sections that have content. If you've never set up harvest blueprints, the Harvest section is simply absent that week.
- **Pollen missing** is normal outside Europe + North America (Open-Meteo's coverage limit). The whole section is skipped quietly.

### Recommended workflows

- Sunday morning: read overview → spot weather alerts → confirm tasks → glance at risk section → mark up next week's plan.
- Mid-week: hit Regenerate if a forecast change or a sudden frost warning came through.

### What to do if something looks wrong

- **No overview at all** — the cron may not have fired yet. Tap Regenerate. If that fails, the function is likely deploying.
- **Wrong week** — the cron picks "the next Monday from today". If you're viewing on a Sunday after 06:00 UTC, you'll see the next week. If you're viewing Saturday, you'll still see the upcoming Mon–Sun window.

---

## Related reference files

- [Notifications](../99-cross-cutting/12-notifications.md) — channels + the new `weekly_overview` / `golden_hour` / `weekly_optimise_digest` notification types
- [Cron Jobs](../99-cross-cutting/11-cron-jobs.md) — the three new schedules
- [Notifications Tab](../06-account/02-notifications-tab.md) — pref toggles for each notification category
- [Weather](../99-cross-cutting/27-weather.md) — source of the `weather_snapshots` data the overview reads
- [Optimise Tab](../04-schedule/02-optimise-tab.md) — separate weekly digest landing zone

## Code references for ongoing maintenance

- [`src/components/WeeklyOverviewPage.tsx`](../../../src/components/WeeklyOverviewPage.tsx) — the page
- [`supabase/functions/generate-weekly-overviews/index.ts`](../../../supabase/functions/generate-weekly-overviews/index.ts) — Sunday-morning cron + on-demand regen
- [`supabase/functions/weekly-optimise-digest/index.ts`](../../../supabase/functions/weekly-optimise-digest/index.ts) — separate Sunday digest
- [`supabase/functions/fetch-pollen/index.ts`](../../../supabase/functions/fetch-pollen/index.ts) — daily Open-Meteo Air Quality fetch
- [`supabase/functions/daily-batch-notifications/index.ts`](../../../supabase/functions/daily-batch-notifications/index.ts) — extended with Golden Hour
- [`supabase/functions/_shared/sunsetTime.ts`](../../../supabase/functions/_shared/sunsetTime.ts) — NOAA solar-position approximation
- [`supabase/migrations/20260707000000_wave_21_weekly_overview.sql`](../../../supabase/migrations/20260707000000_wave_21_weekly_overview.sql) — `weekly_overviews` + `pollen_snapshots` tables + cron schedules
- [`supabase/tests/sunsetTime.test.ts`](../../../supabase/tests/sunsetTime.test.ts) — Deno unit tests for the sunset helper
