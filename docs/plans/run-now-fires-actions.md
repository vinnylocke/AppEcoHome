# Fix: "Run now" reports success but fires nothing (reads legacy table, not automation_actions)

## Problem (reported + confirmed)

Clicking **Run now** on a sensor automation reports it ran, but nothing happens — no valve, no
notification, no task completion. The user expects Run now to **bypass the trigger conditions** and
actually execute the automation's actions.

## Root cause (confirmed against prod)

The manual path is stale — it predates the unified condition builder + actions model:

- `AutomationCard.tsx` → `supabase.functions.invoke("run-automations", { action: "manual", automationId })`.
- `run-automations` → `runAutomation(…, "manual")` → **`fireValves()` reads the legacy
  `automation_devices` table** (and `completeTasks` the legacy blueprint links).
- Modern automations built in the unified builder store their actions in **`automation_actions`**
  (`valve_open` / `notification` / `complete_task`), and `automation_devices` is **empty**.
- So `fireValves` returns `[]` → `realFires.length === 0` → status computed as **"success"** while
  executing nothing. The real action fan-out (`fanoutActions`) lives only in `evaluate-automations`
  and is never called on the manual path.

Verified on the user's automation `7f880b3d…` ("Auto Water Climbers"): `automation_devices` = 0
rows; `automation_actions` = `valve_open` (device `d44ba301…`, 300 s) + `notification` +
`complete_task`. None of these fire on Run now.

## App-reference consulted

- `docs/app-reference/07-management/06-integrations-automations.md` — actions model, manual run,
  `fanoutActions`, the `automation_devices` (legacy) vs `automation_actions` (unified) distinction.
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `run-automations` /
  `evaluate-automations`.

## Approach — share the action fan-out, fire it on manual run

Extract the action executor (`fanoutActions`) from `evaluate-automations/index.ts` into a shared
module and call it from the manual path so both engines run the **same** actions logic.

| File | Change |
|------|--------|
| `supabase/functions/_shared/fanoutActions.ts` | **New** — move `fanoutActions(db, automation, runId, now)` here (notifications + `automation_valve_queue` rows via `buildValveQueueRows` + `complete_task`). |
| `supabase/functions/evaluate-automations/index.ts` | Import `fanoutActions` from `_shared` (delete the inline copy). No behaviour change to the auto path. |
| `supabase/functions/run-automations/index.ts` | Manual `runAutomation`: replace the legacy `fireValves` + `completeTasks` with `fanoutActions(automation)` (executes `automation_actions`, bypassing conditions/rate-limit — manual is an explicit override). Then call the existing `drainValveQueue` so the just-queued valve **fires immediately** rather than waiting for the next cron. Compute status from the fan-out result. Keep the existing user-auth + home-membership check. |
| `docs/app-reference/07-management/06-integrations-automations.md` | Update the manual-run description (fires `automation_actions` via shared `fanoutActions`, immediate valve drain, bypasses conditions). |

**Bypass semantics:** manual run skips condition eval, the active-window, cooldown, and the
run-limit/mute (it's a deliberate user action). It records a `triggered_by: "manual"` run; whether
it counts toward the rolling run-limit is a minor choice — recommend **it does** (a fire is a fire),
and it clears `rate_limited_until` like any fire so state stays consistent.

## Risks / edge cases

- **Valve immediacy:** `fanoutActions` queues `valve_open` (+ paired `turn_off`) at `fire_at = now`;
  calling `drainValveQueue` right after makes it fire on the click. Sequential multi-valve automations
  still drain over their staggered `fire_at`s on subsequent cron ticks (unchanged).
- **Legacy automations** that genuinely use `automation_devices`: none should remain (Phase-3
  migrated them to `automation_actions`), but I'll keep a fallback so a legacy device row still fires
  rather than silently regress.
- **Refactor safety:** `fanoutActions` becomes shared with no behaviour change to the auto path —
  Deno function tests + a manual Run-now verification cover it.

## Tests / docs

- `supabase/tests/` — add coverage for the shared fan-out's pure parts (e.g. status derivation,
  valve-queue row building is already tested via `valveQueueRows.test.ts`).
- Update the automations app-reference manual-run section.

## Ships via

`npm run deploy` (edge functions). No migration, no APK.

## Note

Your automation is correctly configured — this is purely the Run-now path firing the wrong source.
Once shipped, Run now will open the valve (300 s), send the notification, and complete the task,
regardless of whether the soil is currently dry.
