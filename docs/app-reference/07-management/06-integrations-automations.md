# Integrations — Automations Tab

> The Automations sub-tab inside Integrations. Watering automations that fire at a scheduled time, control one or more valves, and optionally tie to task blueprints. Skip-if-rained, retry-on-failure, sequential vs parallel valve firing.

**Route:** `/integrations?tab=automations`
**Source files:**
- `src/components/integrations/AutomationsSection.tsx` — list
- `src/components/integrations/AutomationCard.tsx` — per-automation card
- `src/components/integrations/AutomationModal.tsx` — builder (~700 lines)
- `src/components/integrations/AutomationRunHistory.tsx` — run history
- `supabase/functions/run-automations/index.ts` — cron runner

---

## Quick Summary

Each automation:

- Fires daily at a `scheduled_time`.
- Opens one or more valves for `duration_seconds`.
- Optionally fires valves sequentially (one at a time).
- Optionally skips if rain >= `rain_threshold_mm` in the last 24h.
- Optionally retries on provider failure.
- Optionally ties to one or more `task_blueprints`:
  - **Controlling**: completing this blueprint task triggers the automation immediately.
  - **Driven**: when the automation runs, it auto-completes the linked blueprint task.

Each run writes a `automation_runs` row; the card shows last-run status pill.

---

## Role 1 — Technical Reference

### Component graph

```
AutomationsSection
├── New Automation button
├── List of AutomationCard
│   ├── Header (name, active toggle, last-run pill)
│   ├── Devices summary
│   ├── Schedule + duration
│   ├── Blueprint links (controlling / driven)
│   ├── Edit button
│   └── Delete button
└── AutomationModal (builder)
    ├── Name input
    ├── Devices selector (valves from this home)
    ├── Schedule time picker
    ├── Duration input
    ├── Sequential fire toggle
    ├── Skip if rained + threshold
    ├── Retry on failure toggle
    ├── Blueprint links section
    └── Run history (AutomationRunHistory)
```

### `AutomationFull` shape

```ts
{
  id, home_id, name, is_active,
  scheduled_time, duration_seconds,
  fire_valves_sequentially, skip_if_rained, rain_threshold_mm, retry_on_failure,
  last_run_date,
  devices: [{ device_id, device_name }],
  blueprints: [{ blueprint_id, blueprint_title, role: "controlling" | "driven" }],
  lastRun: { id, status, triggered_at, triggered_by } | null,
}
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | IntegrationsPage | Scope |
| `canManage` | `boolean` | IntegrationsPage | Gates create/edit/delete |
| `canRun` | `boolean` | IntegrationsPage | Gates manual "Run now" |

### Data flow — read paths

```ts
supabase.from("automations")
  .select(`
    *,
    automation_devices(device_id, devices(id, name)),
    automation_blueprints(blueprint_id, role, task_blueprints(title))
  `)
  .eq("home_id", homeId)
  .order("created_at");

supabase.from("automation_runs")
  .select("id, automation_id, status, triggered_at, triggered_by")
  .in("automation_id", ids)
  .order("triggered_at", { ascending: false });
```

### Data flow — write paths

| Action | DB / function |
|--------|--------------|
| Create | `automations.insert(...)` + `automation_devices.insert(...)` + `automation_blueprints.insert(...)` |
| Edit | `automations.update(...)` + diff-update of join tables |
| Toggle active | `automations.update({ is_active })` |
| Delete | `automations.delete()` (cascades join tables) |
| Manual run | `run-automations` edge fn invoked with `automationId` |

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `run-automations` | Fires due automations; called both by cron and on manual run |

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `run-automations` | Every 1 minute — checks for due automations |
| `analyse-weather` | Sets rain totals consumed by skip-if-rained |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `automations.manage` — create/edit/delete.
- `automations.view` — read.

### Error states

| State | Result |
|-------|--------|
| Provider failure | `automation_runs.status = "failed"`; retry if enabled |
| No devices selected | Builder validation error |
| Skip-if-rained triggered | `automation_runs.status = "skipped"`; no provider call |

### Performance

- Cron runs every minute but only fires due automations.
- Sequential fire serialises valve open commands; parallel fires them concurrently.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use automations

If you've installed smart valves, automations are the difference between "I have to remember" and "Rhozly does it". Set up once: water bed 1 for 5 minutes at 6:30 AM, skip if rain forecast >5mm, retry once if my Wi-Fi flakes.

### Every flow on this tab

#### 1. New automation

- Name + pick valves.
- Schedule time + duration.
- Sequential vs parallel firing.
- Skip-if-rained threshold (e.g. 5mm).
- Retry-on-failure toggle.
- (Optional) link to task blueprints:
  - **Controlling**: tick the watering task → automation runs immediately.
  - **Driven**: automation runs → auto-tick the watering task.

#### 2. Edit / delete

- Pencil → modal.
- Trash → confirm.

#### 3. Toggle active

- Switch per card. Off = won't run.

#### 4. Last run

- Card shows last run status: ran / skipped (rain) / failed / never.

#### 5. Run history

- Inside the edit modal — full audit trail.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Schedule time | When it fires (in home timezone) |
| Duration | Seconds the valve stays open |
| Sequential | Valves open one at a time (water pressure) vs all at once |
| Skip if rained | Don't fire if recent rain exceeds threshold |
| Retry | One additional attempt on provider failure |
| Last run pill | Status badge: ran / skipped / failed |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Setting duration too long.** Watering for 20 minutes daily floods the bed. Start with 3–5 minutes and adjust.
- **Skip-if-rained too low.** 1mm threshold means almost every drizzle skips. 5mm is a sensible default.
- **Parallel firing on weak water pressure.** Multiple valves open at once may underflow. Use sequential.
- **Forgetting to enable.** New automations default off — toggle on.

### Recommended workflows

- **Set up:** create one automation per bed → start with conservative durations → adjust weekly.
- **Mid-season:** review run history for failures — provider sync issues usually surface here.
- **End of season:** disable rather than delete; re-enable in spring.

### What to do if something looks wrong

- **Automation didn't run:** check `automation_runs` for that date. If "skipped", check rain threshold. If "failed", check valve provider connection.
- **Valves opened but no water:** Wi-Fi reached the valve but valve itself jammed. Manual check needed.
- **Repeated failures:** OAuth token may have expired. Re-run Connect from the Devices tab.

---

## Related reference files

- [Integrations — Devices Tab](./05-integrations-devices.md)
- [Integrations — Soil Readings](./07-integrations-readings.md)
- [Blueprint Manager](../04-planner/07-blueprint-manager.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md)
- [Data Model — Integrations (cross-cutting)](../99-cross-cutting/09-data-model-integrations.md)

## Code references for ongoing maintenance

- `src/components/integrations/AutomationsSection.tsx` — list
- `src/components/integrations/AutomationCard.tsx`
- `src/components/integrations/AutomationModal.tsx` — builder
- `src/components/integrations/AutomationRunHistory.tsx`
- `supabase/functions/run-automations/index.ts` — runner cron
- `supabase/migrations/*_automations.sql` — schema
