# Cron Jobs — Schedules

> Every scheduled job that runs in the Rhozly stack, its cadence, and what it does. Cron jobs are defined in Supabase Dashboard → Database → Cron Jobs, calling edge functions on a schedule.

---

## Quick Summary

| Cron | Cadence | Edge Function | Effect |
|------|---------|---------------|--------|
| Sync Weather | hourly | `sync-weather` | Pull Open-Meteo → `weather_snapshots` |
| Analyse Weather | hourly | `analyse-weather` | Run weather rules → snapshot extras + alerts |
| Generate Tasks | daily (early AM, home TZ) | `generate-tasks` | Materialise blueprint-derived tasks |
| Update Plant States | daily | `update-plant-states` | Advance growth states per planted-date rules |
| Pattern Scan | hourly | `pattern-scan` | Run pattern detectors → `pattern_hits` |
| Pattern Evaluate | hourly | `pattern-evaluate` | Score + dedupe → `user_insights` |
| Refresh Behaviour Summary | weekly | `refresh-behaviour-summary` | Build per-user AI context |
| Daily Batch Notifications | daily | `daily-batch-notifications` | Send push / email digests |
| Weekly Digest | weekly | `weekly-digest` | Weekly summary email |
| Purge Stale Species Cache | weekly | `purge-stale-species-cache` | Clear old provider caches |
| Refresh Stale AI Plants | daily (03:00 UTC) | `refresh-stale-ai-plants` | Re-check global AI care guides every ~90 days; diff-based version bump |
| Refresh Stale Grow Guides | daily (03:30 UTC) | `refresh-stale-grow-guides` | Re-check `plant_grow_guides` every ~90 days; diff-based `freshness_version` bump. Batch capped at 25/run. System-attributed AI usage. See [Grow Guide Tab](../08-modals-and-overlays/36-grow-guide-tab.md). |
| Refresh Seasonal Picks | Mondays (04:00 UTC) | `refresh-seasonal-picks` | Pre-warm `home_seasonal_picks` for every home whose current ISO-week row is missing. Same orchestrator (`_shared/seasonalPicksHandler.ts`) as the on-demand `seasonal_picks` action. Batch capped at `STALE_SEASONAL_BATCH_SIZE` (default 25) with 750ms inter-call sleep. System-attributed AI usage (`callerUserId: null`). See [Seasonal Picks Card](../02-dashboard/14-seasonal-picks.md). |
| Plant Library Seed | daily (02:00 UTC) | `seed-plant-library` | Pull plant names from Wikipedia category APIs (free, no key — see `_shared/plantNameSources.ts`), filter against the DB to drop existing rows, then ask Gemini to enrich the survivors with care data. Self-chunks ~30 plants per invocation and chains itself via a `waitUntil`-protected POST. Dedup via DB pre-filter + `scientific_name_key` unique index backstop. Fire-and-forget background run; progress streams to `plant_library_runs`. |
| Plant Library Verify | **manual only** (cron paused) | `verify-plant-library` | Pick up to 2000 unverified rows, cross-check each against Wikipedia + GBIF, ask AI to compare under a tolerance-banded rubric. `valid = true` (matched) or amend the diverging fields and set `valid = false` with cited sources. **The daily cron was unscheduled in 12.0043 to focus on database population first** — the edge function is still deployed and admin-triggered verify runs work the same way. Re-add the cron via `cron.schedule('plant-library-verify-daily', '0 4 * * *', …)` when ready. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| Plant Library Schedule Tick | every minute | (none — runs `tick_plant_library_schedules()` plpgsql) | Walks active rows in `plant_library_run_schedules` whose `next_run_at <= now()`, fires the matching seed/verify edge function via `pg_net.http_post`, then advances `next_run_at` by `interval_minutes` or marks `status='completed'` when `runs_completed` hits `total_runs`. Drives the admin's "Repeat & schedule" feature — admins can queue "N plants × T runs every M minutes" from [Plant Library Admin](../07-management/10-plant-library-admin.md) and walk away. Cancelled schedules are skipped. |
| Plant Library Batches Poll | every 5 minutes | `poll-plant-library-batches` | Walks non-terminal rows in `plant_library_batches`, GETs Gemini's batch status endpoint for each, updates `last_polled_at` + `status` accordingly. When a batch flips to JOB_STATE_SUCCEEDED, fetches the inline results, parses each line, drops key-colliders, inserts into `plant_library`, creates a `plant_library_runs` row with the per-model + per-token-type breakdown (using the 50% batch discount), and marks the batch row `processed`. Drives the admin's Batch seed feature. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| Run Automations | every minute | `run-automations` | Fire due watering automations |
| Integrations eWeLink Sync | periodic | `integrations-ewelink-sync` | Refresh device readings |
| Integrations Ecowitt Poll | periodic | `integrations-ecowitt-poll` | Poll Ecowitt weather stations |
| Integrations Dead Man's Switch | hourly | `integrations-dead-mans-switch` | Re-arm fail-safes |

---

## Role 1 — Technical Reference

### Cadence vs precision

Most crons fire on the dashboard schedule, not in user-local time. `generate-tasks` is an exception — it iterates homes and uses each home's timezone to determine "today".

### Per-cron failure isolation

Each cron handles per-user / per-home errors locally and logs to `cron_run_logs` (or similar) so a single failure doesn't tank the whole batch.

### Configuration

Cron schedules live in Supabase Dashboard. Reproducible via `supabase/cron-jobs.sql` (if maintained) or the dashboard UI.

### Cron run logs

| Table | Purpose |
|-------|---------|
| `cron_run_logs` | Per-run status, duration, error |

### Affected tables (cron writes)

- `tasks`, `task_blueprints` (generate-tasks)
- `weather_snapshots`, `weather_alerts` (sync-weather / analyse-weather)
- `user_insights`, `pattern_hits` (pattern-scan / pattern-evaluate)
- `user_behaviour_summary` (refresh-behaviour-summary)
- `soil_readings` (integrations-ewelink-sync)
- `automation_runs`, `valve_events` (run-automations)
- `inventory_items` (update-plant-states)
- `plants`, `plant_care_revisions`, `ai_usage_log` (refresh-stale-ai-plants)
- `home_seasonal_picks`, `ai_usage_log` (refresh-seasonal-picks)

### Refresh Stale AI Plants — extra notes

Cadence is "daily, but each plant is re-checked at most every 90 days." The daily fire only walks the rows whose `last_freshness_check_at` is NULL or older than 90 days. Batch capped per-run via `STALE_CHECK_BATCH_SIZE` env (default 25). Worst case: 25 plants × 365 days = 9,125 unique plant checks per year against Gemini.

Filter is **always** `source='ai' AND home_id IS NULL`. Home-scoped forks have `home_id != NULL` by construction → never touched. Forks own their own care guides forever after the detach-on-edit modal confirms.

Diff is via `diffCareGuide` in [`_shared/aiPlantCatalogue.ts`](../../../supabase/functions/_shared/aiPlantCatalogue.ts) — the same helper used by `manual-refresh-ai-plant`. Lowercases strings + sorts arrays before comparison so cosmetic AI variation doesn't trigger spurious version bumps.

AI usage attribution is system-level: `ai_usage_log` rows for this cron have `user_id = NULL` and `home_id = NULL`. Cost shows up in the Audit Log under "System" rather than against any user's quota.

### Refresh Seasonal Picks — extra notes

Fires every Monday at 04:00 UTC — half an hour after `refresh-stale-grow-guides` (03:30) so the three Gemini-heavy crons don't contend for quota. Walks `home_members` to find every home that has at least one user attached, filters out homes whose `home_seasonal_picks` row for the current ISO week is already populated, then calls `generateSeasonalPicksForHome()` for the rest with `forceRegen: false`.

Tier-routing in the cron is decided by walking the home's members: if any member is on Sage or Evergreen, the AI path runs; otherwise the deterministic fallback path runs (`_shared/seasonalPicksFallback.ts`). Both paths upsert into `home_seasonal_picks` with the same shape, so the card pulls a single source.

AI usage attribution is system-level (`user_id = NULL`, `home_id = NULL` on `ai_usage_log`) — the same pattern as `refresh-stale-ai-plants` and `refresh-stale-grow-guides`.

### Manual triggering

Each edge function can be invoked manually via `supabase functions invoke <name>` for debugging.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

Tasks, notifications, weather alerts, pattern insights — most of Rhozly's "autopilot" lives in cron. When something doesn't appear automatically, a cron is the usual suspect.

### Common symptoms → likely cron

- "Tasks not appearing today" → `generate-tasks`
- "Weather alert never fired" → `sync-weather` / `analyse-weather`
- "Plant still says Seedling weeks later" → `update-plant-states`
- "No notification for due task" → `daily-batch-notifications`
- "Automation didn't run" → `run-automations`

---

## Related reference files

- [Edge Functions Catalogue](./10-edge-functions-catalogue.md)
- [Weather](./27-weather.md)
- [Pattern Engine](./26-pattern-engine.md)
- [Notifications](./12-notifications.md)

## Code references for ongoing maintenance

- Supabase Dashboard → Database → Cron Jobs
- `supabase/functions/<name>/index.ts`
