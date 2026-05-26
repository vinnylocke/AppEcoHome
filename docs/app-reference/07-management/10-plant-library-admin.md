# Plant Library Admin

> Admin-only dashboard for the global `plant_library` knowledge base. Drives the Wikipedia-seeded + AI-enriched + Wikipedia/GBIF-verified plant data pipeline that we plan to substitute for live AI calls in future read paths. Gated on `user_profiles.is_admin = true`.

**Route:** `/admin/plant-library`
**Source files:**
- `src/components/admin/PlantLibraryAdmin.tsx` — the page
- `src/services/plantLibraryAdminService.ts` — stats fetch, recent runs, seed/verify triggers
- `supabase/functions/seed-plant-library/index.ts` — self-chunking seeder (Wikipedia names + AI care data)
- `supabase/functions/verify-plant-library/index.ts` — fire-and-forget verifier
- `supabase/functions/_shared/plantNameSources.ts` — Wikipedia category-members client for plant-name discovery
- `supabase/functions/_shared/plantLibrarySources.ts` — Wikipedia summary + GBIF clients (used by verifier)
- `supabase/migrations/20260624000900_plant_library.sql` — `plant_library` + `plant_library_runs` tables
- `supabase/migrations/20260624001000_plant_library_crons.sql` — daily cron schedules

---

## Quick Summary

An admin-only page surfacing the running totals of the global plant knowledge base, with manual triggers for the daily seed/verify pipeline. Stats strip up top (Total / Verified / Matched / Amended / Unverified) drives at-a-glance health checks; below it, count-input + Run buttons fire `seed-plant-library` and `verify-plant-library` against the same edge functions the cron invokes. Each Run block also has a collapsible **Repeat & schedule** disclosure for queueing N runs every M minutes — schedule state lives in `plant_library_run_schedules` and is dispatched by a minute-tick pg_cron, so it survives browser close and admin can cancel from the Active Schedules panel. Recent-runs table polls every 3s while any run is `status='running'` OR any schedule is active.

---

## Role 1 — Technical Reference

### Component graph

```
PlantLibraryAdmin (mounted at /admin/plant-library)
├── Header (back / refresh)
├── StatCard × 5  (Total · Verified · Matched · Amended · Unverified)
├── Run controls (synchronous — same-call, blocking-free background)
│   ├── RunBlock "Seed"   → triggerSeedRun(count) OR createPlantLibrarySchedule({kind:'seed', …})
│   │     └── Repeat & schedule disclosure (Number of runs · Minutes between)
│   └── RunBlock "Verify" → triggerVerifyRun(count) OR createPlantLibrarySchedule({kind:'verify', …})
│         └── Repeat & schedule disclosure (Number of runs · Minutes between)
├── Batch seed (50% off) section  (Gemini Batch API — fire & wait)
│     ├── Plants-per-batch input + upfront cost estimate
│     └── Submit batch → submitPlantLibraryBatch(count)
├── Pending batches panel  (only renders when ≥1 non-terminal batch exists)
│     └── per-row Cancel → status='cancelled' (poll cron skips)
├── Active schedules panel  (only renders when ≥1 active schedule exists)
│     └── per-row Cancel → status='cancelled' (next tick skips)
└── Recent runs table  (polls every 3s while anyRunning OR anySchedulesActive OR anyBatchesPending)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `isAdmin` | `boolean` | App.tsx (from `profile.is_admin`) | If false, redirects to `/dashboard` on mount |
| `userId` | `string` | App.tsx (from `session.user.id`) | Recorded as `plant_library_runs.triggered_by` when admin clicks Run |

### Data flow — read paths

1. **Stats**: four parallel `COUNT(*)` queries against `plant_library` (total / unverified / matched / amended). Uses the `plant_library_valid_idx` and `plant_library_unverified_idx` partial indexes so each count is a fast index-only scan.
2. **Recent runs**: `SELECT * FROM plant_library_runs ORDER BY started_at DESC LIMIT 20`. RLS restricts this view to admin users.

### Data flow — write paths

Admin-triggered runs invoke the edge functions:

- `triggerSeedRun(count, userId)` → `supabase.functions.invoke("seed-plant-library", { body: { count, triggered_by: userId } })`. Returns `{ run_id }` immediately; the seed work continues in the background via `EdgeRuntime.waitUntil`. The function self-chunks: each invocation processes ~30 plants and chains to itself for the next chunk via a `waitUntil`-protected POST, so any size request can complete reliably. **Only used when totalRuns === 1**; otherwise the page creates a schedule row instead.
- `triggerVerifyRun(count, userId)` → `supabase.functions.invoke("verify-plant-library", { body: { count, triggered_by: userId } })`. Same fire-and-forget pattern, same single-run-only conditional.
- `createPlantLibrarySchedule({ kind, countPerRun, totalRuns, intervalMinutes })` → INSERT into `plant_library_run_schedules`. First fire happens on the next minute tick (≤60s); the Postgres `tick_plant_library_schedules()` function dispatches via `pg_net.http_post` to the same edge functions.
- `cancelPlantLibrarySchedule(id)` → UPDATE `status='cancelled'`. Next tick skips. Doesn't affect already-dispatched in-flight runs (they have their own run row and the seed function's stop-button machinery handles those if needed).
- `fetchActivePlantLibrarySchedules()` → SELECT all `status='active'` schedules, ordered by `next_run_at`. Drives the Active Schedules panel.
- `submitPlantLibraryBatch(count, userId)` → `supabase.functions.invoke("submit-plant-library-batch", { body: { count, triggered_by: userId } })`. Edge fn runs the same Wikipedia → DB-filter → scientific-name-resolution → key-filter pipeline as the synchronous seeder, packs survivors into BATCH_SIZE-line groups, POSTs to Gemini's `:batchGenerateContent`, and inserts a `plant_library_batches` row with `status='pending'` + the upfront cost estimate. Returns `{ batch_id, gemini_batch_name, plants, estimated_cost_usd }` immediately. Results processed asynchronously by the 5-min poll cron.
- `cancelPlantLibraryBatch(id)` → UPDATE `status='cancelled'`. The poll cron skips the row on next tick; in-flight work at Gemini may still complete and be billed (we don't call Google's batch cancel API — by the time the admin clicks cancel here, the cost is largely sunk).
- `fetchActivePlantLibraryBatches()` → SELECT all non-terminal batches (`submitting` / `pending` / `running` / `succeeded`), most-recent first. Drives the Pending batches panel.
- `estimatePlantLibrarySeedCost(count, { batch })` → reads median $/plant from the last 5 successful seed runs, multiplies by count, halves for batch mode. Returns 0 when there's no history.

Neither call blocks the UI past the initial run-row insert (~50ms).

### Edge functions invoked

- `seed-plant-library` (also called by cron)
- `verify-plant-library` (also called by cron)
- `plant-image-search` (called transitively from the seeder)

### Cron / scheduled jobs that affect this surface

- `plant-library-seed-daily` (02:00 UTC) — adds 1000 plants/day under the same code path the admin button uses.
- `plant-library-verify-daily` (04:00 UTC) — processes up to 2000 unverified rows.
- `plant-library-schedule-tick` (every minute) — runs `tick_plant_library_schedules()` which dispatches any `plant_library_run_schedules` row whose `next_run_at <= now()`, then advances `next_run_at` by `interval_minutes` (or marks `status='completed'` when `runs_completed` hits `total_runs`).
- `plant-library-batches-poll` (every 5 minutes) — `pg_net.http_post` to `poll-plant-library-batches` edge fn, which walks non-terminal `plant_library_batches` rows, polls Gemini for each, and processes SUCCEEDED batches into `plant_library` + a new `plant_library_runs` row.

Daily crons insert rows into `plant_library_runs` with `triggered_by = NULL`, so the admin page can tell cron runs from manual ones by an empty triggered_by cell. Schedule-dispatched runs carry the original `created_by` admin uuid as `triggered_by`.

### Realtime channels

None — polling every 3s while any run is `running` is sufficient and cheaper than a long-lived realtime subscription on a page only admins see.

### Tier gating

None at the tier level. Gated by `user_profiles.is_admin` only — RLS on `plant_library_runs` enforces server-side; the route guard in `App.tsx` (`profile?.is_admin && ...`) and the page's `useEffect` redirect provide client-side defence in depth.

### Beta gating

None.

### Permissions / role-based UI

`is_admin` only. Hidden from `UserProfileDropdown` for everyone else; route doesn't render for non-admins; RLS blocks the recent-runs select even if a non-admin scrapes the route somehow.

### Error states

| State | Result |
|-------|--------|
| Initial fetch fails | Stats show 0; recent runs show "No runs yet" |
| Trigger seed/verify fails (network, edge function unavailable) | Toast: "Couldn't start the … run — check the function logs." Run button stays clickable |
| Edge function throws mid-batch | Run row flips to `status = 'failed'`, `error_message` populated. Admin sees it on next poll. |

### Performance notes

- Stats use `head: true` + count-only — no row data transferred.
- Recent runs query is fast (B-tree on `started_at DESC`, partial index).
- Polling stops automatically when no row has `status = 'running'`.

### Linked storage buckets

None. Thumbnails are stored as URLs (Wikipedia / Pixabay / Unsplash) — we don't proxy or rehost.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

You're the admin watching the global plant library fill up. The daily crons do the actual work — you're here to spot-check progress, kick off a top-up if the numbers look low, or watch the verifier catch the seeder's hallucinations in real time.

### Every flow on this view

#### 1. Watch the stats strip

- **Total**: every row in `plant_library`, verified or not.
- **Verified**: rows where AI has cross-checked against Wikipedia + GBIF.
- **Matched**: verified rows where AI agreed with the online sources (no amendments).
- **Amended**: verified rows where AI had to correct something (cited sources stored on the row).
- **Unverified**: rows queued for the next verify pass — usually whatever was seeded after the last verify cron ran.

A healthy ratio over time looks like ~75% matched / 20% amended / 5% failures. Higher amended counts mean the seeder is hallucinating; lower matched counts mean care data is drifting from reality.

#### 2. Trigger a manual seed

- Set "Plants to seed" (default 100, cap 5000).
- Tap **Run seed**. A toast confirms the background run.
- The page refreshes; the new run appears at the top of the recent-runs table with `status = 'running'`. Polling fires every 3s, so the inserted/skipped counts climb in real time.

#### 3. Trigger a manual verify

- Set "Plants to verify" (default 500).
- Tap **Run verify**. Same fire-and-forget pattern.
- Watch matched + amended climb as rows finish.

#### 4. Schedule a repeat run

Open the **Repeat & schedule** disclosure under either Run block. Set:
- **Number of runs** (1–100; default 1 = no schedule, fire immediately).
- **Minutes between runs** (1–1440; default 10).

Tap the Run button — it switches to "Schedule N×" when scheduling. A schedule row lands in `plant_library_run_schedules` and the first fire happens within 60 seconds. The new **Active schedules** panel above Recent runs shows progress (`3 of 10 done · next in 7 min`) with a Cancel button per row. Cancel flips status to `cancelled`; the next minute-tick skips it.

Use case: you keep hitting Gemini quota errors on big runs. Set "50 plants × 10 runs every 10 minutes" and walk away — the quota recovers between fires.

#### 5. Inspect a finished run

- Each row in the recent-runs table shows started_at, kind, requested, inserted/matched, skipped, amended, failed, duration, and a status chip.
- Status chip: `running` (animated spinner), `succeeded` (green), `partial` (amber — some rows failed), `failed` (red — the entire run threw).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Total | Row count in `plant_library` |
| Verified | Rows where `verified_at IS NOT NULL` |
| Matched | Verified rows with `valid = true` (AI agreed with online sources) |
| Amended | Verified rows with `valid = false` (one or more fields were corrected; sources cited on the row) |
| Unverified | Rows queued for the next verify pass |
| Requested (run column) | The N requested by cron / admin |
| Inserted / Matched (run column) | Seed runs show `count_inserted`; verify runs show `count_matched` |
| Skipped | Seed runs only — duplicates caught by `scientific_name_key` unique index (the DB pre-filter catches most upstream; this only fires when the AI returns a scientific name that normalises to an existing key) |
| Amended (run column) | Verify runs only — rows where AI corrected something |
| Failed | Per-row exceptions during the run (insert error) PLUS batch-level failures (Gemini cascade exhausted, parse failures, Wikipedia returned no candidates) |
| Failed seed entries panel | Surfaces the reason behind every Failed count — per-row insert errors AND batch-level failures (the latter show as `(batch of N plants)` with the actual error message) |
| Tokens (run column) | Sum of every Gemini call's `totalTokenCount` for the run. Click the chevron on the row's Started timestamp to expand the cost breakdown. |
| Est. cost (run column) | Sum of every Gemini call's computed cost using `src/lib/geminiPricing.ts` rates. Estimate — not Google's invoice line item. |
| Expanded breakdown | Two-pane view shown when a run row's chevron is clicked. **Left:** token-type breakdown (Fresh input / Cached input / Output / Thinking) across all models with tokens + cost per type and a Total row. **Right:** one mini-card per Gemini model that contributed — model id, call count, total cost, and per-token-type line items (`Fresh input  6,900 × $0.10/M = $0.00069`). Pre-12.0058 runs show "No per-model breakdown" since they pre-date the per-model bucket. |
| Pricing reference table (page bottom) | Static table showing every model in `src/lib/geminiPricing.ts` with its input / cached input / output rates. Order matches the cascade in `_shared/gemini.ts` — top-to-bottom = cheapest-to-most-expensive. Keep both this client mirror and `_shared/geminiCost.ts` in sync when Google publishes new rates. |
| Duration | Time from started_at to finished_at |

### Tier-by-tier experience

Not tier-gated. Page only visible to admins regardless of subscription tier.

### New user vs returning user vs power user

- **First admin visit**: empty library, all zeros. Trigger a small seed (50–100) to smoke-test the pipeline end to end, then a verify on the same batch to see the matched/amended split.
- **Daily admin visit**: stats reflect yesterday's cron (~1000 added overnight). Spot-check the most recent verify run — high amended count = look at the data; low matched = the seeder might be drifting.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Triggering a seed during the daily cron's run window.** Two concurrent seeds is fine (the unique index dedupes) but doubles AI cost. Avoid 02:00 UTC.
- **Triggering a 5000-plant seed expecting fast feedback.** That's ~200 AI batches × ~1.5s each ≈ 5 minutes of background work. The page polls live, but you should leave the run alone and check back.
- **Assuming `valid = false` means the plant is bad.** It means the data was *corrected*. The cited sources show what was used; the row is now more accurate, not less.

### Recommended workflows

- **Spot-checking a hallucination cluster**: when amended count spikes, query `plant_library WHERE valid = false ORDER BY verified_at DESC LIMIT 20` (Supabase SQL editor) and read the rows. If patterns emerge, refine the seed prompt.
- **Backfilling unverified rows after an outage**: if the verify cron failed for a few days, trigger a manual verify with `count = (whatever unverified is)`.
- **Sampling library quality**: spot-check 10 random `valid = true` rows by name. The data should be obviously correct.

### What to do if something looks wrong

- **All seed runs fail**: check `GEMINI_API_KEY` is set in the function's env vars. Most likely cause.
- **Verify runs only return matched, never amended**: Wikipedia / GBIF are returning nothing useful (network issue, rate limit). Check the function logs for "no_sources" entries.
- **Polling never stops**: a run is stuck in `status = 'running'` with no `finished_at`. Look in Supabase function logs for an unhandled exception. Manually `UPDATE plant_library_runs SET status='failed', finished_at = now()` to unstick the UI.

---

## Related reference files

- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `seed-plant-library` + `verify-plant-library` entries
- [Cron Jobs](../99-cross-cutting/11-cron-jobs.md) — daily 02:00 / 04:00 UTC schedules
- [Caching](../99-cross-cutting/14-caching.md) — `plant_image_cache` (used transitively by the seeder)
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — both functions use the standard `callGeminiCascade` helper

## Code references for ongoing maintenance

- `src/components/admin/PlantLibraryAdmin.tsx`
- `src/services/plantLibraryAdminService.ts`
- `src/components/UserProfileDropdown.tsx` — admin section link
- `src/App.tsx` — `/admin/plant-library` route registration
- `supabase/functions/seed-plant-library/index.ts`
- `supabase/functions/verify-plant-library/index.ts`
- `supabase/functions/_shared/plantNameSources.ts` — 4-source candidate fetcher (Wikipedia categories + iNaturalist long-tail + Wikidata SPARQL + GBIF species backbone) + key-computation helpers
- `supabase/functions/_shared/plantLibrarySources.ts` — Wikipedia summary + GBIF match clients used by the verifier
- `supabase/migrations/20260624000900_plant_library.sql`
- `supabase/migrations/20260624001000_plant_library_crons.sql`
- `supabase/migrations/20260624001900_plant_library_run_schedules.sql` — schedules table + RLS + `tick_plant_library_schedules()` + 1-min cron
- `supabase/migrations/20260624002000_plant_library_runs_model_usage.sql` — `model_usage jsonb` column on `plant_library_runs` (per-model token + cost bucket)
- `supabase/migrations/20260624002100_plant_library_batches.sql` — `plant_library_batches` table + RLS + `plant-library-batches-poll` 5-min cron
- `supabase/migrations/20260624002400_plant_library_source_cursors.sql` — per-source cursor table for sequential pagination (Perenual / Verdantly / Wikidata / GBIF)
- `supabase/functions/submit-plant-library-batch/index.ts` — admin-facing batch submitter (skip-reduces + packs + POSTs to Gemini :batchGenerateContent)
- `supabase/functions/poll-plant-library-batches/index.ts` — 5-min cron worker that polls Gemini and processes SUCCEEDED batches into plant_library + a new plant_library_runs row
- `supabase/functions/_shared/plantSeedPrompt.ts` — shared prompt + schema + salvage parser + row-shape helper used by both the sync seeder and the batch flow
- `supabase/functions/_shared/plantNameSources.ts` — Wikipedia category fetcher + `extractScientificName` + `computeSciKey` (used by sync + batch skip-reduction)
- `supabase/functions/_shared/gemini.ts` — cascade order (7 models) + Batch API helpers (`submitGeminiBatch`, `getGeminiBatchStatus`, `getGeminiBatchResults`, `cancelGeminiBatch`)
- `supabase/functions/_shared/geminiCost.ts` — Deno-side PRICES + cost helper (billing authority); accepts `{ batch: true }` for the 50% batch discount
- `src/lib/geminiPricing.ts` — client-side mirror of PRICES + breakdown helpers (UI authority; keep in sync with `geminiCost.ts`)
- `supabase/config.toml` — `verify_jwt = false` on seed-plant-library / verify-plant-library / submit-plant-library-batch / poll-plant-library-batches (cron + self-chain reach the fns without JWT minting)
