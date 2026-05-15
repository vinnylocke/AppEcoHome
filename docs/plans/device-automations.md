# Plan — Device Automations (Tier 1)

## Goal

Allow users to create automations that fire water valves automatically based on watering task schedules. When a controlling task is due, the automation turns on linked valves, marks all linked tasks as done, and sends a push notification with the result.

Tier 2 (sensor-driven automations) is scaffolded at the schema level only — no logic or UI until soil sensors arrive.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Controlling blueprint** | A task blueprint that determines whether the automation fires today. If any controlling blueprint has a task due today (and not already done), the automation runs. Controlling blueprints are also automatically treated as driven. |
| **Driven blueprint** | A task blueprint whose tasks are auto-completed when the automation runs, regardless of whether they triggered it. |
| **Automation run** | One execution of an automation on a given day. Logged in `automation_runs`. |

---

## Schema — New Tables

### `automations`
```sql
CREATE TABLE automations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id                 uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  tier                    int  NOT NULL DEFAULT 1,

  -- Scheduling
  scheduled_time          time NOT NULL DEFAULT '07:00',

  -- Valve behaviour
  duration_seconds        int  NOT NULL DEFAULT 1800,
  fire_valves_sequentially boolean NOT NULL DEFAULT false,

  -- Weather awareness
  skip_if_rained          boolean NOT NULL DEFAULT false,
  rain_threshold_mm       numeric NOT NULL DEFAULT 5.0,

  -- Failure handling
  retry_on_failure        boolean NOT NULL DEFAULT true,

  -- Execution tracking (prevents double-fire on same day)
  last_run_date           date,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
```

### `automation_devices`
```sql
CREATE TABLE automation_devices (
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  device_id     uuid NOT NULL REFERENCES devices(id)     ON DELETE CASCADE,
  PRIMARY KEY (automation_id, device_id),
  UNIQUE (device_id)   -- one valve → one automation only
);
```

### `automation_blueprints`
```sql
CREATE TABLE automation_blueprints (
  automation_id uuid NOT NULL REFERENCES automations(id)       ON DELETE CASCADE,
  blueprint_id  uuid NOT NULL REFERENCES task_blueprints(id)   ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'controlling',  -- 'controlling' | 'driven'
  PRIMARY KEY (automation_id, blueprint_id),
  CONSTRAINT valid_role CHECK (role IN ('controlling', 'driven'))
);
```

### `automation_valve_queue`
Used for sequential firing. When an automation fires multiple valves sequentially, it inserts one queue row per valve with a staggered `fire_at` timestamp. The hourly cron drains this queue.

```sql
CREATE TABLE automation_valve_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_run_id uuid NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  device_id       uuid NOT NULL REFERENCES devices(id),
  fire_at         timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'fired' | 'failed'
  error_message   text,
  fired_at        timestamptz
);
```

### `automation_runs`
```sql
CREATE TABLE automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  home_id         uuid NOT NULL REFERENCES homes(id),
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  triggered_by    text NOT NULL DEFAULT 'schedule',  -- 'schedule' | 'manual'
  status          text NOT NULL DEFAULT 'pending',   -- 'pending' | 'success' | 'partial' | 'failed' | 'skipped_weather' | 'skipped_no_tasks'
  devices_triggered jsonb NOT NULL DEFAULT '[]',     -- [{device_id, name, success}]
  tasks_completed   jsonb NOT NULL DEFAULT '[]',     -- [{task_id, blueprint_id, title}]
  error_message   text,
  completed_at    timestamptz,
  notified_at     timestamptz
);
```

### `automation_sensors` (Tier 2 scaffold — no logic)
```sql
CREATE TABLE automation_sensors (
  automation_id      uuid NOT NULL REFERENCES automations(id)  ON DELETE CASCADE,
  sensor_device_id   uuid NOT NULL REFERENCES devices(id)      ON DELETE CASCADE,
  plant_id           int  REFERENCES plants(id)                ON DELETE SET NULL,
  moisture_threshold_pct int NOT NULL DEFAULT 30,
  PRIMARY KEY (automation_id, sensor_device_id)
);
```

---

## RLS Policies

All automation tables: home members can SELECT/INSERT/UPDATE/DELETE rows belonging to their home. `automation_runs` and `automation_valve_queue` are INSERT/UPDATE by service role only (read-only for members via SELECT).

---

## Cron Schedule

Add a pg_cron job (via migration) that invokes `run-automations` every hour:

```sql
SELECT cron.schedule(
  'run-automations-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/run-automations',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_key')),
    body := '{}'::jsonb
  )$$
);
```

---

## Edge Function — `run-automations`

### Entrypoint actions
- `action = "cron"` (default) — hourly cron sweep
- `action = "manual"` + `automationId` — Run Now from UI, bypasses date/time checks

### Cron sweep logic

```
For each active tier-1 automation where:
  - is_active = true
  - tier = 1
  - scheduled_time falls within the current clock hour (CURRENT_TIME >= scheduled_time AND CURRENT_TIME < scheduled_time + interval '1 hour')
  - last_run_date IS NULL OR last_run_date < CURRENT_DATE

  1. WEATHER CHECK (if skip_if_rained = true)
     - Query weather_snapshots for the home for today
     - If precipitation_sum >= rain_threshold_mm:
       → Insert automation_run with status='skipped_weather'
       → Update last_run_date = CURRENT_DATE
       → Continue to next automation

  2. TASK DUE CHECK
     - Load all 'controlling' blueprints for this automation
     - For each blueprint, check if today is a due date:
       a. Look for a task in `tasks` with blueprint_id + due_date = today → if status='done', it's done
       b. If no actual task exists, evaluate the blueprint's recurrence_rule against today
     - If NONE of the controlling blueprints have a due-and-not-done task:
       → Insert automation_run with status='skipped_no_tasks'
       → Update last_run_date = CURRENT_DATE
       → Continue to next automation

  3. FIRE VALVES
     - Load all devices for this automation (with their integration credentials)
     - Create automation_run record with status='pending'
     - If fire_valves_sequentially = false:
         → POST to integrations-ewelink-control for all valves simultaneously
     - If fire_valves_sequentially = true:
         → Insert automation_valve_queue rows:
           valve 1: fire_at = now()
           valve 2: fire_at = now() + duration_seconds * 1s
           valve 3: fire_at = now() + duration_seconds * 2s
         → Also drain any pending queue rows for this run (fire valve 1 now)
     - On 502/timeout: if retry_on_failure = true, wait 10s and retry once
     - Record per-device success/failure in devices_triggered JSONB

  4. MARK TASKS DONE
     - For all blueprints (both 'controlling' and 'driven') linked to this automation:
       a. Check if a task already exists for today with status='done' → skip
       b. Check if a task exists for today with another status → UPDATE status='done', completed_at=now()
       c. If no task row exists → INSERT a new completed task (ghost materialised as done)
     - Skip any that fail rather than aborting the whole run

  5. UPDATE RUN STATUS
     - If all valves succeeded → status='success'
     - If some valves succeeded → status='partial'
     - If all valves failed → status='failed'
     - Update automation_run with completed_at, status, devices_triggered, tasks_completed
     - Update automations.last_run_date = CURRENT_DATE

  6. SEND PUSH NOTIFICATION
     - Title: "[name] watered your garden"  (success/partial)
            OR "[name] failed to water your garden"  (failed)
     - Body:  "Valves ran for X min in [area names]."  (success)
            OR "Check your device connections."  (failed)
     - Target: all home members with push tokens
     - Update notified_at on the run record
```

### Sequential valve queue drain
On every hourly cron sweep (even when no new automations are scheduled), also drain any `automation_valve_queue` rows where `fire_at <= now()` and `status = 'pending'`. This fires the queued valves and updates the parent `automation_run` status once all are done.

### Manual trigger logic
- Bypasses `last_run_date` and time-window checks
- Bypasses weather skip (user explicitly wants it to run)
- Otherwise identical flow from step 3 (valve firing) onwards
- If no controlling task is due today, still runs (user intent is explicit)
- Sets `triggered_by = 'manual'`

---

## Frontend

### Where

Add an **Automations** section to `IntegrationsPage.tsx` below the device list. No new route needed — it's a logical extension of device management.

### New components

| File | Purpose |
|------|---------|
| `src/components/integrations/AutomationsSection.tsx` | Section container — empty state, list of AutomationCards, "New automation" button |
| `src/components/integrations/AutomationCard.tsx` | Card per automation — name, status badge, device chips, last run info, Run Now button, edit/delete |
| `src/components/integrations/AutomationModal.tsx` | Create / edit modal — all settings, device picker, blueprint picker |
| `src/components/integrations/AutomationRunHistory.tsx` | Expandable panel within AutomationCard showing last N runs with status badges |

### AutomationModal fields

**Identity**
- Name (text, required)
- Active toggle

**Schedule**
- Scheduled time (time picker, default 07:00)

**Valves**
- Multi-select: water valves not already linked to another automation (grey out/exclude already-linked ones with a tooltip)
- Duration (seconds input with minute display, default 1800)
- "Fire valves sequentially" toggle (shown only if ≥2 valves selected)

**Tasks**
- Controlling blueprints: multi-select from home's task blueprints (watering category pre-filtered)
- Driven blueprints: multi-select (controlling ones appear here pre-checked and non-removable)

**Weather**
- "Skip if it rained" toggle
- Rain threshold input (mm, shown when toggle on, default 5mm)

**Reliability**
- "Retry on failure" toggle (default on)

### AutomationCard display

```
┌─────────────────────────────────────────────┐
│ 🟢 Front Garden Watering           [Edit] [⋮]│
│ Valves: Front Bed Valve · Side Tap           │
│ Tasks:  Water Tomatoes · Water Herbs         │
│ Schedule: Daily · 07:00 · 30 min             │
│ Last run: Today 07:01 · ✅ Success           │
│ [▶ Run now]          [Show history ▾]        │
└─────────────────────────────────────────────┘
```

### Run history panel (collapsed by default)

Shows last 10 runs: date, triggered_by badge (schedule/manual), status badge, devices fired, tasks completed. Error message if failed.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260515170000_automations.sql` | All 5 new tables + RLS + pg_cron |
| `supabase/functions/run-automations/index.ts` | New — cron + manual trigger handler |
| `src/components/integrations/AutomationsSection.tsx` | New |
| `src/components/integrations/AutomationCard.tsx` | New |
| `src/components/integrations/AutomationModal.tsx` | New |
| `src/components/integrations/AutomationRunHistory.tsx` | New |
| `src/components/integrations/IntegrationsPage.tsx` | Add AutomationsSection below device list |

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Sequential valve window > edge function timeout | Queue table + hourly drain. Function exits after inserting queue rows; valves fire in subsequent cron sweeps. |
| eWeLink token expiry (unattended runs) | Known pre-existing gap. `automation_run` records failure; user sees it in history. Scoped out — token refresh is a separate task. |
| Blueprint recurrence logic in Deno | Implement a minimal `isBlueprintDueToday(blueprint, date)` helper in `_shared` that evaluates the `recurrence_rule` JSON. Mirror the logic from the frontend `TaskEngine`. |
| Double-completion if same blueprint in two automations | Step 4 always checks `status='done'` before updating — safe to call concurrently. |
| Race between two cron runs | `last_run_date` update + `WHERE last_run_date < CURRENT_DATE` filter is idempotent. Second run finds the date already set and skips. |
| Weather data not yet fetched for today | If `weather_snapshots` has no row for today, treat as "no rain data → don't skip". Log a warning in the run record. |

---

## Out of Scope (This Plan)

- Tier 2 sensor-driven automations (schema scaffolded, no logic/UI)
- eWeLink token refresh
- Automation-specific task notifications (the task notification for that day is suppressed if the automation already marked it done before `daily-batch-notifications` runs)
- Multi-home automation management UI

---

## Verification Steps

1. Create an automation with one valve and one controlling blueprint
2. Set scheduled_time to 2 minutes from now; confirm the hourly cron fires it (or use Run Now)
3. Run Now → valve opens, task marked done, push notification received
4. Run Now again same day → second run still succeeds (tasks already done → skipped gracefully)
5. Enable weather skip with threshold 0mm → Run Now still fires (manual bypasses weather)
6. Delete automation → devices freed, can be linked to a new automation
7. Try linking a valve already in another automation → UI shows it as unavailable
8. `npx tsc --noEmit` clean throughout
