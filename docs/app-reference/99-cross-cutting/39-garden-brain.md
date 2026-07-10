# Garden Brain — Adaptive Care (Phase 1) + the Daily Brief (Phase 2)

> Rhozly learns YOUR garden. **Phase 1 (adaptive care):** a nightly deterministic reconciler joins measured soil reality (sensor drydown profiles + readings) with plant needs (`plants.soil_moisture_min/max`) and the home's watering coverage (blueprints + valve automations), then proposes one-tap, **verified** schedule adjustments on the dashboard. **Phase 2 (Daily Brief):** every signal — tasks, care adjustments, weather, windows, failed automations, insights, batteries, and the good news — assembled into ONE ranked morning brief; Sage/Evergreen get the AI head-gardener voice (tier model ladders), everyone else the same brief with template copy. Strategy: [`docs/plans/garden-brain-strategy.md`](../../plans/garden-brain-strategy.md); plans: [`phase 1`](../../plans/garden-brain-phase1-adaptive-care.md) · [`phase 2`](../../plans/garden-brain-phase2-head-gardener-brief.md).
>
> **Relationship to the Head Gardener AI Manager** (`synthesize-garden-brief` / `garden-manager-report` / `head-gardener-chat`, Evergreen): that suite is the standing *strategy* layer (goals, Estate Report); the Daily Brief is the Garden Brain's *operational* morning note. When a `garden_brief` (goals) row exists, the Daily Brief's AI prose honours it.

## Phase 2 — the Daily Brief

- **Pure core** `_shared/dailyBrief.ts`: `assembleBrief(signals)` — deterministic scoring table (overdue 100 > care proposals 90 > weather 80 > windows 70 > failed automations 65 > insights 50 > battery 40), items capped at 6, each with a `reason` + deep-link `route`; good news (≤2 lines) from `verified_good`, `in_range` areas, completion streaks (`verified_mixed` is deliberately NOT celebrated); template summary for the non-AI tiers; `prependBriefToDigest` (first sentence only; absent brief → digest body unchanged).
- **Generator** `generate-daily-brief` (cron 04:30 UTC, after the 03:45 reconcile; activity-filtered — homes with member `user_events` in 7 days): every eligible home gets the deterministic brief; **Sage/Evergreen owners** additionally get the AI voice via `modelsForTier(tier)` (Evergreen's 3.1-pro ladder stays exclusive) — the model may only REWRITE summary/reasons (same item count/order enforced; shape mismatch or any error → deterministic fallback, so a brief always exists). Grounded on `buildUserContext` + `garden_brief.goals`; metered via `logAiUsage` (ok/fallback). Upsert on `(home_id, brief_date)`.
- **Regenerate** (`{ homeId, regenerate: true, feedback? }`): authenticated member + **Sage+ (403 below)** + `enforceRateLimit`; feedback threads into the prompt (the regenerate-with-feedback grounding requirement).
- **Storage** `daily_briefs` (PK `(home_id, brief_date)`; members SELECT via RLS + grant; service-role writes). `generated_by: 'deterministic'|'ai'`, `model`, `tier` recorded per row.
- **Card** `src/components/home/GardenBrainBriefCard.tsx` ("Your daily brief", top of HomeMain, both densities; the existing `DailyBriefCard.tsx` is the unrelated legacy dashboard hero): summary + ranked items (simple: top 3; detailed: all + reasons), good-news block, 👍/👎 → `ai_feedback` (`function_name: 'generate-daily-brief'`, `target_kind: 'daily_brief'`), 👎 opens a comment box; **Refresh only renders on AI briefs**. Snapshot-cached (`rhozly:snap:v1:daily-brief:{homeId}`); shows nothing when today's/yesterday's brief is absent. testids: `daily-brief-card/-summary/-item-{kind}/-goodnews/-thumbs-up/-thumbs-down/-refresh/-feedback-input`.
- **Chat**: `get_daily_brief` read tool (auto, sprout+ — reads the stored row, no AI call) grounds "what should I do today?".
- **Morning push**: `daily-batch-notifications` prepends the brief's first sentence to the existing task digest (absent → unchanged; UTC-today key — the 04:30 generator precedes any 08:00-local digest).
- **Ops**: cron functions MUST be in `supabase/config.toml` `verify_jwt = false` — `garden-brain-reconcile` was added retroactively (its first prod cron would have 401'd) alongside `generate-daily-brief`.

---

## Quick Summary

```
compute-soil-profiles (03:00 daily)      plants.soil_moisture_min/max
        │ drydown %/day, weather-segmented        │ median → target band
        ▼                                         ▼
garden-brain-reconcile (03:45 daily) ── evaluateArea (_shared/adaptiveCare.ts, pure)
        │ per area: tighten / stretch / stress_risk / create_watering_routine / in_range
        ▼
care_adjustments (proposed) ──► AdaptiveCareCard (dashboard) ──► Apply / Dismiss
        │ applied + ≥7 days                                        │
        ▼                                                          ▼
re-measure post-change window ──► verified_good / verified_mixed ("✓ Since the change…")
```

## Role 1 — Technical Reference

### Component graph
- `src/components/home/AdaptiveCareCard.tsx` — mounted in `HomeMain` (both densities) after `AttentionRow`. Self-hides when no open/verified rows.
- `src/components/GardenerProfile.tsx` — `adaptiveCare` notification category toggle.

### Data flow — read paths
- Card: `care_adjustments` `status='proposed'` (+ last-7-days `verified_*`), painted from snapshot cache `rhozly:snap:v1:adaptive-care:{homeId}` then revalidated.
- Reconciler inputs (service role): `soil_moisture_profiles` (area-mapped, confidence/segments), `device_readings` (last 14 days per device), `inventory_items (status='Planted') → plants(soil_moisture_min/max)`, watering `task_blueprints` (active, per area), valve coverage via `automation_actions(valve_open) → devices.area_id → automations.is_active`, `weather_snapshots` (7-day max temps), recent `care_adjustments` (45 days — cooldown/supersede/verify inputs).

### Data flow — write paths
- Reconciler: INSERT/UPDATE `care_adjustments` (refresh open, supersede stale); verification updates `status/verified_at/verification`; one `notifications` row per member for NEW actionable kinds (tighten/stress/create — never stretch/in_range).
- Card **Apply**: tighten/stretch → `task_blueprints.frequency_days` update; `create_watering_routine` → blueprint + first task + `BlueprintService.generateBlueprintTasks` (mirrors AddTaskModal's recurring flow verbatim); then `status='applied', applied_at, applied_by`. **Dismiss** → `status='dismissed'` (14-day cooldown enforced by the core). Events: `care_adjustment_applied/dismissed`.

### Rule engine (`_shared/adaptiveCare.ts` — pure, no AI)
- Target band = median of the bed's plant ranges (fallback 30–60%). Reality stats over 14 days: `pctTimeBelowFloor`, min, typical post-water peak. `daysToFloor = (peak − floor) / rate`, where rate is **forecast-matched** (`drydown_by_weather.hot_dry` on a hot week — ≥3 days ≥27°C — else overall).
- **Gates:** confidence ≥ 0.5, segments ≥ 3, ≥ 10 reading-days; silent otherwise. Anti-oscillation: tighten needs `freq > daysToFloor×1.25` + suffering (>15% below floor); stretch needs `freq < daysToFloor×0.6` + near-zero floor time + min > floor+10 — deliberately non-adjacent. 14-day dismissal cooldown per (area, kind).
- `create_watering_routine`: only when NO active watering blueprint AND no valve automation covers the area AND the bed shows real need. (The `soilDrydownWatering` pattern flags missing *automation* in insights — different action/surface.)
- Verification: ≥7 post-change reading-days → `verified_good` when below-floor time ≤ max(5%, half the pre-change figure), else `verified_mixed`; numbers stored in `verification` and rendered honestly.

### Cron / scheduled jobs
- `garden-brain-reconcile-daily` — 03:45 UTC (after `compute-soil-profiles` 03:00). On-demand: POST `{ homeId }`.

### Tier gating
- Server-side only: home **owner's** tier ∈ sage/evergreen (`ELIGIBLE_TIERS`). No client tier plumbing — the card hides when no rows exist. Sensors are the practical gate.

### Permissions / RLS
- `care_adjustments`: members SELECT/UPDATE (RLS via `home_members`); INSERT service-role only. Data-API grants: SELECT, UPDATE to authenticated (2026-10 rule).
- `weather_task_claims`-style delete-safety is NOT needed here — the partial unique index (`(home_id, area_id, kind) WHERE status='proposed'`) + supersede logic handle idempotency.

### Error states
- Missing/low-confidence profile → area silently skipped. Apply failure → toast, status unchanged. Notification failure → logged, non-fatal.

### Performance
- Deterministic; per-home queries are index-friendly (`care_adjustments_home_status_idx`). No Gemini calls in Phase 1.

## Role 2 — Expert Gardener's Guide

### Why open this
The Garden Brain card is Rhozly noticing what your soil sensor has been saying all fortnight and turning it into one decision: water more often, water less often, watch that bed this hot week, or set up a routine for a bed that has none. Every suggestion shows its working, and after you apply one Rhozly comes back a week later and tells you — honestly — whether it helped.

### Every flow
1. **Change to every Nd** — the bed dries faster (or slower) than your routine assumes. One tap updates the routine; the schedule regenerates instantly.
2. **Create routine (every Nd)** — plants are in the bed, nothing waters it, and the sensor shows it suffering. One tap creates the watering routine with today as its first day.
3. **Got it** (hot-week stress) — no schedule change; a heads-up that this week's heat will outrun the cadence.
4. **Dismiss** — hides that suggestion for a fortnight. Rhozly won't nag.
5. **✓ Since the change…** — the verification line: soil-in-range % over the week since you applied. Green = worked; amber = mixed (worth a look — maybe the emitter, the plant mix, or the sensor position).

### Information on display
"See the numbers" expands the evidence: the comfort band used (from your plants), % of time below it, the measured drying speed (and whether the hot-weather rate was used), and days-to-floor. If ranges vary across the bed's plants, the middle is used.

### Tier-by-tier
Sprout/Botanist: not available (upgrade surfaces via Integrations). Sage/Evergreen: full.

### Common pitfalls
- No card? You need a soil sensor assigned to an area with planted plants, ~10+ days of readings, and a confident drydown profile. New sensors take a week or two to earn suggestions — by design.
- Sensor in an unrepresentative spot (against the emitter, in a dry corner) → suggestions mirror the sensor, not the bed. Reposition and let the profile rebuild.

## Related reference files
- [Data Model — Integrations](./09-data-model-integrations.md) · [Data Model — Tasks](./04-data-model-tasks.md) · [Cron Jobs](./11-cron-jobs.md) · [Pattern Engine](./26-pattern-engine.md) · [Weather](./27-weather.md) · [Home Main](../02-dashboard/17-home-main.md) · [Notifications Tab](../06-account/02-notifications-tab.md)

## Code references for ongoing maintenance
- `supabase/functions/_shared/adaptiveCare.ts` — pure rules (band, stats, forecast-matched rate, proposals, cooldown, verification)
- `supabase/functions/garden-brain-reconcile/index.ts` — nightly runner (fetch → evaluate → upsert/supersede → verify → notify)
- `supabase/migrations/20260910000000_garden_brain_adaptive_care.sql` — `care_adjustments`, RLS/grants, cron
- `src/components/home/AdaptiveCareCard.tsx` — dashboard card + apply/dismiss flows
- `supabase/tests/adaptiveCare.test.ts` — AC-001..014
