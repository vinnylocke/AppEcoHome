# Garden Brain — Phase 1: Adaptive Care (implementation plan)

**Date:** 2026-07-10 · **Parent strategy:** [`garden-brain-strategy.md`](./garden-brain-strategy.md) (greenlit). **This plan awaits approval before any code.**

**Goal:** schedules that learn from the soil. A nightly deterministic reconciler joins the measured reality (`soil_moisture_profiles`, readings) with the intended plan (watering blueprints/automations) and the plants' needs (`plant_sensor_ranges`) → concrete, one-tap, **verified** adjustments.

## App-reference consulted
- [`99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md) — devices, readings, soil profiles, automations.
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — blueprints (`frequency_days`), ghosts.
- [`99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md) — `compute-soil-profiles` (daily) chain.
- [`99-cross-cutting/17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md) + [`26-pattern-engine.md`](../app-reference/99-cross-cutting/26-pattern-engine.md), [`02-dashboard/17-home-main.md`](../app-reference/02-dashboard/17-home-main.md).

## Verified foundations (no schema guesswork)
- `soil_moisture_profiles` (PK `device_id`): **`area_id`** (already mapped!), `drydown_rate_pct_per_day`, `retention_class`, **`drydown_by_weather` jsonb** (`hot_dry`/`mild`/`cool_wet` rates), `watering_response` (rewet stats), `sample_segments`, `confidence 0..1`. Rebuilt daily by `compute-soil-profiles` (deterministic).
- `plants.soil_moisture_min/max` (+ EC/temp) per instance's plant row; AI/library backfilled daily.
- `device_readings` full time-series (`data.soil_moisture`, `recorded_at`).
- Watering blueprints: `task_blueprints (task_type='Watering', frequency_days, area_id, location_id, paused_until, is_archived)`; automations cover areas via `automation_actions`/devices.
- `ai_feedback` + `logEvent` for accept/dismiss signals.

## Design

### 1. Pure core — `_shared/adaptiveCare.ts` (fully Deno-tested)
Per home, per **area with (a) a soil profile, (b) planted instances, (c) an active watering blueprint or automation**:

- **Target band**: median of the area's planted plants' `soil_moisture_min/max`; fallback 30–60% when unknown.
- **Reality stats** (last 14 days of readings): `pctTimeBelowFloor`, `pctTimeAboveCeiling`, `minBeforeRewets` (from `watering_response` rewet segments), typical post-water peak.
- **`daysToFloor`** = (typicalPeak − floor) / drydown rate, using the **forecast-matched** `drydown_by_weather` rate (hot week → `hot_dry` rate) — this is what makes it smarter than any static schedule.
- Proposal rules (confidence-gated: profile `confidence ≥ 0.5`, `sample_segments ≥ 3`, ≥ 10 days of readings):
  - **Tighten**: `frequency_days > daysToFloor × 1.25` AND `pctTimeBelowFloor > 15%` → suggest `clamp(round(daysToFloor), 1, freq−1)`.
  - **Stretch**: `frequency_days < daysToFloor × 0.6` AND `pctTimeBelowFloor < 2%` AND min never within 10pts of floor → suggest `round(daysToFloor × 0.8)` (cap +3 days per step).
  - **Stress risk** (no blueprint change): hot-week `daysToFloor` < days until next scheduled watering → escalate (complements the shipped weather-task pipe; emitted as an insight, not a task, to avoid double-tasking).
  - **Create routine** (user addition 2026-07-10): area has a soil profile + planted instances but **no active watering blueprint AND no watering automation covering it** → when the sensor shows real need (`pctTimeBelowFloor > 15%` or a sub-floor reading in the window), propose creating a watering blueprint at `clamp(round(daysToFloor × 0.9), 1, 14)` days. Guards: the two-sided coverage check prevents double-nagging valve owners, and "shows real need" prevents proposing routines for beds rain keeps healthy. (The existing `soilDrydownWatering` pattern flags missing *automation* in insights — different action, different surface; noted in docs.)
  - **In-range confirmation**: everything healthy → a low-priority "on track" item (good-news feed for the briefing phase; stored, not pushed).
- Output: typed `CareAdjustment` proposals with an **evidence block** (all numbers above) — copy is deterministic templates in v1 (no Gemini in the loop; the briefing phase adds prose). Verification (below) needs no AI either.

### 2. Storage — migration `care_adjustments`
```sql
CREATE TABLE care_adjustments (
  id uuid PK, home_id uuid NOT NULL, area_id uuid, blueprint_id uuid NULL,
  kind text CHECK (kind IN ('tighten_watering','stretch_watering','stress_risk','in_range','create_watering_routine')),
  current_frequency_days int NULL, suggested_frequency_days int NULL,
  evidence jsonb NOT NULL,             -- the stats + rates used
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','applied','dismissed','superseded','verified_good','verified_mixed')),
  created_at/applied_at/verified_at timestamptz, verification jsonb NULL
);
```
RLS: members SELECT + UPDATE (apply/dismiss own home); INSERT service-role only. **Data-API grants per the 2026-10 rule** (SELECT/UPDATE to authenticated). Dedupe: partial unique index on `(home_id, area_id, kind) WHERE status='proposed'` — one open proposal per area/kind; a new nightly result for the same key **supersedes** the stale one.

### 3. Runner — new edge fn `garden-brain-reconcile` + cron
Daily, scheduled ~30 min after `compute-soil-profiles` (cron migration, same pattern). Fetch inputs per home → run the pure core → upsert proposals (supersede rule) → **verify** applied ones: any `applied` adjustment ≥ 7 days old gets re-measured (same reality stats on the post-change window) → `verified_good` ("in range 12/14 days since the change") or `verified_mixed`, with the delta stored in `verification`. Optional single notification when a NEW tighten/stress proposal appears (respects a new `adaptiveCare` notification pref; default on, master-gated).

### 4. UI — `AdaptiveCareCard` (dashboard) + apply flow
- Card on HomeMain (both densities), max 2 proposals + "N more": headline ("Raised Bed A dries faster than your schedule"), the evidence in gardener words + a compact sparkline-free stat line, **Apply** / **Dismiss**.
- **Apply** = client updates `task_blueprints.frequency_days` (the same write the routine editor does; permissions enforced by existing RLS) + `status='applied'`, `logEvent(care_adjustment_applied)` + `ai_feedback` signal. Ghosts regenerate automatically from the new frequency — **no task/count code changes** (Phase-1 deliberately never writes to `tasks`; zero dashboard-count risk).
- **Apply (create_watering_routine)** = mirrors AddTaskModal's recurring create exactly: insert the `task_blueprints` row (title "Watering — {area}", `frequency_days` = suggested, `start_date` = today, area/location ids, `inventory_item_ids` = the bed's planted instances) + the first task + `BlueprintService.generateBlueprintTasks` — the one Phase-1 path that creates tasks, reusing the battle-tested routine-creation flow verbatim (ghost/count behaviour identical to a user-created routine).
- **Dismiss** = `status='dismissed'` + feedback signal; the supersede rule stops nagging (same area/kind won't re-propose for 14 days — cooldown in evidence check).
- Verified items render a quiet "✓ Since the change…" line for a week (trust-building), then fade.
- Beginner sees plain language; Experienced can expand the evidence block (raw numbers). Same card, progressive disclosure.

### 5. Tier gating (decision)
Adaptive care = **Sage/Evergreen** (per strategy; server skips homes below tier, card hidden). Sensors are the practical gate anyway; Sprout/Botanist see an upsell hint on the integrations page only (no dark patterns on the dashboard).

## Files
**Server:** `_shared/adaptiveCare.ts` (new, pure), `garden-brain-reconcile/index.ts` (new), cron migration, `care_adjustments` migration (+ grants), `notificationPrefs` +`adaptiveCare` key.
**Client:** `src/components/home/AdaptiveCareCard.tsx` (new; testids `adaptive-care-card`, `adaptive-care-apply`, `adaptive-care-dismiss`), HomeMain mount, GardenerProfile pref row, snapshot cache entry (offline read, Phase-2 pattern).
**Docs:** new `99-cross-cutting/33-garden-brain.md` (+ index row), `11-cron-jobs.md`, `09-data-model-integrations.md`, `17-home-main.md`, `02-notifications-tab.md`, e2e-test-plan rows, this plan's delivered record.

## Tests (mandatory)
- **Deno `adaptiveCare.test.ts`**: target-band aggregation (multi-plant median, fallback); tighten/stretch/stress/in-range rule gates incl. confidence gates and forecast-matched drydown selection; supersede/cooldown logic; verification maths (good/mixed).
- **Deno runner shape test** (mock db, fanout-style): proposals upserted, stale superseded, applied→verified transition.
- **Vitest**: card renders proposal/verified states; apply calls blueprint update + status change (mocked supabase).
- **Live verification** (local): seed a profile + ranges + a mismatched blueprint → run reconcile → proposal appears → apply → frequency changed → re-run with post-change readings → verified line. Confirm ghosts follow the new frequency and dashboard counts are untouched.

## Risks
- **Sparse/low-confidence data** → hard gates (above) + `unknown` retention class excluded; better silent than wrong (Experienced-persona trust).
- **Oscillation** (tighten one week, stretch the next) → 14-day cooldown per (area, kind) + supersede, and stretch/tighten thresholds deliberately non-adjacent (1.25× vs 0.6×).
- **Multi-plant beds with conflicting ranges** → median band + note in evidence ("ranges vary across 3 plants — using the middle").
- **No writes to `tasks`** in this phase — the recurring source of count regressions is structurally avoided.

## Rollout
One deploy (migrations first locally). Live-verify the full loop before finishing. Phase 2 (Head Gardener briefing) follows in its own plan.

## Delivered (2026-07-10)

Shipped as planned + the user-added `create_watering_routine` kind. Reference doc landed as **`99-cross-cutting/39-garden-brain.md`** (33 was taken).

**Live-verified end-to-end on the local stack** (service-role-seeded profile: 15%/day drydown, 0.85 confidence + 14-day suffering sawtooth readings on the seeded Raised Bed A sensor; test1 = Evergreen owner):
- Reconcile → **`tighten_watering` proposed: every 3 → every 2** (daysToFloor 1.7, 33.3% below floor — exactly the hand-computed expectation), notification sent (1).
- **Card** renders on `/dashboard?view=home`: headline, "Change to every 2d", "See the numbers" evidence expands.
- **Apply** via the card → blueprint `frequency_days` 3→2, status `applied`.
- Backdated `applied_at` 8 days → second reconcile → **verification pass ran** (`verified: 1`) → `verified_mixed` with honest numbers (post-change readings were the same suffering sawtooth — the system correctly refused to claim success). Second run proposed nothing new (freq 2 vs daysToFloor 1.7 sits inside the non-adjacent thresholds → no oscillation).
- Cleanup restored the blueprint + removed all seeded artifacts.

**Tests:** Deno `adaptiveCare.test.ts` AC-001..014 (band medians, forecast-matched hot_dry rate, cooldown, all confidence gates, tighten incl. cooldown, stretch incl. non-adjacent-threshold neutrality, stress-risk, create-routine incl. automation-covered and no-need suppression, verification verdicts, multi-plant medians) — all green first run. Client covered by the live loop + HOME-010/011 e2e plan rows (spec pending).

**Ops note:** the local edge runtime only enumerates function folders at container CREATE — a new function 404s until `supabase stop && start` (restart is not enough). Data volumes persist.
