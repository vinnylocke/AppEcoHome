# Valve runs longer than the automation's set duration

## Symptom
An automation set to **5 min** ran the valve for **~10 min**.

## Diagnosis (from prod data)
Automation "Auto Water Climbers in Front Left": action `valve_duration_seconds = 300` (5 min). `valve_events`:
- `turn_on` 11:30:11 → `turn_off` 11:40:05 = **~10 min**; the `turn_on` logged `duration_seconds = 1800`.

Three issues, all in the valve-queue path:
1. **Late close.** `fanoutActions` queues the paired `turn_off` at `fire_at + valve_duration_seconds` (correct: +300s = 11:35). But the **drain cron runs every 5 min** (`drain-valve-queue-5min`), so it fired the close at 11:40 — up to ~5 min late → the 5→10 min overrun.
2. **Wrong countdown.** `drainValveQueue` sends the device's auto-off `countdown` from `automations.duration_seconds` (legacy column, default **1800**) instead of the action's `valve_duration_seconds` (300). The unified builder only sets the per-action duration, so `automations.duration_seconds` stays at 1800 — which also equals the device's `default_duration_seconds` (the "default timer"). Latent: if the queued close ever fails, the valve would run 30 min.
3. **Occasional double-fire.** Some runs logged two `turn_on`s ~1s apart — the inline drain (`evaluate-automations`) and the 5-min drain cron both fired the same pending entry (the queue rows aren't claim-locked).

## "Is the device default timer necessary?" — No
`resolveEffectiveDuration` uses `metadata.default_duration_seconds` **only as a fallback** when no automation/action duration is given. Since automations always set the time, it's redundant for automation-driven valves — the fix makes the automation's duration the single source of truth.

## App-reference consulted
- `docs/app-reference/07-management/06-integrations-automations.md`
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md`

## Fix
1. **Claim-lock the drain** (`_shared/valveQueue.ts`): atomically flip each entry `pending → firing` (conditional update, `RETURNING`) before hitting eWeLink; if 0 rows, another drain already took it → skip. Kills the double-fire between the inline drain and the cron.
2. **Correct the countdown**: in `drainValveQueue`, use the valve action's `valve_duration_seconds` for the `turn_on` countdown (look it up by `automation_id` + `device_id`), falling back to `automations.duration_seconds` then the device default. The device now gets the real 5-min auto-off, and the worst case is bounded to the set duration.
3. **Tighten the close timing** (migration): reschedule the valve-queue drain cron **5 min → 1 min** (`drain-valve-queue-5min` → every minute). The queued close then fires within ~1 min of due — a 5-min valve runs ~5–6 min, not up to 10. (Light: the drain is a quick "fire what's due" query.)

## Tests / docs
- Extend `supabase/tests/valveQueue.test.ts`: claim-lock skips an already-claimed entry; the countdown uses the action duration not the 1800 default.
- Update `11-cron-jobs.md` (drain now every minute) + `06-integrations-automations.md` (duration model: automation duration is authoritative; device default is a fallback).

## Follow-up (optional, not in this fix)
- UI: de-emphasise / hide the device "default timer" when an automation supplies the duration, to remove the confusion at source.

## Risk
- 1-min drain cron ≈ 1440 light invocations/day (vs 288). Fine for a watering app.
- Stripe-style test mode for the valve account; idempotent + claim-locked.
