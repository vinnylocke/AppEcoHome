# Plan — Home Dashboard Tab

## Goal

Add a **Dashboard** tab as the first and default view on `/dashboard`. It shows a comprehensive weekly-stat overview of the home — how the week went, how today stands, and what the rest of the week looks like. The existing Locations / Calendar / Weather tabs shift one position to the right. Today's task list is preserved on this tab (moved from the right column into the Dashboard tab itself).

---

## Week Definition

**Mon 00:00 → Sun 23:59 in the user's local timezone.** The client computes `weekStart` and `weekEnd` as UTC ISO timestamps and passes them to the edge function. A helper `getLocalWeekBounds()` will be added to `src/lib/dateUtils.ts` (or similar).

---

## Stats Catalogue

### Section 1 — Tasks This Week

| Stat | Source | Drill-down |
|------|--------|-----------|
| Total tasks due | `tasks` WHERE `due_date` BETWEEN weekStart and weekEnd, scope visible to user | `/schedule` |
| Completed | above WHERE `status = 'Completed'` | `/schedule?filter=completed` |
| Completed by automation | above WHERE `auto_completed_reason IS NOT NULL` | `/schedule?filter=automated` |
| Overdue | `due_date < today` AND `status NOT IN ('Completed','Skipped')` | `/schedule?filter=overdue` |
| Pending | `due_date >= today` AND `status NOT IN ('Completed','Skipped')` | `/schedule?filter=pending` |
| Completion rate | `completed / total * 100` | (same as completed) |
| By category (Watering / Harvesting / Pruning / Maintenance / Planting / Other) | grouped by `tasks.type` | `/schedule?category=X` |
| Per-member breakdown | joined from `home_members` → `user_profiles`; completed tasks per `assigned_to` or `created_by` | `/schedule?assignee=userId` |
| Automation-completed | from `automation_runs.tasks_completed` JSONB array lengths, summed | `/integrations` |

**Notes:**
- Ghost tasks (blueprint-derived, not yet materialised) are **not** counted in historical completed/overdue stats. They are counted in the "upcoming" section (see below) because the daily cron materialises them at midnight — so for past days within the week, the `tasks` table is complete.
- Tasks with `scope = 'personal'` are filtered per RLS — users only see their own personal tasks in the breakdown.

---

### Section 2 — Garden This Week

| Stat | Source | Drill-down |
|------|--------|-----------|
| Total plant instances | `inventory_items` WHERE `status IN ('In Shed','Planted','Germinating')` | `/shed` |
| Plants added this week | `inventory_items` WHERE `created_at >= weekStart` | `/shed` |
| Harvest blueprints due this week | DISTINCT `blueprint_id` from `tasks` WHERE `type IN ('Harvesting','Harvest')` AND due in week | `/schedule?category=Harvesting` |
| Harvest blueprints completed | above AND `status = 'Completed'` | `/schedule?category=Harvesting&filter=completed` |
| Plant instances harvested | DISTINCT `instance_id` in `yield_records` WHERE `harvested_at` in week | `/shed` |
| Total yield this week | SUM(`value`) GROUP BY `unit` from `yield_records` in week | `/shed` (yield tab if present) |
| Pruning blueprints due this week | DISTINCT `blueprint_id` from `tasks` WHERE `type = 'Pruning'` AND due in week | `/schedule?category=Pruning` |
| Pruning blueprints completed | above AND `status = 'Completed'` | `/schedule?category=Pruning&filter=completed` |
| Plant instances pruned | DISTINCT `instance_id` from `pruning_records` WHERE `instance_id IS NOT NULL` | `/shed` |
| General pruning events | COUNT from `pruning_records` WHERE `instance_id IS NULL` | `/schedule?category=Pruning` |

**Harvest counting rationale (as specified):** One "harvest event" = one distinct blueprint, not one task instance. A blueprint that generates 3 physical tasks in the same week still counts as one harvest event. Plant instances harvested comes from the explicit `yield_records` log, not from tasks.

**Pruning counting:** Same blueprint-deduplication logic. A pruning blueprint can be pre-linked to one or more specific plant instances via a `blueprint_plant_instances` junction table. When a user marks a pruning task complete, those pre-linked instances are shown as pre-selected and a `pruning_record` is written per instance. If no instances are linked (or the user deselects them all), the pruning record is written with `instance_id = NULL` — this is **General Pruning** (not tied to any specific plant).

Stats accordingly split into:
- **Plant instances pruned** — `COUNT(DISTINCT instance_id) WHERE instance_id IS NOT NULL`
- **General pruning events** — `COUNT(*) WHERE instance_id IS NULL`

Both are counted under the "Pruning blueprints completed" total; they are sub-categories of it.

---

### Section 3 — Weather This Week

| Stat | Source | Drill-down |
|------|--------|-----------|
| Weather alert events | `weather_alerts` WHERE `is_active = true` OR triggered in week | `/dashboard?view=weather` |
| Rainfall so far (mm) | Sum `daily.precipitation_sum[]` for completed days in week from `weather_snapshots.data` JSONB | `/dashboard?view=weather` |
| Tasks auto-skipped by rain | `tasks` WHERE `status = 'Skipped'` AND `auto_completed_reason ILIKE '%rain%'` in week | `/schedule?filter=skipped` |

**Rainfall note:** The Open-Meteo snapshot stores `daily.precipitation_sum` as an array aligned to `daily.time`. The edge function iterates over past days in the current week and sums the values. Days with no data default to 0.

---

### Section 4 — Automations This Week

| Stat | Source | Drill-down |
|------|--------|-----------|
| Total runs | `automation_runs` WHERE `home_id` AND `triggered_at` in week | `/integrations` |
| Successful | above WHERE `status IN ('success','partial')` | `/integrations` |
| Failed | above WHERE `status = 'failed'` | `/integrations` |
| Tasks auto-completed | SUM of `jsonb_array_length(tasks_completed)` from successful runs | `/schedule?filter=automated` |

---

### Section 5 — Additional Stats (Additional suggestions for completeness)

| Stat | Source | Rationale | Drill-down |
|------|--------|-----------|-----------|
| Task completion streak | Consecutive days this week (Mon → today) with ≥ 1 completed task | Motivational — shows consistency | (inline tooltip) |
| Plant Doctor sessions | `plant_doctor_sessions` WHERE `home_id` AND `created_at` in week | Shows how actively the home is monitoring plant health | `/doctor` |
| New watchlist alerts | `ailments` WHERE `home_id` AND `created_at` in week AND `is_archived = false` | Shows pest/disease pressure this week | `/watchlist` |
| Shopping items purchased | `shopping_list_items` WHERE `home_id` AND `is_checked = true` AND `updated_at` in week | Closes the loop on procurement activity | `/shopping` |
| Most active member | The `user_id` with most completed tasks this week | Social/team context for multi-member homes | (same as per-member breakdown) |
| Most active location | Location with most completed tasks this week | Shows where effort is concentrated | `/dashboard?locationId=X` |

---

## "Upcoming — Rest of Week" Section

A compact day-by-day strip showing Mon → Sun. The cron job materialises at least a week ahead, so all days use the `tasks` table directly — no ghost task calculation needed.
- Days in the past: greyed out with their completed/total count
- Today: highlighted with pending count
- Future days: upcoming task count from the `tasks` table

Each day chip is clickable → navigates to `/dashboard?view=calendar` scrolled to that date.

---

## Architecture

### New Supabase Edge Function: `home-dashboard-stats`

**Why an edge function?** The stats require multiple complex joins that would cost 6-8 client-side round-trips. A single edge function runs them in parallel on the server, joins across `user_profiles` for display names (not accessible directly via client RLS), and parses the weather JSONB — reducing load time from ~1.5s to ~300ms.

**Accepts:** `{ homeId: string, weekStart: string, weekEnd: string, today: string }`

**Returns:** `HomeDashboardStats` (typed interface in a shared types file)

**Internal queries (run in parallel with Promise.all):**
1. Tasks this week (grouped by status, type, assigned_to)
2. Home members + profile display names
3. Automation runs this week
4. yield_records + pruning_records this week
5. inventory_items count + created_at this week
6. weather_alerts + weather_snapshot rainfall
7. plant_doctor_sessions count
8. ailments count this week
9. shopping_list_items purchased this week

### New Hook: `src/hooks/useHomeDashboardStats.ts`

```typescript
function useHomeDashboardStats(homeId: string | null) {
  // returns { stats: HomeDashboardStats | null, loading, error, refresh }
}
```

- Computes `weekStart`/`weekEnd` from local Monday midnight
- Calls `supabase.functions.invoke("home-dashboard-stats", { body: ... })`
- Caches in component state; re-fetches on manual refresh or when homeId changes

### New Component: `src/components/HomeDashboard.tsx`

Layout:
```
┌─────────────────────────────────────────────────┐
│  THIS WEEK AT A GLANCE           [Refresh]       │
│                                                  │
│  [Tasks]        [Garden]   [Weather] [Automations│
│   ■ 24 Total    ■ 42 Plants  3 alerts  5 runs    │
│   ■ 18 Done     ■ 4 Harvest  8.2mm    4 success  │
│   ■ 3 Overdue   ■ 3 Pruned   2 skipped 1 failed  │
│   ■ 3 Pending   ■ 1.3kg                          │
│                                                  │
│  [Mon] [Tue] [Wed] [Thu▶] [Fri] [Sat] [Sun]     │
│  (upcoming strip)                                │
│                                                  │
│  [Per-member breakdown — collapsible]            │
│  User A: 9  User B: 6  Automation: 3            │
│                                                  │
│  [Additional Stats — 2-col grid]                │
│  Streak: 3 days  |  Plant Doctor: 2 sessions    │
│  New Watchlist: 1 alert  |  Shopping: 4 bought  │
│                                                  │
│  TODAY'S TASKS ──────────────────────────────── │
│  (existing TaskList component)                   │
└─────────────────────────────────────────────────┘
```

Each stat tile is a small card with a number, label, and subtle right-arrow affordance on hover. Clicking navigates to the relevant route. Skeleton loaders fill the stat tiles while loading.

### Changes to `src/App.tsx`

1. Extend the view type union: `"dashboard" | "locations" | "calendar" | "weather"`
2. Change default: `|| "dashboard"` (was `|| "locations"`)
3. Add **Dashboard** as the first button in the tab switcher
4. The existing right-column `TaskList` render is removed from App.tsx and moved inside `HomeDashboard.tsx`
5. The Dashboard view renders `<HomeDashboard>` passing `homeId`, `locations`, `rawWeather`, `alerts`

---

## Migration

### Migration 1 — `blueprint_plant_instances` (junction table)

Links a blueprint to zero or more specific plant instances. Used for pruning blueprints to indicate which plants a recurring pruning task covers. Can also apply to any other blueprint type in the future.

```sql
CREATE TABLE blueprint_plant_instances (
  blueprint_id uuid NOT NULL REFERENCES task_blueprints(id) ON DELETE CASCADE,
  instance_id  uuid NOT NULL REFERENCES inventory_items(id)  ON DELETE CASCADE,
  PRIMARY KEY (blueprint_id, instance_id)
);

ALTER TABLE blueprint_plant_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members manage blueprint_plant_instances"
  ON blueprint_plant_instances FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_blueprints bp
      JOIN home_members hm ON hm.home_id = bp.home_id
      WHERE bp.id = blueprint_plant_instances.blueprint_id
        AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_blueprints bp
      JOIN home_members hm ON hm.home_id = bp.home_id
      WHERE bp.id = blueprint_plant_instances.blueprint_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_bpi_blueprint ON blueprint_plant_instances(blueprint_id);
CREATE INDEX idx_bpi_instance  ON blueprint_plant_instances(instance_id);
```

### Migration 2 — `pruning_records`

`instance_id` is **nullable**. A NULL value means the record is a General Pruning event — the task was completed but was not associated with any specific plant instance (either because none were linked to the blueprint, or the user explicitly chose "General pruning" at completion time).

```sql
CREATE TABLE pruning_records (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     uuid        NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  instance_id uuid        REFERENCES inventory_items(id) ON DELETE SET NULL,  -- NULL = general pruning
  task_id     uuid        REFERENCES tasks(id) ON DELETE SET NULL,
  pruned_at   timestamptz NOT NULL DEFAULT now(),
  notes       text
);

ALTER TABLE pruning_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members manage pruning_records"
  ON pruning_records FOR ALL TO authenticated
  USING (home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_pruning_records_home     ON pruning_records(home_id, pruned_at DESC);
CREATE INDEX idx_pruning_records_instance ON pruning_records(instance_id, pruned_at DESC);
```

The `task_id` FK links each pruning record to the task that triggered it, enabling drill-downs from the dashboard straight to the task.

### Completion UX (how pruning records get written)

When the user marks a Pruning task complete:

1. The app checks `blueprint_plant_instances` for the task's `blueprint_id`.
2. If linked instances exist → show a confirmation sheet listing those plants, pre-ticked. The user can untick any or add others from the same location/area.
3. If no instances are linked → show a compact prompt: "Log which plants you pruned?" with a plant picker and a **"General pruning (no specific plants)"** option pre-selected.
4. On confirm → write one `pruning_record` per ticked instance (`instance_id = plant_uuid`) plus one extra with `instance_id = NULL` if "General pruning" is also checked.
5. The user can skip the prompt entirely — the task is still marked complete; no pruning_record is written for that session.

This mirrors the yield recorder UX and keeps the data optional, so it doesn't create friction for users who don't need the tracking.

### Migration 3 — Performance index

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_home_week
  ON tasks(home_id, due_date, status);
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Add "dashboard" to view union, make it default, add tab button first, remove TaskList from right column, render HomeDashboard for new tab |
| `src/components/HomeDashboard.tsx` | NEW — stat card grid, upcoming strip, per-member breakdown, today's TaskList |
| `src/hooks/useHomeDashboardStats.ts` | NEW — weekly stats hook calling the edge function |
| `supabase/functions/home-dashboard-stats/index.ts` | NEW — aggregation edge function |
| `supabase/migrations/YYYYMMDD_blueprint_plant_instances.sql` | NEW — junction table linking blueprints to plant instances |
| `supabase/migrations/YYYYMMDD_pruning_records.sql` | NEW — pruning_records table (instance_id nullable for general pruning) |
| `docs/e2e-test-plan.md` | Add test rows for Dashboard tab |
| `release-notes.json` | Add "Home Dashboard" entry |

---

## Open Questions / Decisions Needed

1. ~~**Pruning records UX**~~ — **Resolved.** A pruning blueprint is linked to specific plant instances via `blueprint_plant_instances`. At task completion, linked instances are pre-selected. Tasks with no linked instances default to "General pruning" (instance_id = NULL). See Migration section for full UX flow.

2. ~~**Ghost task projection**~~ — **Resolved.** The cron job materialises at least a full week of tasks ahead of time. All tasks within the week window exist as physical rows in the `tasks` table — no ghost task logic needed anywhere in this feature.

3. ~~**Per-member drill-down**~~ — **Resolved as follow-on.** Dashboard shows the per-member breakdown inline (collapsible). The `/schedule?assignee=` filter is a separate follow-on task and is not in scope here.

4. ~~**Rainfall from weather snapshot**~~ — **Resolved.** No snapshot → rainfall stat shows "—" gracefully.

5. ~~**Week start preference**~~ — **Resolved.** Fixed as Monday, non-configurable for now.
