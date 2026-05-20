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

### Refresh Stale AI Plants — extra notes

Cadence is "daily, but each plant is re-checked at most every 90 days." The daily fire only walks the rows whose `last_freshness_check_at` is NULL or older than 90 days. Batch capped per-run via `STALE_CHECK_BATCH_SIZE` env (default 25). Worst case: 25 plants × 365 days = 9,125 unique plant checks per year against Gemini.

Filter is **always** `source='ai' AND home_id IS NULL`. Home-scoped forks have `home_id != NULL` by construction → never touched. Forks own their own care guides forever after the detach-on-edit modal confirms.

Diff is via `diffCareGuide` in [`_shared/aiPlantCatalogue.ts`](../../../supabase/functions/_shared/aiPlantCatalogue.ts) — the same helper used by `manual-refresh-ai-plant`. Lowercases strings + sorts arrays before comparison so cosmetic AI variation doesn't trigger spurious version bumps.

AI usage attribution is system-level: `ai_usage_log` rows for this cron have `user_id = NULL` and `home_id = NULL`. Cost shows up in the Audit Log under "System" rather than against any user's quota.

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
