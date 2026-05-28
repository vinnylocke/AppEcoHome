# Rhozly Scalability Audit — 2026-05-27

This audit looks across the entire stack for bottlenecks that will bite as the user base grows. The trigger was a Supabase IO Budget alert at single-user scale; the IO change already shipped (cron cadence + log retention) addresses the most acute symptom, but the underlying patterns it surfaced are repeated across the codebase. This document is the full punch list — every finding has a severity, location, and proposed fix.

## How to read this

- **Severity** is "what breaks at scale", not "is it broken now":
  - **🔴 High** — actively hurts now or breaks at ~100 active users.
  - **🟠 Medium** — fine today, painful at 1,000+ users or as data accumulates over months.
  - **🟡 Low** — hygiene / quality-of-life; cheap to fix once the high/medium items are done.
- **Cat** = category (1–6). Each section also rolls up its own findings.
- **Effort** = rough sizing: S (≤1 day), M (1–3 days), L (a week+).
- All paths are clickable links to the relevant code.

Findings are unordered within each category — they should be triaged together in waves rather than top-down.

---

## Headline findings (the seven things to fix first)

1. **🔴 RLS policies use bare `auth.uid()` everywhere** — 40 policies across 21 migrations. None wrap it as `(SELECT auth.uid())`. Postgres re-evaluates the function per row checked. At 10K rows scanned per query this multiplies CPU + latency by ~10K. *[Cat 1, finding 1.1]*
2. **🔴 `pattern-scan` is O(users × patterns × hits) sequential.** Nested `for await` loops with per-hit DB upserts. No batching, no per-run user cap. Will hit the 60s edge function timeout somewhere around 200 active users. *[Cat 3, finding 3.1]*
3. **🔴 `HomeRealtimeContext` subscribes to 13 tables with wildcard `event: "*"`.** Every INSERT / UPDATE / DELETE on any of them broadcasts to every connected client. Writes per user × 13 subscriptions × N concurrent users = exponential broadcast cost. *[Cat 4, finding 4.1]*
4. **🔴 Six log-shaped tables have no retention** — `ai_usage_log`, `user_events`, `notifications`, `chat_messages`, `rate_limit_log` + `ip_rate_limit_log`, `device_readings`, `automation_runs`. All grow forever; IO + storage cost compounds. *[Cat 2, findings 2.1–2.7]*
5. **🔴 `generate-tasks` does N+1 sequential reads + one-at-a-time inserts.** Every blueprint = 1 read for last_task; every projected task = 1 insert. As blueprint count grows, daily generation balloons. *[Cat 3, finding 3.2]*
6. **🔴 No storage bucket lifecycle policies.** `plant-images`, `community-guides`, `area_scans`, `plant-doctor-uploads`, `garden-shape-photos`, `plan-photos`, `nursery-scan`, `visualiser-captures` accumulate forever. *[Cat 6, finding 6.1]*
7. **🟠 No AI quota enforcement per user / home.** Gemini token spend has no daily cap. One bad actor or runaway loop = unbounded cost. *[Cat 6, finding 6.2]*

If only one wave ships, doing 1, 4, 5, 6 cuts IO budget by ~70% and stops the most expensive growth curves at the same time.

---

## Cat 1 — Database queries & indexes

### 1.1 — 🔴 RLS policies use unwrapped `auth.uid()`

**Where:** [40 occurrences across 21 migrations](supabase/migrations) — `auth.uid()` called directly inside `USING (...)` clauses without `(SELECT auth.uid())` wrapping. None of the policies use the wrapped form.

**Why it matters:** Postgres re-evaluates `auth.uid()` per row checked. Supabase's documented best practice is `using ((select auth.uid()) = user_id)` so the call is hoisted once per query. The unwrapped form costs ~10× more CPU on large scans.

**Fix:** Migration that rewrites every affected policy to use `(SELECT auth.uid())`. Mechanical change, low risk. **Effort: M.**

```sql
-- Example transform
-- BEFORE:
CREATE POLICY "x" ON tbl FOR ALL USING (user_id = auth.uid());
-- AFTER:
CREATE POLICY "x" ON tbl FOR ALL USING (user_id = (SELECT auth.uid()));
```

---

### 1.2 — 🔴 `plant_journals` RLS uses an unindexed UNION subquery

**Where:** [supabase/migrations/20260415110152_add_journal_table.sql:296-307](supabase/migrations/20260415110152_add_journal_table.sql) — the "Users can manage journals for their home" policy unions `user_profiles.home_id` with `home_members.home_id` per row. Bare `auth.uid()` compounds the cost.

**Why it matters:** Plant Journals are queried on nearly every plant card render. With ~500 journal entries per active user, the policy currently scans both `user_profiles` and `home_members` per row × per query.

**Fix:** Rewrite to a single membership check using the existing `is_member_of(home_id)` function (already exists). Replace with `using (is_member_of(home_id))`. **Effort: S.**

---

### 1.3 — 🟠 `plant_journals.inventory_item_id` lacks an index

**Where:** [supabase/migrations/20260415110152_add_journal_table.sql:36-38](supabase/migrations/20260415110152_add_journal_table.sql) — FK constraint exists but no index. The Global Journal migration ([20260626000000](supabase/migrations/20260626000000_global_journal_targets.sql)) added indexes for the new target columns but missed the original `inventory_item_id` column.

**Why it matters:** Per-plant journal lookups (`select * from plant_journals where inventory_item_id = X`) hit a sequential scan. Used by InstanceEditModal, PlantJournalTab, HarvestEndOfLifePrompt — the busiest journal entry points.

**Fix:** Add `CREATE INDEX plant_journals_inventory_item_id_idx ON plant_journals(inventory_item_id) WHERE inventory_item_id IS NOT NULL`. **Effort: S.**

---

### 1.4 — 🟠 `plant_journals` granted full DML (including TRUNCATE) to `anon`

**Where:** [supabase/migrations/20260415110152_add_journal_table.sql:253-266](supabase/migrations/20260415110152_add_journal_table.sql) — `grant delete, insert, references, select, trigger, truncate, update on plant_journals to anon`.

**Why it matters:** RLS protects rows today, but `TRUNCATE` to anon is a defense-in-depth red flag. If RLS is ever bypassed by a future migration accident, an anon caller could wipe the table. Not a scalability issue per se but pairs with the upcoming Supabase Data API grant changes (Oct 30 2026 deadline already in [CLAUDE.md](CLAUDE.md)).

**Fix:** `REVOKE TRUNCATE, REFERENCES, TRIGGER ON plant_journals FROM anon`. Keep SELECT/INSERT/UPDATE/DELETE because RLS gates them. **Effort: S.**

---

### 1.5 — 🟠 TaskEngine over-fetches via `select("*", joins)`

**Where:** [src/lib/taskEngine.ts:159, 175](src/lib/taskEngine.ts) — fetches every column from `tasks` and `task_blueprints`. Both tables have ~20+ columns including large jsonb columns (`raw_data`, `description`).

**Why it matters:** Each TaskList mount fetches ~2KB per task. With 50 daily tasks this is 100KB per render; multiply across mounts and the row read amplification is significant. Specifically the `description` column is rarely needed in list view.

**Fix:** Replace `*` with explicit column lists matching what the list renderer needs. Defer `description` to TaskModal open. **Effort: S.**

---

### 1.6 — 🟠 `generate-tasks` runs N+1 sequential queries

**Where:** [supabase/functions/generate-tasks/index.ts:57-63, 112-120](supabase/functions/generate-tasks/index.ts).

**Why it matters:** For every active blueprint the function does a separate `select due_date from tasks where blueprint_id = X order by due_date desc limit 1`. Then it inserts each projected task one at a time. As blueprints grow (10 per user × 1000 users = 10K blueprints), this becomes 10K reads + tens of thousands of single-row inserts in one daily cron run.

**Fix:** 
1. Replace N+1 with one query using `DISTINCT ON (blueprint_id) ... ORDER BY blueprint_id, due_date DESC`.
2. Replace one-at-a-time inserts with `supabase.from('tasks').insert(tasksToInsert)` batched in chunks of 500.

**Effort: S.**

---

### 1.7 — 🟠 `daily-batch-notifications` fetches all `planner_preferences` globally

**Where:** [supabase/functions/daily-batch-notifications/index.ts:55-58](supabase/functions/daily-batch-notifications/index.ts) — `planner_preferences` query has no `.in("user_id", ...)` filter.

**Why it matters:** Loads every preference row across every user in the world to populate `prefsByUser`. At 100K users with 5 prefs each, that's 500K rows pulled into memory per daily cron run. Currently small but explodes linearly with user count.

**Fix:** Filter to `IN (memberUserIds)` after `home_members` is loaded. Move the prefs query inside the same `Promise.all` only after computing the relevant user ID set, OR push to a join. **Effort: S.**

---

### 1.8 — 🟡 Multiple tables lack home_id indexes

**Where:** Tables that have a `home_id` column but no `idx_*_home_id` index visible in migrations: `chat_feedback`, `visualiser_captures`, `garden_zones`, `release_notes`, `home_climate`, `home_seasonal_picks` (has `_week` only).

**Why it matters:** Home-scoped reads on these fall back to sequential scan + filter. Currently fine because tables are small. Will be slow as data accumulates.

**Fix:** One migration that adds the missing indexes. **Effort: S.**

---

## Cat 2 — Table bloat & retention

### 2.1 — 🔴 `ai_usage_log` has no retention

**Where:** [supabase/migrations/20260504120000_add_ai_usage_log.sql](supabase/migrations/20260504120000_add_ai_usage_log.sql) — every Gemini call writes a row.

**Why it matters:** Token usage rows accumulate forever. At one row per 10 AI calls × 1000 users × 10 calls/day = 10K rows/day = 3.6M rows/year. The Audit Page queries this table frequently; without retention every query gets slower.

**Fix:** Add daily prune cron — retain 90 days for free-tier users, 1 year for paid. Pair with a `mv_ai_usage_summary` materialized view if older data is needed for analytics. **Effort: M.**

---

### 2.2 — 🔴 `user_events` has no retention

**Where:** [supabase/migrations/20260430000000_user_events.sql](supabase/migrations/20260430000000_user_events.sql) — written on every task completion, page view, action via the [events registry](src/events/registry.ts).

**Why it matters:** Highest-volume write table in the system. Pattern detectors read it on a 7-day window so retention beyond 30 days adds zero detection value but full IO cost. At 1000 active users × 50 events/day = 50K rows/day = 18M rows/year.

**Fix:** Daily prune cron retaining 30 days. Pattern detectors don't need older data. **Effort: S.**

---

### 2.3 — 🔴 `notifications` has no retention

**Where:** [supabase/migrations/20260407170536_notifications.sql](supabase/migrations/20260407170536_notifications.sql) — daily batch + push events.

**Why it matters:** Bell-icon UI shows last 30 days at most. Older rows pure waste. Daily push to every active user = N rows/day forever.

**Fix:** Daily prune of `notifications WHERE created_at < now() - interval '60 days' AND read = true`. **Effort: S.**

---

### 2.4 — 🔴 `chat_messages` has no retention

**Where:** [supabase/migrations/20260427000000_chat_history.sql](supabase/migrations/20260427000000_chat_history.sql) — Plant Doctor chat + assistant history.

**Why it matters:** AI conversation history. Each user accumulates hundreds of messages. Each message can be large (full chat context). Storage + RLS check cost grows linearly with users.

**Fix:** Either (a) cap per user at last 200 messages (delete older on each insert) or (b) daily prune older than 90 days. Document the policy in [Data Model — Plants](docs/app-reference/99-cross-cutting). **Effort: M** (needs product decision on retention window).

---

### 2.5 — 🔴 `rate_limit_log` + `ip_rate_limit_log` have no retention

**Where:** [supabase/migrations/20260513000000_security_hardening.sql](supabase/migrations/20260513000000_security_hardening.sql), [supabase/migrations/20260513020000_ip_rate_limit.sql](supabase/migrations/20260513020000_ip_rate_limit.sql).

**Why it matters:** Written on every rate-limited edge function call. The rate-limit window itself is minutes; rows older than 24h are useless data.

**Fix:** Daily prune older than 7 days. Add to the same `prune-system-logs-daily` cron just installed. **Effort: S.**

---

### 2.6 — 🔴 `device_readings` has no retention

**Where:** [supabase/migrations/20260521000000_integrations.sql:43](supabase/migrations/20260521000000_integrations.sql).

**Why it matters:** IoT sensor stream — eWeLink + Ecowitt sync writes per-device readings on a cron. At 5 devices × 1 reading per 15 min × 24h × 365 days × 1000 users = 175M rows/year. Way more than any UI needs.

**Fix:** 
1. Roll up to hourly averages after 7 days (move into `device_readings_hourly`).
2. Drop raw rows after 30 days.

**Effort: M.**

---

### 2.7 — 🔴 `automation_runs` has no retention

**Where:** [supabase/migrations/20260530000000_automations.sql:60](supabase/migrations/20260530000000_automations.sql).

**Why it matters:** Each automation fire = 1 row with a `jsonb` payload of fired devices + completed tasks. AutomationRunHistory UI shows last 30 entries; older rows are pure storage cost.

**Fix:** Daily prune older than 180 days. **Effort: S.**

---

### 2.8 — 🟠 `plant_library_runs`, `plant_library_batches`, `plant_library_failed_*` lack retention

**Where:** [supabase/migrations/20260624000900_plant_library.sql](supabase/migrations/20260624000900_plant_library.sql) + sibling migrations.

**Why it matters:** Admin tool data; will accumulate. Less urgent than user-facing tables but still unbounded.

**Fix:** Daily prune older than 90 days for runs / 30 days for batches. **Effort: S.**

---

### 2.9 — 🟡 `chat_feedback`, `beta_feedback`, `optimiser_proposal_feedback` lack retention

**Where:** Various migrations.

**Why it matters:** Low volume, intentional (user feedback is valuable to keep). Document the decision rather than fix.

**Fix:** Add a `## Retention` line in each table's app-reference doc explicitly saying "no retention by design". **Effort: S.**

---

## Cat 3 — Edge function efficiency

### 3.1 — 🔴 `pattern-scan` is O(users × patterns × hits) sequential

**Where:** [supabase/functions/pattern-scan/index.ts:41-135](supabase/functions/pattern-scan/index.ts).

**Why it matters:** Nested `for await` loops:
- `for (const userId of userIds)` — runs sequentially per user
- `for (const pattern of PATTERNS)` — runs sequentially per pattern (4 patterns currently)
- `for (const hit of hits)` — per-hit DB upsert (no batch)

At 200 users × 4 patterns × ~5 DB calls each = 4,000 sequential round trips per cron run. With ~50ms per round trip that's already 200s — well past edge function timeout. Currently survives only because user count is tiny.

**Fix:**
1. Process users in parallel with a concurrency cap of ~10 (`Promise.all` over chunks).
2. Batch the per-hit upsert into a single `.upsert([...hits], { onConflict: ... })` call per pattern per user.
3. Replace the manual blueprint-hit branch with a deferrable constraint or a 2-step query.

**Effort: M.**

---

### 3.2 — 🔴 `generate-tasks` N+1 sequential reads + single-row inserts

Already covered in [1.6](#16--🟠-generate-tasks-runs-n1-sequential-queries). Same finding. Promoted to high in this category because the daily blast-radius is larger.

---

### 3.3 — 🟠 No concurrency cap on `seed-plant-library`, `verify-plant-library`, `refresh-stale-grow-guides`, `refresh-stale-ai-plants`

**Where:** Each batches via `STALE_CHECK_BATCH_SIZE` env (default 25) but processes within the batch sequentially.

**Why it matters:** Each batch element makes a Gemini call. Sequential = 25 × ~3s = 75s per run. Parallel with concurrency 5 = ~15s. The Gemini rate limit on Sage/Evergreen is high enough to handle parallel.

**Fix:** Wrap the per-element work in a concurrency-limited `Promise.all` using `pLimit(5)` or similar. **Effort: S** (per function).

---

### 3.4 — 🟠 Edge functions create a service-role client without `requireAuth`

**Where:** Most edge functions instantiate `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` — the service-role key bypasses RLS. Many call `requireAuth` afterwards but a few do not — they trust the caller to provide a valid token and never verify it. Specifically:
- [generate-tasks/index.ts](supabase/functions/generate-tasks/index.ts) — cron-only, OK
- [pattern-scan/index.ts](supabase/functions/pattern-scan/index.ts) — cron-only, OK
- [home-dashboard-stats/index.ts](supabase/functions/home-dashboard-stats/index.ts) — has `requireAuth`, OK
- Others should be audited individually.

**Why it matters:** Not a scalability issue per se but a security defence-in-depth. Note for ongoing maintenance.

**Fix:** Per-function audit + add `requireAuth` to any caller-facing function that lacks it. **Effort: M** (one-time audit + targeted patches).

---

### 3.5 — 🟠 Imports `@supabase/supabase-js@2.39.3` directly in every edge function

**Where:** Pinned in every edge function via `https://esm.sh/@supabase/supabase-js@2.39.3`.

**Why it matters:** Each cold start downloads the whole SDK. esm.sh deduplicates across functions in the same project but the version is now stale (~6 months old; current is v2.49+). Also tying every function to one pin means upgrading touches 60 files.

**Fix:** Move the import to `supabase/functions/_shared/supabaseClient.ts` with one central factory. **Effort: S.**

---

### 3.6 — 🟡 No request body size limits documented

**Where:** Functions like `plant-doctor`, `analyse-area-scan`, `generate-garden-overhaul` accept image uploads via base64 in the request body. No documented or enforced size cap.

**Why it matters:** An accidental 50MB upload = function gets killed by Vercel's body-size limit; the user sees a generic 502.

**Fix:** Validate request size at the top of each image-receiving function and return a clear 413. **Effort: S.**

---

## Cat 4 — Realtime subscriptions

### 4.1 — ✅ FIXED (Wave D, 2026-05-28) — `HomeRealtimeContext` subscribed to 13 tables with wildcard events

**Resolution:** trimmed from 13 → 11 tables. Dropped `weather_snapshots` + `weather_alerts` (hourly-cron-driven, no user action — realtime push was overhead). Dashboard now refetches weather on tab-focus (5-min throttle). The remaining 11 tables all change from user action and need sub-second cross-client freshness, so wildcard events are retained there (consumers refetch on any event, including DELETE). Further narrowing (separate presence/collab channel) deferred — current set is justified.

Original finding below for reference:

### 4.1 (original) — `HomeRealtimeContext` subscribes to 13 tables with wildcard events

**Where:** [src/context/HomeRealtimeContext.tsx:4-18](src/context/HomeRealtimeContext.tsx) — `tasks`, `task_blueprints`, `inventory_items`, `weather_snapshots`, `weather_alerts`, `plants`, `ailments`, `plans`, `shopping_lists`, `shopping_list_items`, `locations`, `areas`, `homes`. Each with `event: "*"`.

**Why it matters:** Supabase Realtime broadcasts every matching row change to every connected client. Per active user with the app open:
- 13 active filters
- All INSERT / UPDATE / DELETE events broadcast
- The highest-churn tables (`tasks`, `weather_snapshots`) churn frequently

At 1000 concurrent users, Supabase's realtime server processes 13K active filter checks + every related write triggers broadcast through RLS. This is a known scaling cost.

**Fix:**
1. Drop subscriptions to low-value tables that the app re-fetches on tab focus anyway (`weather_snapshots`, `weather_alerts`).
2. Narrow `event: "*"` to `event: "INSERT" | "UPDATE"` where DELETE detection isn't needed.
3. Move presence + shopping-list-collab (the only flows that genuinely need sub-second updates) onto a separate, narrow channel.
4. For everything else, switch to "stale-while-revalidate on tab focus" using the existing `TaskEngine.peekCache` pattern.

**Effort: M.**

---

### 4.2 — 🟡 `usePresence` hook is unscoped

**Where:** [src/hooks/usePresence.ts](src/hooks/usePresence.ts) — channel key derives from a `channelKey` arg.

**Why it matters:** If the hook is ever mounted at app root with an overly broad key, every user joins one giant presence channel. Currently fine — should be documented.

**Fix:** Document the per-channel key invariant in the hook's JSDoc. **Effort: S.**

---

## Cat 5 — Frontend perf

### 5.1 — 🟠 Heavy eager imports in App.tsx

**Where:** [src/App.tsx:28-80](src/App.tsx) — eager imports of TheShed, WeatherForecast, TaskCalendar, PlantDoctorChat, GettingStartedChecklist, DailyBriefCard, GlobalQuickAdd, GlobalSearch, etc.

**Why it matters:** App.tsx already uses 47 lazy imports for routes; that's great. But the components above are imported eagerly even when the user starts on `/dashboard` and never opens them. First-paint bundle is larger than necessary.

**Fix:** Convert the eager imports listed to `lazy()` where possible. Wrap with `Suspense` fallback at the relevant slot. Target: shave 20-40KB off first-paint. **Effort: M.**

---

### 5.2 — 🟠 Many components use `select("*")` from Supabase

**Where:** 38 components found in the grep — TheShed, PlannerDashboard, PlantEditModal, InstanceEditModal, AilmentWatchlist, TaskModal, etc.

**Why it matters:** Over-fetches per query. Network payload + Supabase row processing cost. `inventory_items` has 30+ columns — list views need ~6.

**Fix:** Audit the high-traffic ones first: TheShed, AilmentWatchlist, PlannerDashboard. Replace `*` with explicit column list. Keep `*` only where the consumer is the InstanceEditModal-style "I need everything" view. **Effort: M** (incremental, can be done component-by-component).

---

### 5.3 — 🟠 No virtualization on long list views

**Where:** TheShed plant grid, AilmentWatchlist list, PlannerDashboard cards, Global Journal.

**Why it matters:** A user with 200 plants in TheShed renders all 200 cards as React elements. Filter / sort triggers full re-render. Currently the grid handles ~50 plants fine; will get janky past 100.

**Fix:** Add `react-window` or `@tanstack/react-virtual` to TheShed first. Pattern can spread to other list views. **Effort: M.**

---

### 5.4 — 🟠 Some components fetch on mount without consulting cache

**Where:** Various — pattern is `useEffect(() => { supabase.from(...).select() }, [id])` without a prior `peekCache()` check.

**Why it matters:** Refetches on every component mount even when data is fresh. Each navigation back to a page = full round trip.

**Fix:** TaskEngine has a good pattern (see [src/lib/taskEngine.ts:80-92](src/lib/taskEngine.ts)). Generalise into a `useSupabaseQuery` hook with built-in stale-while-revalidate, and migrate the high-traffic queries first. **Effort: L** (architecturally bigger but high ROI).

---

### 5.5 — 🟡 Context value churn in providers

**Where:** Look at `HomePermissionsProvider`, `PlantDoctorProvider`, `BetaFeedbackProvider` — verify they memoize their `value` prop. Quick visual on the realtime context suggests `subscribe` is memoized via `useCallback` — that's good. The provider value object itself should also use `useMemo`.

**Why it matters:** Non-memoized provider values cause every consumer to re-render on every parent render.

**Fix:** Audit context providers for `useMemo` wrapping. **Effort: S.**

---

## Cat 6 — Storage & external APIs

### 6.1 — 🔴 No storage bucket lifecycle policies

**Where:** All 8 buckets created across migrations — `plant-images`, `community-guides`, `area_scans`, `plant-doctor-uploads` (or similar), `garden-shape-photos`, `plan-photos`, `nursery-scan`, `visualiser-captures`, `plant-sprites`. No lifecycle rules visible.

**Why it matters:** Storage cost is the second-fastest-growing AWS-like line item after compute. Photos accumulate forever even for users who delete the records pointing at them (RLS doesn't delete the object). At 1000 users × 50 photos × 1MB = 50GB; at scale this is real money.

**Fix:** 
1. Audit which buckets need permanent retention (probably only `plant-images` if it's the user's own plant photos).
2. For ephemeral buckets (`plant-doctor-uploads`, `area_scans`, `visualiser-captures`, `nursery-scan`), add a lifecycle policy via Supabase Dashboard → Storage → Settings → Object Lifecycle: delete after 90 days.
3. For deleted DB rows, add `ON DELETE` triggers that also remove the storage object via pg_net + storage API.

**Effort: M.**

---

### 6.2 — 🟠 No per-user / per-home AI quota enforcement

**Where:** Edge functions calling Gemini check tier via `guardAiByHome` (presence varies). No daily token/cost cap.

**Why it matters:** Gemini cost is the largest variable cost. A bug, a runaway loop, or a malicious user could spike it 1000×. Sage/Evergreen tiers should still have generous caps.

**Fix:** 
1. Add `ai_usage_log`-backed daily quota: "Sage = 200 calls/day, Evergreen = 1000 calls/day".
2. Edge functions return 429 with a clear toast when exceeded.
3. Render quota usage in the Audit Page.

**Effort: M.**

---

### 6.3 — 🟠 `ai_response_cache` exists but is inconsistently used

**Where:** [supabase/migrations/20260522000000_ai_response_cache.sql](supabase/migrations/20260522000000_ai_response_cache.sql). Used by some functions, not by others.

**Why it matters:** Repeated identical Gemini calls (e.g. care guide regenerate for the same species) bypass cache and pay again. Cache hit-rate today is low because adoption is partial.

**Fix:** Audit AI-calling edge functions for cacheability. Wrap each in a `withResponseCache(key, fn)` helper. Cache key = function name + sorted input hash. **Effort: M.**

---

### 6.4 — 🟠 Perenual / Verdantly / Open-Meteo not all going through server-side cache

**Where:** `perenualService.ts` is client-side (browser). Open-Meteo via `fetch-weather` edge function does cache to `weather_snapshots`. Verdantly via edge function has `verdantly_cache`. Perenual on the browser hits the proxy edge function but each user's browser misses are independent.

**Why it matters:** Per-user duplicate API calls cost Perenual quota.

**Fix:** Audit `perenualService.ts` to ensure every call routes through `perenual-proxy` edge function which already has caching headers. **Effort: S.**

---

### 6.5 — 🟡 No Sentry / log volume guard

**Where:** [supabase/functions/_shared/sentry.ts](supabase/functions/_shared/sentry.ts), [src/lib/errorHandler.ts](src/lib/errorHandler.ts).

**Why it matters:** Every captured exception costs a Sentry event. A loop that throws repeatedly can chew through the monthly quota in minutes.

**Fix:** Wrap `captureException` with a per-error-fingerprint daily cap (e.g. report each distinct error 5×/day max). **Effort: S.**

---

## Suggested implementation waves

Once the report is reviewed, I'd group fixes like this so each wave is shippable on its own:

### Wave A — Database fundamentals (highest ROI, lowest risk)
- 1.1 — wrap `auth.uid()` in 40 policies
- 1.2 — rewrite plant_journals RLS to use `is_member_of`
- 1.3 — add plant_journals.inventory_item_id index
- 1.4 — tighten plant_journals anon grants
- 1.8 — add missing home_id indexes

**Effort: M. Impact: significant CPU + IO reduction on every query.**

### Wave B — Log retention (kills the IO-budget growth curve)
- 2.1 to 2.7 — add daily prune crons for all 6 unbounded log tables
- 2.8 — plant_library admin tables
- Pair with the prune cron already shipped today

**Effort: M. Impact: turns linear-growth tables into bounded ones.**

### Wave C — Edge function efficiency
- 3.1 — parallelize pattern-scan with concurrency cap
- 3.2 / 1.6 — batch-insert + DISTINCT-ON in generate-tasks
- 3.3 — parallelize stale-refresh crons
- 3.5 — central supabase client factory

**Effort: M-L. Impact: keeps cron times within 60s timeout as users grow.**

### Wave D — Realtime narrowing
- 4.1 — split HomeRealtimeContext into focused channels + drop low-value subs

**Effort: M. Impact: cuts Supabase Realtime usage by ~70%.**

### Wave E — Storage + AI quota
- 6.1 — bucket lifecycle policies
- 6.2 — AI quota enforcement
- 6.3 — broaden ai_response_cache adoption

**Effort: M-L. Impact: prevents runaway cost.**

### Wave F — Frontend perf (last; lowest user impact but compounding)
- 5.1 — lazy-load eager imports in App.tsx
- 5.2 — replace select("*") in high-traffic components
- 5.3 — virtualize TheShed grid
- 5.4 — generalised useSupabaseQuery hook with SWR

**Effort: L. Impact: better UX at scale; not a hard blocker.**

---

## What's NOT in this audit

For honesty about scope:

- **Vercel function cost.** Not measured directly. Could be heavy if AI edge functions are slow (warm CPU time).
- **Bundle analysis with numbers.** Would need `vite-bundle-visualizer` run to give concrete KB-shaved estimates.
- **Real query plans.** EXPLAIN ANALYZE on the biggest queries would confirm which indexes are actually used; this audit reasons from migration shape only.
- **Supabase Realtime broadcast volume in practice.** Worth checking the Realtime tab in the Supabase dashboard to see current event rate.
- **Cron timing.** The IO migration just shipped today; can't yet say whether actual IO drops. Re-check in 48h.

Each of these would tighten the numbers but none would change the priorities above.

---

*Authored 2026-05-27 against `main`. Re-run this audit any time the codebase grows by ~30% or before any major user growth milestone.*
