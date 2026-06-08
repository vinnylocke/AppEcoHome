# Plan — Golden Hour decouple from pending-tasks

## Problem

Even after fixing the sunset calc (`golden-hour-sunset-bug.md`), Golden Hour only fires for homes that already have pending tasks today. The block iterates `homeIds` which is derived from `tasksByHome`. Homes with zero pending tasks today get zero Golden Hour push, despite valid lat/lng.

User-facing docs ([Voice in chat / Weather Intelligence](../../documentation/10-weather-intelligence.md)) say Golden Hour is sent "when conditions are perfect for gardening" — no mention of needing pending tasks. So the dependency is a bug, not a feature.

## Fix

In `daily-batch-notifications/index.ts`:

1. **Fetch all active homes with lat/lng up front** — independent of pending tasks. Build `allHomeIds`, then fetch `homeMembers` against that broader list.
2. **Remove the two early-exits** that return when there are no pending tasks. Even with zero tasks we still want to run Golden Hour.
3. **Keep `daily_batch` logic gated on pending tasks** — the existing per-member loop already checks `tasksByHome[member.home_id]` so it self-gates without an early-exit.
4. **Move the Golden Hour homes fetch** to use the same `allHomes` list (rather than re-querying with `homeIds`).
5. **Add an idempotency guard** so re-running the cron / manual invocations don't double-queue Golden Hour. Mirror the daily_batch `alreadySent` check.

## Files

| File | Change |
|------|--------|
| `supabase/functions/daily-batch-notifications/index.ts` | Restructure as above |

## Tests

No existing unit test covers `daily-batch-notifications` end-to-end (it has side-effecting DB calls). The sunset-calc test stays green. We'll smoke-test by invoking the function manually post-deploy and confirming a `golden_hour` row appears for vinny's home (which has zero pending tasks today).

## Deploy

Same single-function deploy with the magic flags we just discovered:
`supabase functions deploy daily-batch-notifications --no-verify-jwt --use-api --yes`

## Risks

- Sending Golden Hour to homes without pending tasks slightly increases notification volume. That's intentional and matches the documented behaviour.
- Idempotency guard prevents duplicates if the cron retries or manual invocations happen — important because we just learned (from the 7-cluster of weekly_overview on 2026-06-04) that manual triggering is real.
