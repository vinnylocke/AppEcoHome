# Cron Jobs — Schedules

> Every scheduled job that runs in the Rhozly stack, its cadence, and what it does. Cron jobs are defined in Supabase Dashboard → Database → Cron Jobs, calling edge functions on a schedule.

---

## Quick Summary

| Cron | Cadence | Edge Function | Effect |
|------|---------|---------------|--------|
| Sync Weather | hourly | `sync-weather` | Pull Open-Meteo → `weather_snapshots`. Per-home freshness guard is **55 min** (was 60): each home's snapshot is stamped mid-run, so a full one-hour guard made late-listed homes alternate skip/update at the hourly cron — effectively 2-hour weather. |
| Analyse Weather | hourly | `analyse-weather` | Run weather rules → snapshot extras + alerts |
| Generate Tasks | daily (early AM, home TZ) | `generate-tasks` | Materialise blueprint-derived tasks. Now filters `is_archived = false`, skips occurrences before `paused_until` (grid resumes on/after it), and projects occurrences strictly from the `start_date` grid (`start + k·frequency_days` — same phase as TaskEngine ghosts) instead of anchoring on the last existing task or clamping to today. The unbounded last-task scan (silently truncated at PostgREST `max_rows=1000`) is gone. See [Data Model — Tasks](./04-data-model-tasks.md). |
| Update Plant States | daily | `update-plant-states` | Advance growth states per planted-date rules. Hemisphere is derived from `homes.lat` first (`lat < 0` → southern; falls back to an expanded country/timezone list). The planted-items scan is paged via `_shared/pagedSelect.ts` `fetchAllPages` — the old un-ranged select truncated at PostgREST `max_rows=1000`, so plants past row 1000 never advanced. |
| Pattern Scan | every 8h (`0 */8 * * *`) | `pattern-scan` | Run pattern detectors → `pattern_hits`. Cadence reduced from 6h → 8h to cut IO. Fleet scans (`user_events` activity + `home_members`) paged via `fetchAllPages` — active users past the 1000-row cap were never scanned. |
| Pattern Evaluate | every 8h, +30 min (`30 */8 * * *`) | `pattern-evaluate` | Score + dedupe → `user_insights`. Stays paired with pattern-scan. Batch limit reduced 80 → 25 (serial Gemini calls × 45s timeouts blew the wall clock long before hit #80). Gives up on a hit after **3 failed attempts** via `user_pattern_hits.eval_attempts` (migration `20260828000100`) — marks it evaluated with no insight instead of retrying (and billing) forever. |
| Refresh Behaviour Summary | weekly | `refresh-behaviour-summary` | Build per-user AI context. Fleet queries paged via `fetchAllPages` (max_rows=1000 truncation fix). |
| Daily Batch Notifications | **every 15 min** (`*/15 * * * *`, was daily 08:00 UTC) | `daily-batch-notifications` | **Timing rework (2026-06-19, `20260808000000`, cron renamed `daily-notifications-15min`):** the function self-gates per user/home — the task digest fires at each user's chosen **local `reminderTime`** (`notification_prefs.reminderTime`, default 08:00 local) and golden hour fires **~45 min before each home's actual sunset** (`isNearSunset`), not as a morning heads-up. Tasks are only fetched for homes with a due member. Send-once is now **atomic**: each run claims `(user, kind, local date)` rows in `notification_claims` (migration `20260828000000`) via `ON CONFLICT DO NOTHING` before inserting notifications — overlapping invocations can no longer double-push; the rolling ~18 h recent-notifications read survives only as a cheap pre-filter (paged + error-checked, fail-closed). Task dueness is judged against each home's **local** date (`homes.timezone` via `localDateInTz`), not UTC today; a user in multiple homes deterministically gets ONE digest per day (in-run dedupe by user+kind). Fleet queries are paged via `_shared/pagedSelect.ts` `fetchAllPages` (max_rows=1000 truncation fix). Pure timing in `_shared/notificationTiming.ts`. _History below._ Send push digest. Wave 22.0044: honours `user_profiles.notification_prefs` (master + per-category mutes for Watering / Harvesting / Pruning / Golden hour). Filters pending tasks through the Wave 20+ snooze + harvest-window contract — "Not yet → N days" tasks and post-window harvests no longer fire. **Evening overdue nudge (2026-07-08):** a third kind, `overdue_evening`, fires at **20:00 local** per home when the user still has strictly-overdue actionable tasks (`due_date <` local today, snooze/window respected) — one per user per local day via the same `notification_claims` machinery, muted by the `overdueEvening` pref category. |
| Weekly Digest | Mondays 08:00 UTC | `weekly-digest` | Weekly summary email (Resend). Wave 22.0044: dedups recipients across multi-home members (one combined email per address; `digestStyle: per_home` opts back into the legacy fan-out). Honours `weeklyOverview` mute. Vertical weather strip (mobile-readable) + clickable task rows linking to `/calendar?date=YYYY-MM-DD` (#12 — was `/dashboard?view=calendar&date=`). |
| Generate Weekly Overviews | Sundays 06:00 UTC | `generate-weekly-overviews` | **Wave 21.A.** Builds the jsonb payload on `weekly_overviews` per home + writes `weekly_overview` notifications. Notify path claims `(user, 'weekly_overview', week-start)` in `notification_claims` before inserting — a duplicate cron fire no longer re-notifies every member. Manual `home_id` path requires home membership (401/403). See [Notifications](./12-notifications.md). |
| Weekly Optimise Digest | Sundays 07:00 UTC | `weekly-optimise-digest` | **Wave 21.C.** Activity-aware digest pointing at the Optimise tab. Same `notification_claims` send-once claim (`(user, 'optimise_digest', past-week start)`) + home-membership check on the manual `home_id` path. See [Notifications](./12-notifications.md). |
| Purge Stale Species Cache | weekly | `purge-stale-species-cache` | Clear old provider caches |
| Refresh Stale AI Plants | daily (03:00 UTC) | `refresh-stale-ai-plants` | Re-check global AI care guides every ~90 days; diff-based version bump |
| Refresh Stale Grow Guides | daily (03:30 UTC) | `refresh-stale-grow-guides` | Re-check `plant_grow_guides` every ~90 days; diff-based `freshness_version` bump. Batch capped at 25/run. System-attributed AI usage. See [Grow Guide Tab](../08-modals-and-overlays/36-grow-guide-tab.md). |
| Backfill Plant Sensor Ranges | daily (03:45 UTC) | `backfill-plant-sensor-ranges` | Sweep `plant_library` then the global `plants` catalogue for rows missing any of the six soil ranges (moisture / EC / soil-temp); fill ONLY the NULLs via `plantCareRangeGen` (never clobbers verified values). Batch `BACKFILL_BATCH_SIZE` (default 25); system-attributed AI usage. Migration `20260903000000_backfill_plant_sensor_ranges_cron.sql`. See [Data Model — Plants](./03-data-model-plants.md). |
| Refresh Seasonal Picks | Mondays (04:00 UTC) | `refresh-seasonal-picks` | Pre-warm `home_seasonal_picks` for every home whose current ISO-week row is missing. Same orchestrator (`_shared/seasonalPicksHandler.ts`) as the on-demand `seasonal_picks` action. Batch capped at `STALE_SEASONAL_BATCH_SIZE` (default 25) with 750ms inter-call sleep. System-attributed AI usage (`callerUserId: null`). See [Seasonal Picks Card](../02-dashboard/14-seasonal-picks.md). |
| Plant Library Seed | **manual only** (cron removed) | `seed-plant-library` | Pull plant names from Wikipedia category APIs (free, no key — see `_shared/plantNameSources.ts`), filter against the DB to drop existing rows, then ask Gemini to enrich the survivors with care data. Self-chunks ~30 plants per invocation and chains itself via a `waitUntil`-protected POST. Dedup via DB pre-filter + `scientific_name_key` unique index backstop. Fire-and-forget background run; progress streams to `plant_library_runs`. **The daily seed cron (`plant-library-seed-daily`, 02:00 UTC) was removed in `20260905000000` — the library has enough plants; new ones can still be added on demand from /admin/plant-library.** |
| Plant Library Verify | **DISABLED 2026-07-23** (was daily 04:00 UTC) | `verify-plant-library` | **Unscheduled (owner request, `20261022000000`) — no more automated plant verification.** Pick up to 2000 unverified rows, cross-check each against Wikipedia + GBIF, ask AI to compare under a tolerance-banded rubric. `valid = true` (matched) or amend the diverging fields and set `valid = false` with cited sources. **Paused in 12.0043 to focus on population first, then re-enabled in `20260905000000` (`plant-library-verify-daily`, 04:00 UTC, count 2000) once the seeder was stopped.** Admin-triggered verify runs work the same way. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| Plant Library Schedule Tick | **DISABLED 2026-07-23** (was every 5 min) | (none — runs `tick_plant_library_schedules()` plpgsql) | **Unscheduled (owner request, `20261022000000`) — admin scheduled seeding is off; any `active` schedules were cancelled.** Walks active rows in `plant_library_run_schedules` whose `next_run_at <= now()`, fires the matching seed/verify edge function via `pg_net.http_post`, then advances `next_run_at` by `interval_minutes` or marks `status='completed'` when `runs_completed` hits `total_runs`. Drives the admin's "Repeat & schedule" feature — admins can queue "N plants × T runs every M minutes" from [Plant Library Admin](../07-management/10-plant-library-admin.md) and walk away. Cancelled schedules are skipped. Cadence was every minute pre-IO-budget audit; reduced to every 5 min for an 80% cron-fire reduction at the cost of up to 4 minutes of schedule slippage. |
| Plant Library Batches Poll | **DISABLED 2026-07-23** (was every 5 min) | `poll-plant-library-batches` | **Unscheduled (owner request, `20261022000000`) — batch seeding is off; the 4 in-flight `succeeded` batches were cancelled so no new plants get inserted.** Walks non-terminal rows in `plant_library_batches`, GETs Gemini's batch status endpoint for each, updates `last_polled_at` + `status` accordingly. When a batch flips to JOB_STATE_SUCCEEDED, fetches the inline results, parses each line, drops key-colliders, inserts into `plant_library`, creates a `plant_library_runs` row with the per-model + per-token-type breakdown (using the 50% batch discount), and marks the batch row `processed`. Drives the admin's Batch seed feature. See [Plant Library Admin](../07-management/10-plant-library-admin.md). |
| Run Automations | hourly (`0 * * * *`) | `run-automations` | **2026-06-17 (unified automations Phase 1):** scheduled firing is **retired** — the unified condition engine below now owns ALL triggers (incl. time-scheduled) via each automation's `trigger_logic` tree. This cron now only drains the valve queue + serves the manual "run now" path. The eWeLink control fetch carries a **15s timeout** (`AbortSignal.timeout`), with timeout/non-JSON errors counted as a failed attempt — one hung coolkit.cc request can't stall the whole run. |
| Drain Valve Queue | **every 1 min** (`* * * * *`, `drain-valve-queue-1min`) | `run-automations` | Drains the valve queue (each entry **claim-locked** `pending → firing` so the inline drain + this cron can't double-fire) so valves turn off within ~1 min of their due time. Was every 5 min (`drain-valve-queue-5min`); tightened in `20260826000000` so a short run doesn't overrun by up to 5 min. `20260827000100` restored `timeout_milliseconds:=60000` on the pg_net call — the 1-min reschedule had fallen back to pg_net's 5s default, and a timeout mid-drain stranded claimed `firing` rows. |
| Compute Soil Profiles | daily 03:00 UTC (`0 3 * * *`) | `compute-soil-profiles` | Recompute the **deterministic** soil-moisture behaviour model (`soil_moisture_profiles`) for every soil sensor from `device_readings` + `weather_snapshots`. No AI. Pillar A of automation intelligence — see [plan](../../plans/automation-intelligence-and-soil-drydown.md). |
| Analyse Automations | daily 03:30 UTC (`30 3 * * *`) | `analyse-automations` | (Re)generate **deterministic** `automation_suggestions` from each automation's last-7-day `automation_runs` + the area's `soil_moisture_profiles`. Runs 30 min after Compute Soil Profiles so the model is fresh. Pillar B. |
| Garden Brain Reconcile | daily 03:45 UTC (`45 3 * * *`) | `garden-brain-reconcile` | **Deterministic** adaptive-care pass (2026-07-10): per sensor-equipped area, join measured drydown × plant moisture bands × watering blueprints/automations → propose/supersede `care_adjustments` (tighten/stretch/create-routine/stress/in-range), verify applied ones ≥7 days old, notify new actionables (`adaptiveCare` pref). Sage/Evergreen owner gate. See [Garden Brain](./39-garden-brain.md). |
| Scan Journal Photos | daily 04:00 UTC (`0 4 * * *`) | `scan-journal-photos` | Garden Brain Phase 3: **Sage/Evergreen-owner-gated AI vision.** For each activity-filtered home, analyse un-scanned plant-linked journal photos (≤14 days old, ≤10/home/night, ONE analysis ever per photo — `photo_observations.journal_id` UNIQUE): growth stage + health + findings + ≤2 actions from the CLOSED vocabulary (`create_task`/`check_for_ailment`/`watch_closely`), enforced by Gemini `responseSchema` + server validation. Flash-lite ladder, `logAiUsage`-metered. High-confidence stage mismatch auto-corrects `inventory_items.growth_state`. `concern` rows feed the 04:30 brief as `photo_flag` items. See [Garden Brain](./39-garden-brain.md). |
| Generate Daily Brief | daily 04:30 UTC (`30 4 * * *`) | `generate-daily-brief` | Garden Brain Phase 2: assemble the ranked Daily Brief per activity-filtered home (`daily_briefs`). Deterministic for all tiers; **Sage/Evergreen** get the AI head-gardener voice (tier model ladders, hard deterministic fallback, `logAiUsage`-metered). Also serves member-authenticated `regenerate` (Sage+, rate-limited). The daily-batch digest prepends the brief's first sentence. See [Garden Brain](./39-garden-brain.md). |
| Generate Pest Risk | Mondays 05:00 UTC (`0 5 * * 1`) | `generate-pest-risk` | **Evergreen-gated AI.** Regenerate `home_pest_insights` for homes tracking pests + growing affected plants. Also fired on-demand when a user links an ailment to a plant — the on-demand `{ homeId }` path now requires the caller to be a signed-in member of that home (401/403; `verify_jwt` is off for the cron, so it was previously open to any anon-key holder). AI Insights overhaul. |
| Generate Grow Suggestions | Mondays 06:00 UTC (`0 6 * * 1`) | `generate-grow-suggestions` | **Evergreen-gated AI.** Regenerate `home_grow_suggestions` ("what to grow this week + missing tasks") from the full gardener context + draft plans. AI Insights overhaul. |
| Garden Manager Report | Mondays 05:00 UTC (`0 5 * * 1`) | `garden-manager-report` (`{cron:true}`) | **Evergreen-gated AI.** Reconcile each home's `garden_manager_log` (close gaps that have gone, open fresh ones) then refresh the Head Gardener Estate Report in `garden_manager_reports` when inputs changed (content-hash cached). Head Gardener. |
| Prune System Logs | daily 04:45 UTC | (none — inline SQL) | Trims `net._http_response` to 3 days + `cron.job_run_details` to 7 days. Keeps pg_net + pg_cron log bloat from inflating disk IO. |
| Prune App Logs | daily 04:50 UTC | (none — inline SQL) | Retention sweep across the unbounded log-shaped tables: `user_events` (30d), `ai_usage_log` (90d), `notifications` (60d read-only), `chat_messages` (365d), `rate_limit_log` + `ip_rate_limit_log` (7d), `device_readings` (30d), `automation_runs` (180d), `plant_library_runs` (90d), `plant_library_batches` (30d, terminal-only). First run catches the backlog; subsequent runs trivial. |
| Integrations eWeLink Sync | periodic | `integrations-ewelink-sync` | Refresh device readings |
| Integrations Ecowitt Poll (manual) | on user tap | `integrations-ecowitt-poll` | "Sync now" trigger from the Integrations page Refresh button. Returns immediately with the count of channels updated. Same handler as below but auth-gated to the calling user. |
| Integrations Ecowitt Poll (cron) | **every 15 min** (`*/15 * * * *`) | `integrations-ecowitt-cron-poll` | **Added 2026-06-16.** Background poll of every `provider='ecowitt' AND status IN ('active','error')` integration so soil sensor readings update without the user tapping Sync now. Polling `error` rows too means errored integrations **self-heal**: a successful poll re-stamps `status='active'`, so one transient Ecowitt blip no longer silently stops readings until a manual "Sync now". Per-gateway fetches carry a 15s timeout so one hung request can't stall the fleet poll. Walks integrations across all homes via service role, fetches `device/real_time?call_back=all` per gateway, runs the shared parser + writes one `device_readings` row per channel. Per-integration try/catch — one broken gateway logs to Sentry, the rest of the batch still runs. `verify_jwt = false`. Cadence matches the Ecowitt gateway's default ~16 min upload cadence to its own cloud, so we're never staler than the source. Migration: `20260719000000_integrations_ecowitt_cron_poll.sql`. |
| Evaluate Automations (time) | **every 5 min** (`*/5 * * * *`) | `evaluate-automations` `{scope:"time"}` | **Hybrid engine (2026-06-19, migration `20260807000000`):** the same function now runs in three scopes (`_shared/automationCandidates.ts`). This 5-min cron passes `{scope:"time"}` → only **clock-driven** automations (time/date/weather leaves). _Below._ **Firing model (2026-06-19):** `shouldFire` is now **repeat-while-true** — while the condition tree stays true it re-fires every `sensor_cooldown_minutes` rather than once on the rising edge (so "water when dry" keeps watering), bounded by the `run_limit` gate. A **home default run window** (`homes.automation_window_*`, default 08:00–20:00) gates firing for automations whose tree has no time/`date_range` leaf of their own — applied via the pure `_shared/automationWindow.ts` (`defaultWindowOpen`), gating firing not the `condition_was_true` bookkeeping. _History below._ **Phase 3 cleanup (2026-06-18):** renamed from `evaluate-sensor-automations` (cron repointed via `20260728000100_rename_evaluate_automations_cron.sql`); the lazy converter was removed (backfill complete) so it now reads `trigger_logic` directly and skips rows without one; 21 legacy trigger/weather columns dropped (`20260728000000`). _History below._ **Added 2026-06-16 Phase 3.** Walks every `is_active = true AND trigger_kind = 'sensor_threshold'` automation. For each: loads linked sensors + their latest `device_readings.data` row, builds the rule from the automation columns, calls the pure `evaluateAutomation` from `_shared/automationEvaluator.ts` (hysteresis + cooldown + agg_mode in one place), and on FIRE creates an `automation_runs` row, enqueues notifications (`notifications` table) + valve commands (`automation_valve_queue` — the existing drain step in `run-automations` actually fires them), and stamps `sensor_last_fired_at` to start the cooldown. Per-automation try/catch — one broken rule logs to Sentry, the rest of the batch runs. Cadence pairs with the 5-min `drainValveQueue` so worst-case sensor → valve latency is ~10 min. Migration: `20260721000100_sensor_automations_cron.sql`. **2026-06-17 (unified automations Phase 1):** this is now the **single automation engine**. It selects every active automation **plus any not-yet-converted legacy row (incl. inactive)** so `trigger_logic` backfills universally (inactive rows are converted but never fire), lazily converts legacy rows (time_scheduled / sensor_threshold + weather/heat modifiers) into a `trigger_logic` **condition tree** via the unit-tested `convertLegacyToTree`, builds a context (sensor readings, the home's local time, due blueprints, forecast), evaluates the tree (`evaluateTree` from `_shared/conditionTree.ts`), and fires actions on the **rising edge** (false→true) gated by cooldown — persisting `condition_was_true` + `last_fired_at`. Leaf kinds: sensor / time (per-day slots, local tz or UTC) / task_due / weather (rain forecast, heatwave) with AND/OR/NOT. Subsumes the old sensor-threshold rule + the weather defer/skip + heat trigger. Migration: `20260726000000_condition_tree.sql`. (Function keeps its name in Phase 1; renamed to `evaluate-automations` in the Phase 3 cleanup.) |
| Evaluate Automations (safety) | **every 15 min** (`*/15 * * * *`) | `evaluate-automations` `{scope:"all"}` | **Added 2026-06-19 (`20260807000000`).** Full sweep over every active automation — the catch-all safety net + cooldown/run-limit aging for pure-sensor automations the event path may have missed. The active-automations select is paged via `fetchAllPages` so automations past the 1000-row PostgREST cap still get evaluated. |
| Automation event eval (not a cron) | **on `device_readings` INSERT** | `evaluate-automations` `{deviceId}` | **Added 2026-06-19 (`20260807000000`).** `AFTER INSERT` trigger `evaluate_automations_on_reading` on `device_readings` (soil-reading-gated, exception-wrapped, pg_net + publishable key) fires the engine scoped to automations watching that device → near-real-time sensor response. Verified: ~1 s reading→eval latency. |
| Integrations Dead Man's Switch | hourly | `integrations-dead-mans-switch` | Fail-safe turn-off for valves whose `auto_off_at` has passed. Disarms (`auto_off_at = NULL`) **only on a successful turn-off**; on failure it pushes `auto_off_at` +5 min so the switch stays armed and retries (previously it disarmed unconditionally, silently dropping the safety retry and leaving the valve running). The eWeLink control fetch carries a 15s timeout, with timeout/network errors treated as a failed turn-off rather than thrown past the disarm logic. |
| Ailment Library Seed | **DISABLED 2026-07-23** (was Mon 03:30 UTC) | `seed-ailment-library` | **Unscheduled (owner request, `20261022000000`) — no more automated ailment additions.** Weekly top-up of the shared `ailment_library` (pest / disease / invasive reference) — the ailment counterpart to the plant-library seeder. Migration `20260730000100_ailment_seed_cron.sql`. |
| Ailment Library Verify | **DISABLED 2026-07-23** (was Tue 04:30 UTC) | `verify-ailment-library` | **Unscheduled (owner request, `20261022000000`) — no more automated ailment verification.** Weekly cross-check of unverified `ailment_library` rows against sources (mirrors the plant-library verify). Migration `20260731000000_ailment_verify_cron.sql`. |
| Sync Stripe AI cost | **daily** (04:00 UTC, `0 4 * * *`) | `sync-stripe-ai-cost` | Rolls up each user's AI cost-to-serve from `ai_usage_log` and pushes it onto their Stripe Customer metadata so it shows on the Stripe customer page. Migration `20260813000000_ai_cost_backfill_stripe_sync.sql`. |
| Prune AI usage payloads | **daily** (04:15 UTC, `15 4 * * *`) | inline SQL | Trims the stored request/response payloads on old `ai_usage_log` rows to keep the table lean — counts + costs are retained. Migration `20260813000000_ai_cost_backfill_stripe_sync.sql`. |

---

## Role 1 — Technical Reference

### Cadence vs precision

Most crons fire on the dashboard schedule, not in user-local time. `generate-tasks` is an exception — it iterates homes and uses each home's timezone to determine "today".

**Annual carry-over (Track B, 2026-07):** `generate-tasks` still SKIPS seasonal window types (Harvesting/Harvest/Pruning — the frontend ghost engine owns them), but an `annual` / `lifecycle_capped` seasonal-**frequency** routine (e.g. summer watering) is now re-materialised each year within its projected season window (via `_shared/annualWindows.ts` `projectAnnualWindows`) instead of dying at the literal single-year `end_date`. `generate-daily-brief` and `generate-weekly-overviews` likewise roll each window blueprint into its current occurrence before deciding whether its window is open / opening. See [Data Model — Tasks](./04-data-model-tasks.md#annual-carry-over--recurrence_kind-track-b-2026-07).

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
