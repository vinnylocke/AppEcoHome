# Plan — Automation Bug Fix Batch (Issues 1–5)

## Context

Five bugs diagnosed across the `run-automations` edge function, eWeLink device integration, and DeviceCard UI. All five are fixed in this batch. Issues 6 and 7 are separate sessions.

---

## Issue 1 — Automation Never Runs (verify_jwt blocks cron)

**Root cause:** `run-automations` is not listed in `supabase/config.toml`, so it defaults to `verify_jwt = true`. The pg_cron HTTP call has no Authorization header → gateway returns 401 → automation never fires.

**Fix:** Add two lines to `supabase/config.toml`:

```toml
[functions.run-automations]
verify_jwt = false
```

**File:** `supabase/config.toml`

---

## Issue 2 — Task Gate Blocks Runs When No Controlling Blueprints Set

**Root cause:** `checkControllingTaskDue` returns `false` when the automation has no controlling blueprints (no gate configured). This incorrectly prevents the automation from running — no gate should mean "always allow".

**Fix:** In `checkControllingTaskDue`, when the `automation_blueprints` query returns 0 rows with `role = 'controlling'`, return `true` instead of `false`.

**File:** `supabase/functions/run-automations/index.ts`

---

## Issue 3 — Manual Run Creates Phantom Tasks (one per linked blueprint)

**Root cause:** `completeTasks` calls `db.from("tasks").insert(...)` for every linked blueprint without checking if that blueprint has a task due today. On a manual run, all 4 watering blueprints are inserted for today even if none were scheduled → they appear in the dashboard count but never in the task list UI (which filters by schedule).

**Fix:** For manual runs, after querying linked blueprints, check if any blueprint already has a task row for today. If at least one exists, complete those tasks as normal. If none exist, insert a single generic "automation ran" task instead of per-blueprint tasks:

```ts
{
  home_id: homeId,
  blueprint_id: null,
  title: `${automationName} ran`,
  description: "Your automation ran manually. No scheduled watering tasks were due today.",
  type: "Watering",
  due_date: today,
  status: "Completed",
  completed_at: new Date().toISOString(),
  auto_completed_reason: "automation"
}
```

The `is_manual` parameter (already present in `runAutomation`) will be threaded through to `completeTasks` to gate this behaviour.

**File:** `supabase/functions/run-automations/index.ts`

---

## Issue 4 — Valve Doesn't Turn Off After Duration

**Root cause:** `buildControlPayload` sends `countdown: durationSeconds` in the eWeLink payload, but the eWeLink API silently ignores `countdown` for sub-devices (multi-outlet devices). The valve turns on and stays on indefinitely.

**Fix — two parts:**

### Part A: Migration

Add `command` column to `automation_valve_queue`:

```sql
ALTER TABLE automation_valve_queue
ADD COLUMN command TEXT NOT NULL DEFAULT 'turn_on'
CHECK (command IN ('turn_on', 'turn_off'));
```

**File:** new migration `supabase/migrations/20260519000000_add_valve_queue_command.sql`

### Part B: Edge function changes

In `fireValves` (immediate path): after firing turn-on for each valve, immediately insert a companion turn-off entry into `automation_valve_queue` with `fire_at = now + durationSeconds` and `command = 'turn_off'`.

In `drainValveQueue`: read the `command` column and pass it to `buildControlPayload`. Currently it always passes `"turn_on"`. For `command = 'turn_off'`, pass `durationSeconds = 0` (no countdown needed).

For the sequential queue path: same — turn-on entry fires first, turn-off entry queued after with correct `fire_at`.

**File:** `supabase/functions/run-automations/index.ts`

---

## Issue 5 — Rain-Skip Not Notified and Not Shown in History

**Root cause — two gaps:**

1. `sendNotification` is never called when status is `skipped_weather` — the run exits silently.
2. `checkRain` returns `boolean`, so the notification body can't include how much rain fell (e.g. "12mm forecast").

**Fix:**

### checkRain signature

Change return type from `Promise<boolean>` to `Promise<{ rained: boolean; mm: number }>`. Callers already use `if (rained) { ... }` — update to destructure `const { rained, mm } = await checkRain(...)`.

### sendNotification after skipped_weather

After the `skipped_weather` result is inserted into `automation_run_history`, call:

```ts
await sendNotification(userId, {
  title: "Watering skipped — rain detected",
  body: `${automationName} was skipped today (${mm}mm of rain forecast). Your garden doesn't need extra water.`,
  type: "automation_skipped",
});
```

The history UI already handles `skipped_weather` status with correct labels and icons — no UI changes needed.

**File:** `supabase/functions/run-automations/index.ts`

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/config.toml` | Add `[functions.run-automations]` + `verify_jwt = false` |
| `supabase/migrations/20260519000000_add_valve_queue_command.sql` | New: add `command` column to `automation_valve_queue` |
| `supabase/functions/run-automations/index.ts` | Issues 2, 3, 4, 5 — multiple function changes |

---

## Execution Order

1. Write migration file
2. `supabase migration up` to apply locally
3. Apply config.toml fix
4. Apply all edge function changes
5. `npx tsc --noEmit` clean build check
6. User confirms → `supabase db push` + redeploy

---

## Risks / Edge Cases

- **Issue 3:** If `completeTasks` is called from scheduled runs with `is_manual = false`, the original per-blueprint behaviour is preserved unchanged. The generic task is only inserted on manual runs with no due tasks.
- **Issue 4:** Turn-off entries in the queue will be processed by the next cron tick after `durationSeconds` has elapsed. Maximum delay beyond the intended off-time is ~60 seconds (cron runs hourly → checked on the hour; but `drainValveQueue` is called on every run). Actually cron is `0 * * * *` (hourly), so if duration is 30 minutes the turn-off will be processed within the same hour's cron tick only if `run-automations` is also called 30 minutes later by another trigger. **Recommendation:** add a separate pg_cron entry for `drainValveQueue` at `*/5 * * * *` (every 5 minutes) to ensure turn-offs fire promptly. This is a new cron schedule, not a new function. Alternatively, if the user prefers, rely on the next automation's hourly run and document the up-to-60-minute lag.
- **Issue 5:** `mm` from `checkRain` could be `0` if rain was detected by a different threshold path. Guard: if `mm === 0`, say "rain forecast" without a quantity.
