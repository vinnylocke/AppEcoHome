# Fix: rate-limited automations flood the run history

## Problem (reported)

1. A sensor automation that's hit its run-limit logs a `skipped_rate_limited` entry **on every
   evaluation tick**, producing "loads of entries at the same times" that bury the actual
   successful runs (the history UI only shows the last 10).
2. User has it set to **2 times / 24 h** but feels it behaves like once and "won't run when it
   should." (See "Issue #2" below — partly a consequence of #1, partly a semantics question.)

## Root cause (#1 — confirmed)

Three recent changes interact badly:

- **Visible rate-limit** (`443a8fb`): when over the run-limit, the engine *inserts* a
  `skipped_rate_limited` row into `automation_runs` so the skip is visible.
- **Repeat-while-true firing** (`shouldFire`, `_shared/conditionTree.ts`): now re-fires every
  cooldown while the condition stays true. Critically, `shouldFire` **ignores `_wasTrue`**
  (line 243) — `condition_was_true` no longer gates the decision.
- **Hybrid event-driven engine** (`b10001b`): `evaluate-automations` runs on *every*
  `device_readings` insert (~1 s), not just on a cron tick.

In [`evaluate-automations/index.ts`](../../supabase/functions/evaluate-automations/index.ts) the
rate-limit branch sets `condition_was_true = true` with the comment *"Mark the edge consumed so we
don't log a skip every tick."* That guard is now a **no-op** — `shouldFire` doesn't look at it.
So once an automation is rate-limited:
- rate-limited skips do **not** update `last_fired_at`;
- `shouldFire` therefore returns `true` on every tick once cooldown has elapsed since the last
  *real* fire;
- every event tick → fire decision → rate-limited → **new `skipped_rate_limited` row** → flood.

## Issue #2 (semantics — needs a one-line confirmation from the user)

The run-limit is a **rolling-window cap**, not a scheduler. With `run_limit_count = 2`,
`run_limit_window_hours = 24` and repeat-while-true firing, a "water while dry" rule fires twice
(cooldown apart, e.g. ~60 min), then is capped for the rest of the rolling 24 h. That's the
designed behaviour. Two things make it *look* broken today:
- the flood (#1) hides the two real successes, so it looks like nothing ran;
- a rolling 24 h window isn't the same as "2 evenly-spaced waterings per day."

**Fixing #1 should make the real behaviour visible.** If after that the user wants different
semantics (calendar-day reset, or a minimum gap rather than a hard cap), that's a follow-up — see
the open question. No #2-specific code change is in this plan until confirmed.

## App-reference files consulted

- `docs/app-reference/07-management/06-integrations-automations.md` — run-limit + run-status
  visibility + repeat-while-true + hybrid-engine sections (the authoritative description of all
  three interacting changes).
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — engine scopes/cadence (read for context).

## Files that will change

| File | Change |
|------|--------|
| `supabase/functions/evaluate-automations/index.ts` | Collapse consecutive rate-limited skips: if the automation's most recent run is already `skipped_rate_limited`, **update** that row (refresh timestamp, bump an `attempts` counter in `trigger_reason`) instead of inserting a new one. Remove the dead `condition_was_true = true` write + stale comment. |
| `supabase/functions/_shared/runLimit.ts` | Add pure helper `shouldCollapseRateLimitSkip(lastStatus)` + `nextSkipAttempts(prev)` so the decision is unit-testable. |
| `supabase/tests/runLimit.test.ts` | Add Deno tests for the new helpers. |
| `src/components/integrations/AutomationRunHistory.tsx` | For `skipped_rate_limited` rows, render the reason as "Run limit reached · retried N×" (not "Fired because"), so the collapse is transparent. |
| `supabase/migrations/<ts>_collapse_rate_limited_runs.sql` | **One-time cleanup**: delete all but the most recent `skipped_rate_limited` row per automation, so existing buried histories are unclogged immediately. Never touches fired/other statuses. |
| `docs/app-reference/07-management/06-integrations-automations.md` | Update the "Run limit" + "Run-status visibility" sections to document the collapse-into-one-row behaviour. |

## Exact approach

1. **Engine collapse** — in the rate-limit branch, read the latest `automation_runs` row for the
   automation. If its status is `skipped_rate_limited`, `update` it (`triggered_at`/`completed_at`
   = now, `trigger_reason = { summary: "Run limit reached", attempts: prev+1 }`). Otherwise insert
   one fresh skip row (`attempts: 1`). A real fire breaks the chain, so between any two real runs
   there is **at most one** rate-limited row. Drop the no-op `condition_was_true` write.
2. **Pure helpers** in `runLimit.ts` for the collapse decision + attempts increment; covered by
   `runLimit.test.ts`.
3. **UI** — show "retried N×" on the Rate-limited chip row; don't prefix skip reasons with
   "Fired because".
4. **Cleanup migration** — collapse the existing backlog so the user sees real runs straight away.

## Risks / edge cases

- **Concurrency:** two near-simultaneous event invocations could both insert a first skip row
  before either collapses (a brief race). Acceptable — the next tick collapses onto the latest, so
  the flood is still bounded to ~1–2 rows, not hundreds. (A DB unique/partial index could enforce
  it strictly, but that's heavier than warranted.)
- **Cleanup migration deletes rows:** only `status = 'skipped_rate_limited'`, keeping the most
  recent per automation. Real runs (`success`/`partial`/`failed`/weather/no-tasks) are untouched.
  Applied locally first, pushed on explicit confirmation per the migration workflow.
- **Visibility preserved:** the rate-limit is still shown (one collapsed row with an attempt
  count), so the `443a8fb` "make it visible" intent is kept — just not flooded.

## Tests / test docs

- `supabase/tests/runLimit.test.ts` — new cases for `shouldCollapseRateLimitSkip` + `nextSkipAttempts`.
- `docs/e2e-test-plan/` — add a note to the integrations/automations surface row (run-history no
  longer floods). No new Playwright spec (needs live sensor events; covered by the Deno + manual).

## Ships via

Standard **web deploy** (`npm run deploy`) — it deploys edge functions + frontend + the cleanup
migration. (Unlike the native voice fix, no APK rebuild.)

## Open question (Issue #2)

After the flood fix, do you want "2 times / 24 h" to keep meaning **"at most 2 fires in any rolling
24 h"** (current design — I'll just fix the flood), or should it mean something else, e.g. a
**calendar-day cap that resets at midnight**, or a **minimum gap between waterings**? I'll hold any
#2 code change until you confirm — the flood fix stands on its own.
