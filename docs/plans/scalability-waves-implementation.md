# Plan — Scalability Waves A / B / C Implementation

Driven by [docs/scalability-audit.md](../scalability-audit.md). Three waves shipped sequentially so each is deployable and can be re-rated before the next.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md`
- `docs/app-reference/99-cross-cutting/19-rls-patterns.md`
- `docs/app-reference/99-cross-cutting/26-pattern-engine.md`

## Wave A — Database fundamentals

Single migration: `supabase/migrations/<ts>_scalability_wave_a.sql`.

**Steps in execution order:**
1. **Additive: missing indexes** (audit 1.3 + 1.8) — `plant_journals.inventory_item_id`, plus `home_id` indexes on `chat_feedback`, `visualiser_captures`, `garden_zones`, `release_notes`, `home_climate`. All `IF NOT EXISTS` and concurrent-safe.
2. **Tighten plant_journals anon grants** (audit 1.4) — revoke `TRUNCATE`, `REFERENCES`, `TRIGGER` from anon. Keeps SELECT/INSERT/UPDATE/DELETE because RLS gates them.
3. **Rewrite plant_journals RLS** (audit 1.2) — drop the UNION-subquery policy, replace with `is_member_of(home_id)` function call.
4. **Rewrite 40 RLS policies to use `(SELECT auth.uid())`** (audit 1.1) — bulk mechanical change. Each policy is dropped + recreated with the wrapped form.

**Testing:** `supabase migration up` locally → run E2E smoke test (`npm run test:e2e -- --grep "auth"`) to confirm policy semantics unchanged.

## Wave B — Log retention

Single migration: `supabase/migrations/<ts>_scalability_wave_b.sql`.

Adds one cron `prune-app-logs-daily` running at 04:50 UTC (5 min after the existing system-logs prune). Single SQL block deletes from each table by retention window:

| Table | Retention | Predicate |
|-------|-----------|-----------|
| `user_events` | 30 days | `created_at < now() - '30 days'::interval` |
| `ai_usage_log` | 90 days | `created_at < now() - '90 days'::interval` |
| `notifications` | 60 days | `created_at < now() - '60 days'::interval AND read = true` |
| `chat_messages` | 365 days | `created_at < now() - '365 days'::interval` (1-year window matches likely chat retention norms; can be tightened later) |
| `rate_limit_log` | 7 days | `window_start < now() - '7 days'::interval` |
| `ip_rate_limit_log` | 7 days | `window_start < now() - '7 days'::interval` |
| `device_readings` | 30 days | `taken_at < now() - '30 days'::interval` |
| `automation_runs` | 180 days | `triggered_at < now() - '180 days'::interval` |
| `plant_library_runs` | 90 days | `started_at < now() - '90 days'::interval` |
| `plant_library_batches` | 30 days | `submitted_at < now() - '30 days'::interval AND status IN ('processed', 'failed')` |

First run catches the backlog; subsequent runs are trivial.

**Testing:** `supabase migration up` locally + manually invoke the cron block to verify each DELETE is valid SQL against the table schema.

## Wave C — Edge function efficiency

Three code changes, each in its own commit:

1. **`generate-tasks` rewrite** ([supabase/functions/generate-tasks/index.ts](../../supabase/functions/generate-tasks/index.ts))
   - Replace N+1 `lastTask` lookup with a single query using `DISTINCT ON (blueprint_id) blueprint_id, due_date ORDER BY blueprint_id, due_date DESC`.
   - Replace per-task `.insert()` loop with batched `.insert(tasksToInsert)` in chunks of 500. Keep the unique-constraint error swallow.

2. **`pattern-scan` parallelization** ([supabase/functions/pattern-scan/index.ts](../../supabase/functions/pattern-scan/index.ts))
   - Process users in parallel with concurrency cap of 10 via a small `pLimit`-style helper in `_shared/concurrency.ts`.
   - Replace the per-hit upsert loop with a single batched `.upsert([...hits], { onConflict })` per (user, pattern).
   - Replace the blueprint-hit manual check-or-insert branch with a single upsert using the partial-unique-index pattern (`onConflict: 'user_id,pattern_id,blueprint_id'`, with a partial index ensuring no inventory_item_id collisions).

3. **Central supabase client factory** — new `supabase/functions/_shared/supabaseClient.ts` exporting `serviceClient()` so future SDK version bumps touch one file instead of 60.

**Testing:**
- `npx tsc --noEmit` (covers TS).
- `npm run test:functions` (Deno tests).
- Deploy edge functions locally with `supabase functions serve generate-tasks` + `pattern-scan` and manually invoke once each.

## Deployment

Three separate deploys so each can be reverted independently:
1. After Wave A: `npm run deploy -- --bump 1`
2. After Wave B: `npm run deploy -- --bump 1`
3. After Wave C: `npm run deploy -- --bump 1`

## App-reference docs to update

- `99-cross-cutting/11-cron-jobs.md` — add `prune-app-logs-daily` row (Wave B).
- `99-cross-cutting/19-rls-patterns.md` — document the wrapped `(SELECT auth.uid())` convention as the standard (Wave A).
- `99-cross-cutting/10-edge-functions-catalogue.md` — update generate-tasks + pattern-scan entries (Wave C).
- `99-cross-cutting/26-pattern-engine.md` — note the concurrency-capped parallel scan.

## Risks

- **Wave A**: RLS rewrite is mechanical; verified by re-running E2E auth smoke. Worst case revert the migration.
- **Wave B**: First prune run may take time on backed-up data; mitigated by 04:50 UTC quiet window. Cron is idempotent.
- **Wave C**: Edge function changes have most risk. Will deploy, then watch cron run logs for 24h before declaring done.

## Process

Sequential per wave: implement → typecheck/tests → local migration → review with user → push to remote → deploy. Re-check IO budget chart after Wave B is live.
