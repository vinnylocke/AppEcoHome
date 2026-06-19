# Automations: "mute until next eligible" instead of logging every skip

## Goal (user request)

The 28.0031 collapse fix stopped the run-history *flood*, but a rate-limited automation still
re-evaluates on every event tick and bumps a "retried N×" counter — so the single row reads
"Rate limited · retried 41,732×", which is meaningless noise.

Be cleverer: **we already know the exact time the automation can next fire** (when its oldest
in-window fire ages out). So when we hit the run-limit, compute that time, store it, and **stop
re-evaluating until then** — no per-tick work, no skip spam. Only check earlier if the automation
is **amended**. If we recheck at that time and it's somehow still limited, recompute the next time
and defer again.

End state: the run history shows **one** row — "Run limit reached — next try ~13:35" — not a
counter that climbs forever.

## How it works today (after 28.0031)

- `evaluate-automations` runs per `device_readings` insert (~1 s) + a 15-min sweep.
- `shouldFire` is repeat-while-true and ignores `condition_was_true`.
- When over the run-limit it writes/collapses a `skipped_rate_limited` row with an `attempts`
  counter. The collapse stops *new rows*, but the counter still increments every tick → noise.

There is a precedent for "gate re-evaluation with a timestamp": **weather deferral** uses
`automations.defer_until` (migration `20260725000000_hybrid_weather_defer`). We mirror that pattern
for rate-limiting with a separate column (the two states are independent).

## App-reference files consulted

- `docs/app-reference/07-management/06-integrations-automations.md` — run-limit, run-status
  visibility, repeat-while-true, hybrid engine, and the `defer_until` weather-defer precedent.
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` — `automations` columns +
  `defer_until` shape.
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — engine scopes/cadence.

## Files that will change

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_automation_rate_limited_until.sql` | Add `automations.rate_limited_until timestamptz NULL`. Add a `BEFORE UPDATE` trigger that nulls it when the **definition** changes (trigger_logic / run_limit_count / run_limit_window_hours / sensor_cooldown_minutes / is_active off→on) so any amendment re-checks immediately, via any client path. |
| `supabase/functions/_shared/runLimit.ts` | Add pure `nextEligibleAt(firedDescIso, limit, windowHours)` → the timestamp the limit next clears. Drop `nextSkipAttempts` (counter retired); keep `shouldCollapseRateLimitSkip`. |
| `supabase/functions/evaluate-automations/index.ts` | (1) **Mute gate** at the top of `processOne`: if `rate_limited_until` is set and `now < it`, return `{ decision: "rate_limited_muted" }` immediately — no condition eval, no count query, no logging. (2) When the run-limit trips: compute `nextEligibleAt`, set `automations.rate_limited_until`, and write **one** `skipped_rate_limited` row carrying `trigger_reason = { summary: "Run limit reached", next_eligible_at }` (update the existing skip row if the latest run is already one — for the rare recheck/recompute case). (3) On a real fire, clear `rate_limited_until = null`. |
| `supabase/tests/runLimit.test.ts` | Replace the `nextSkipAttempts` tests with `nextEligibleAt` tests (incl. "fewer fires than limit → null"). |
| `src/components/integrations/AutomationRunHistory.tsx` | For `skipped_rate_limited`, render "Run limit reached — next try {local time}" from `trigger_reason.next_eligible_at`. Remove the "retried N×" display. |
| `src/components/integrations/AutomationCard.tsx` | (Optional) when `rate_limited_until` is in the future, show a "next ~{time}" hint on the run-limit chip. |
| `docs/app-reference/07-management/06-integrations-automations.md` | Update the run-limit + run-status-visibility sections to describe mute-until (supersedes the attempts counter). |

## Exact approach

1. **Schema** — `rate_limited_until timestamptz` on `automations` (nullable; NULL = not muted).
   Trigger `clear_rate_limit_on_change()` nulls it when definition columns change so amendments
   re-check (robust against every client edit path, incl. the builder + the active toggle).
2. **Mute gate** — first thing in `processOne`: `if (rlUntil && now < rlUntil) return muted`. This
   kills the per-tick work + logging while rate-limited. (`condition_was_true` bookkeeping is
   vestigial — `shouldFire` ignores it — so skipping it is fine.)
3. **Entering the muted state** — when the run-limit gate trips: `nextEligibleAt(firedDesc, limit,
   windowHours)` = the `limit`-th most-recent in-window fire + window. Store it in
   `rate_limited_until`; write ONE skip row with `next_eligible_at`. (Reuse
   `shouldCollapseRateLimitSkip` to update rather than insert if the latest run is already a skip —
   only relevant on a boundary recheck.)
4. **Recheck at the boundary** — once `now ≥ rate_limited_until`, the gate re-runs normally. Usually
   the oldest fire has just aged out → fires. If extra fires snuck in (e.g. a manual run), it's
   still limited → recompute `nextEligibleAt`, push `rate_limited_until` forward, update the row.
5. **On fire** — clear `rate_limited_until`.
6. **UI** — run history shows the single informative row; optional card hint.

## Relationship to 28.0031

This **supersedes** the `attempts` counter shipped in 28.0031 — the counter is removed and replaced
by `next_eligible_at`. The collapse-vs-insert decision (`shouldCollapseRateLimitSkip`) stays. The
backlog cleanup already ran, so no new cleanup migration is needed.

## Risks / edge cases

- **Clock vs window drift:** `rate_limited_until` is computed from real fire timestamps + the
  window, so it's exact. A boundary recheck recomputes if needed — no infinite mute.
- **Condition goes false during mute:** harmless. A past `rate_limited_until` doesn't block; the
  next rising edge re-evaluates and (if under the limit) fires.
- **Amendment trigger scope:** only nulls on definition changes, never on the engine's own
  bookkeeping writes (`last_fired_at`, `rate_limited_until`, `condition_was_true`) — so the mute
  isn't self-cleared.
- **Manual "Run now"** (via `run-automations`) can add a fire during the mute; the boundary
  recheck's recompute absorbs it.
- **Event invocations still happen** (the `device_readings` trigger still calls the function), but
  `processOne` now returns in O(1) with zero writes while muted — which is the actual cost the user
  is hitting.

## Tests / test docs

- `supabase/tests/runLimit.test.ts` — `nextEligibleAt` cases (limit hit, fewer-than-limit → null,
  window math, unlimited → null).
- Engine mute-gate / recompute paths aren't pure (DB-coupled) — covered by the Deno helper tests +
  manual verification on the live automation. No new Playwright spec (needs live sensor events).

## Ships via

Standard **web deploy** (`npm run deploy`) — edge function + frontend + migration. No APK.

## Open question

The amendment-clears-mute rule: I plan a **DB trigger** (robust — covers every edit path
automatically). Happy instead to clear it client-side in the builder save + active toggle if you'd
rather avoid a trigger — but the trigger is my recommendation. OK to proceed with the trigger?
