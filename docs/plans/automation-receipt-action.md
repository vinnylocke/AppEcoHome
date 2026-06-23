# Automation Receipt — opt-in outcome notifications + notification cleanup

## Goal

Replace the implicit/automatic automation notifications with a single, **opt-in** action — **"Automation Receipt"** — that tells the user the outcome of each meaningful run-decision (ran / skipped / **rate-limited** / failed) and *why*. By default an automation is silent (the user now has fine-grained control over *when* it runs, so unsolicited "it ran" pings aren't wanted). Also fix the run-history wording to **"N members alerted"**.

Driven by user direction: "by default it doesn't do this anymore… just one action called Automation Receipt which is sent when it's checked if it needs to run and lets the user know the outcome and why (including because it hit its rate limit — this indicates they may need to amend the automation)."

## App-reference consulted

- `docs/app-reference/07-management/06-integrations-automations.md` — automation run/decision flow + run history.
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` — `automations`, `automation_actions`, `automation_runs`.
- `docs/app-reference/99-cross-cutting/12-notifications.md` — the `notifications` table + delivery.

## Current state (the two notification paths)

1. **"Notify" action** (`fanoutActions.ts`, action_kind `notification`): a custom title/body, sent **one row per home member** when the automation *fires*. `notifications_queued` counts per member → run history says "N notifications sent" (the "2" the user saw for a 2-member home).
2. **Automatic watering notifications** (`run-automations` `sendNotification`): "watered your garden" / "skipped — rain detected" / "failed to water", sent per member **regardless of any action**. This is the implicit path the user wants gone.

## Changes

### 1. Default = silent
- `run-automations/index.ts`: remove the `sendNotification(...)` calls. Automations no longer notify automatically.

### 2. "Automation Receipt" action (reuses action_kind `notification` — no enum migration)
- **Builder UI** (`AutomationBuilderModal.tsx`): the action dropdown option "Notify" → **"Automation Receipt"**; drop the custom title/body input (the message is system-generated). Existing `notification` action rows keep working — their behaviour becomes the receipt (any saved custom title is ignored). *(Decision: this replaces the custom-message notify action; a one-off note in the migration plan, not a data migration.)*
- **Behaviour**: when an automation **has a receipt action**, the runner sends a per-member outcome notification at each **meaningful** decision — and *only* those, to avoid spam:
  - **Ran** — success / partial / failed (what it did: valves for Xm, task completed, etc.).
  - **Rate-limited** — "held back — it hit its rate limit (max N per window). Ease the limit if this happens often." ← the key new signal.
  - **Skipped** — rain / weather defer (why).
  - **NOT** on idle "conditions not met / not due" checks. *(Decision — flagged below.)*
- New shared helper `_shared/automationReceipt.ts`: `buildReceipt(outcome, ctx) → { title, body }` (pure, tested) + `sendReceipt(db, automation, outcome, ctx)` (per-member insert, returns `members_alerted`).
- Notification handling moves **out of** `fanoutActions.ts` (it keeps valves + tasks); the **runners** (`evaluate-automations`, `run-automations`) call `sendReceipt` at their decision points (`rate_limited`, `skipped`, `fire`/success/partial/failed) when a receipt action is configured.

### 3. Run history → "N members alerted"
- `automation_runs.devices_triggered` stores `members_alerted` (= member count) instead of `notifications`.
- `src/lib/automationRunSummary.ts`: "X notifications sent" → **"X members alerted"** — and read `members_alerted` with a fallback to the legacy `notifications` field (old rows were also per-member, so the new wording is accurate for them too). Update the unit test.

## Files

- `supabase/functions/run-automations/index.ts` — remove `sendNotification`; call `sendReceipt` on success/partial/failed/skipped when a receipt action exists.
- `supabase/functions/evaluate-automations/index.ts` — call `sendReceipt` on `fire` / `rate_limited` / `skipped` when a receipt action exists; store `members_alerted`.
- `supabase/functions/_shared/automationReceipt.ts` — **new** (message builder + sender).
- `supabase/functions/_shared/fanoutActions.ts` — remove the `notification` branch (valves + tasks only); update its result type.
- `src/components/integrations/AutomationBuilderModal.tsx` — rename the action, drop the message field.
- `src/lib/automationRunSummary.ts` — "members alerted".

## Tests

- **Deno**: `automationReceipt` builder (all outcomes incl. rate-limited + per-member count); update `fanoutActions` test (notification branch removed).
- **Vitest**: `automationRunSummary.test.ts` — "members alerted" (+ legacy `notifications` fallback).
- **E2E**: update the automations builder spec for the renamed action / removed message field.

## Docs

- `07-management/06-integrations-automations.md` (receipt action + decision-time notifications), `09-data-model-integrations.md` (action semantics), `12-notifications.md` (no auto-notifications; receipt path), `TESTING.md`, e2e-test-plan automations section.

## Decisions baked in (flag if you disagree)

1. **Receipt fires only on meaningful outcomes** (ran / skipped / rate-limited / failed) — *not* on every idle "not due" check, which would notify every 5–15 min. (If you truly want a ping on every evaluation, say so.)
2. **The receipt replaces the custom-message "Notify" action.** Existing custom notification messages stop being sent (the action becomes a receipt). No separate "send a custom message" action remains — if you want to keep that as a second action, tell me.
3. **Action name = "Automation Receipt"** and it reuses the existing `notification` action_kind (no DB migration).
