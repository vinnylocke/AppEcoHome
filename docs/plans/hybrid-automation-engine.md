# Hybrid event-driven automation engine (design — for review)

**Goal:** make sensor-triggered automations respond in near-real-time and scale with data volume instead of sweeping the whole `automations` table every 5 minutes.

> Status: **design for review.** Not yet approved/implemented. The current 5-min engine works correctly (verified 2026-06-19); this is a performance + responsiveness upgrade.

## App-reference consulted
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `evaluate-automations` (5-min) + `run-automations` (valve drain).
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `device_readings`, `automations.trigger_logic`, condition tree, run-limit.
- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — firing model, gates.
- [99-cross-cutting/12-notifications.md](../app-reference/99-cross-cutting/12-notifications.md) — the `device_readings`/`notifications` → edge-function trigger pattern (pg_net) reused here.

## Current model + its limits

`pg_cron` hits `evaluate-automations` every 5 min; it loads **every** `is_active` automation and, per automation, reads sensor rows + forecast + due tasks and evaluates the tree. Cost ≈ O(active automations × per-automation queries) **every 5 minutes regardless of whether anything changed**. Fine now; at thousands of automations it's a recurring full-table sweep, and sensor response is capped at the 5-min cadence (though Ecowitt readings only land every ~15 min, so latency isn't the pain yet — scale is).

## Industry-standard shape

Split triggers by what actually changes them:
- **Sensor conditions are data-driven** → evaluate **when a new reading arrives** (event-driven). Work is proportional to reading volume, scoped to the few automations watching that sensor/area.
- **Time / date_range / weather conditions are clock-driven** → keep a **scheduled** pass, but lighter.

## Proposed architecture

### A. Event path — on `device_readings` INSERT
1. An `AFTER INSERT` trigger on `device_readings` (pg_net → a new `evaluate-automations-for-device` edge fn, OR `evaluate-automations` with a `{ deviceId }` body), mirroring the existing `notifications → push-webhook` trigger pattern (publishable-key auth, fire-and-forget, wrapped so it can't block ingestion).
2. The fn resolves the device's `area_id` + any automations whose **sensor leaf** references that device (`sensorIds` contains it) or that area (area-scoped sensor leaves), then evaluates **only those** — reusing the exact pure logic already in `_shared/conditionTree.ts` (`evaluateTree`, `shouldFire`, run-limit, default-window). Identical gates ⇒ identical fire decisions, just triggered by data.
3. Fire → existing `automation_valve_queue` + `automation_runs` path (unchanged). Decoupled from the HTTP request.

### B. Scheduled path — keep the cron, narrow it
- The 5-min cron continues, but only evaluates automations whose tree contains a **time / date_range / weather** leaf (pre-filter via a cheap predicate, ideally a stored/generated `has_time_trigger` flag set on save). Pure-sensor automations are owned by the event path.
- Weather-defer recheck + the valve-drain stay on the cron.

### C. Throttling + idempotency (the hard parts)
- **Event storms:** many devices reporting at once ⇒ debounce per automation (a short cooldown / "already evaluated within N seconds" guard) so a burst doesn't re-evaluate the same automation repeatedly. The existing `sensor_cooldown_minutes` + `run_limit` already bound *fires*; this guards *evaluations*.
- **Double evaluation** (automation with BOTH sensor + time leaves, hit by event *and* cron): safe by construction — `condition_was_true` rising-edge + cooldown + run-limit make re-evaluation idempotent (worst case a redundant skip). Keep both paths writing through the same gates; never special-case fire logic per path.
- **Ingestion safety:** the trigger must never roll back or slow the `device_readings` insert (exception-wrapped, async via pg_net), same contract as the push trigger.

### D. Migration / rollout (phased)
1. **Phase 0:** extract any remaining non-pure bits of `processOne` so a single automation can be evaluated in isolation (most logic is already pure).
2. **Phase 1:** add the `device_readings` trigger + `evaluate-automations-for-device` (event path) **alongside** the existing cron (cron still evaluates everything — belt-and-braces). Measure: event-path latency, duplicate-fire rate (should be ~0).
3. **Phase 2:** once confident, narrow the cron to time/weather-only automations. Keep a slow full-sweep safety net (e.g. every 30–60 min) to catch anything missed.
4. **Phase 3:** add the `has_time_trigger` flag on automation save to make the cron pre-filter O(1).

## Files (anticipated)
| File | Change |
|------|--------|
| `supabase/migrations/<ts>_device_readings_automation_trigger.sql` | Trigger on `device_readings` INSERT → pg_net → event fn. |
| `supabase/functions/evaluate-automations-for-device/index.ts` | New — evaluate automations for one device (reuses `_shared/conditionTree.ts`). |
| `supabase/functions/evaluate-automations/index.ts` | Narrow to time/weather automations (Phase 2); add the slow safety sweep. |
| `_shared/automationCandidates.ts` (new, pure) | "Which automations does this device affect?" + "does this tree have a time/date/weather leaf?" — unit-tested. |
| `supabase/migrations/<ts>_automations_has_time_trigger.sql` | `automations.has_time_trigger` (Phase 3) maintained on save. |

## Risks / open questions
- **Event volume vs cost:** every reading fires a trigger → an edge invocation. At ~15-min Ecowitt cadence this is tiny; for high-frequency sensors, batch/debounce at the trigger (e.g. only fire if the metric crossed a threshold band vs the previous reading).
- **Reused valve safety:** unchanged — still queued + drained by `run-automations`.
- **Backwards-compat:** Phase 1 runs both paths, so no regression risk; the narrow-down (Phase 2) is the only behavioural switch and is reversible.
- **Decision needed:** separate `evaluate-automations-for-device` fn vs a `{deviceId}` param on the existing fn (leaning separate fn for a clean, minimal event path).

## Recommendation
Phase 1 first (event path additive, zero behavioural risk, immediately improves responsiveness), measure duplicate-fire rate, then decide on Phase 2's cron narrowing. This de-risks the rebuild and is independently shippable per phase.

---

## IMPLEMENTED (2026-06-19) — single-function scoping (lower-risk than the separate-fn design above)

Rather than extracting `processOne` into a shared module + a new `evaluate-automations-for-device` function, `evaluate-automations` now takes a **scope** on the request body and selects the candidate set itself — same engine, same gates, no risky valve-logic move:

- **`{ deviceId }` (event):** resolve the device's area, keep only automations whose sensor leaves watch that device/area (`treeAffectedByDevice`).
- **`{ scope: "time" }` (5-min cron):** only clock-driven automations (`treeHasTimeTrigger` — time/date/weather).
- **`{ scope: "all" }` (15-min cron) / empty body:** everything — safety sweep + cooldown/run-limit aging for pure-sensor automations + back-compat (old cron body `{}` ⇒ "all", so no firing gap during rollout).

Candidate predicates are the pure, unit-tested [`_shared/automationCandidates.ts`](../../supabase/functions/_shared/automationCandidates.ts). The event path is a `device_readings` `AFTER INSERT` trigger (soil-reading-gated, exception-wrapped, publishable-key auth via pg_net) → `evaluate-automations` `{ deviceId }`, mirroring the `notifications → push-webhook` pattern. Migration `20260807000000`.

**Cooldown-aging note:** removing pure-sensor automations from the 5-min cron means their repeat-while-true re-firing is driven by the event path (on each reading) + the 15-min safety sweep — so worst-case re-fire latency is ~15 min (vs 5 min before) for an automation with **no** time/weather leaf. Most watering automations include a rain/weather leaf, so they stay on the 5-min `time` cron and are unaffected.

**Verified on prod (2026-06-19):** scope routing returns the right candidate counts (all/time/event=1 for the test automation, event=0 for a bogus device); inserting a CH2 reading produced an event-path run within ~1 s. Phases effectively delivered: 1 (event path), 2 (cron narrowing + 15-min safety), 3 (`treeHasTimeTrigger` filter, JS not a column — the cron load reduction without a schema change). A stored `has_time_trigger` flag + indexed candidate queries remain available as a future scale optimisation.
