# Automation "ran" receipt fires ~5 min before the valve actually opens

## Symptom
User gets the "automation ran" notification, but the device (valve) doesn't physically actuate until ~5 minutes later.

## Root cause (traced)
The auto-fire path and the device-actuation path are on two separate 5-minute crons:

1. `evaluate-automations` (`*/5`, `evaluate-automations-5min`) detects the rising edge →
   `fanoutActions()` **queues** the valve `turn_on` into `automation_valve_queue` (`fire_at ≈ now`, `status='pending'`) → **immediately sends the "ran" receipt** (`sendReceipt(…, "ran")`).
2. `run-automations` drain (`*/5`, `drain-valve-queue-5min`) later calls `drainValveQueue()`, which is what actually hits the eWeLink API and opens the valve.

So the receipt is sent at **queue** time; the valve opens at the **next drain tick** — up to 5 minutes later. (`send_notification` reminders and `complete_task` actions run inline in `fanoutActions`, so only **valve** automations show the gap.)

The **manual "Run now"** path (`run-automations` → `runAutomation`) already avoids this: it calls `fanoutActions()` then `await drainValveQueue(db)` **inline** ("so a valve fires on the click instead of waiting for the next cron tick") before its receipt. The auto path simply never got that inline drain.

## App-reference consulted
- `docs/app-reference/07-management/06-integrations-automations.md` (automation engine, valve queue, receipts)
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`, `11-cron-jobs.md`, `12-notifications.md`

## Fix — drain the just-queued valve inline in the auto path (mirror the manual path)
Make `evaluate-automations` fire the queued `turn_on` immediately after queueing, exactly as "Run now" does, so the valve opens within the same invocation and the "ran" receipt is truthful. Preserves the existing **optimistic receipt + failure-correction** design (a `turn_on` failure in the drain still sends the `"failed"` receipt).

1. **Extract** `drainValveQueue` (+ its helper `fireValve`) from `supabase/functions/run-automations/index.ts` into a shared module `supabase/functions/_shared/valveQueue.ts` (typed `db: any` like `fanoutActions`, since the two functions pin different supabase-js versions). Add an optional `{ runId }` filter so a caller can drain only its own run's due entries.
2. `run-automations/index.ts` — import `drainValveQueue` from the shared module (delete the local copies of `drainValveQueue` + `fireValve`). Behaviour unchanged.
3. `evaluate-automations/index.ts` — in the fire branch, after `sendReceipt(…, "ran")`, add `await drainValveQueue(db, { runId }).catch(…)` so the `turn_on` actuates now instead of at the next drain tick. The paired `turn_off` (`fire_at = now + duration`) stays queued and is closed by the existing 5-min drain cron (unchanged).

Order kept as **receipt → drain** so the existing "the optimistic 'ran' receipt already went out … a turn-on failure here corrects it" logic in `drainValveQueue` still holds.

### Why not move the receipt into the drain instead?
That would split receipt logic across two functions and risk missing/duplicate receipts for non-valve automations (which legitimately complete at evaluate time). Draining inline is smaller, matches the manual path, and keeps one receipt code path.

## Files
- `supabase/functions/_shared/valveQueue.ts` — **new** (shared `drainValveQueue` + `fireValve`).
- `supabase/functions/run-automations/index.ts` — import shared drain; remove local copies.
- `supabase/functions/evaluate-automations/index.ts` — inline drain after the "ran" receipt.

## Tests
- **Deno** `supabase/tests/valveQueue.test.ts` — with a stub `db`/`fetch`: a pending `turn_on` with `fire_at <= now` gets marked `fired` and emits the eWeLink call; a future `turn_off` is left `pending`; `{ runId }` scopes to that run only; a failed `turn_on` marks `failed` + triggers the `"failed"` receipt.
- Re-run existing `automationReceipt.test.ts` to confirm no regression.

## Docs
- `06-integrations-automations.md` (note the auto path now drains inline → receipt reflects actual actuation), `11-cron-jobs.md` (the drain cron remains as the safety net + turn-off closer), `TESTING.md` (+ new Deno test).

## Risk / edge cases
- Inline drain does eWeLink network I/O during the 5-min sweep — wrapped in `.catch` (non-fatal, per-automation try/catch already exists); identical to what "Run now" already does.
- Double-fire race with the drain cron: the inline drain marks the entry `fired` immediately, so a later cron tick won't re-fire it. Scoping to `{ runId }` further limits overlap. (Queue entries still aren't claim-locked — a pre-existing condition, not introduced here; can harden separately if wanted.)
- Deploy is `_shared`-only + two function bodies — no migration, no cron change.
