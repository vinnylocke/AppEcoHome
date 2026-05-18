# Plan — Issue 7: Valve State History

## Current State

`HistoryChart.tsx` renders `<p>Valve state history coming soon.</p>` for `device_type === "water_valve"`. No data is collected.

## Goal

Replace "coming soon" with a timeline showing each turn-on / turn-off event per day, with timestamps, duration, and trigger source (scheduled, manual, rain-skipped).

---

## Part A — Database

### New table: `valve_events`

```sql
CREATE TABLE valve_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  automation_id UUID REFERENCES automations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('turn_on', 'turn_off')),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('scheduled', 'manual', 'rain_skipped')),
  duration_seconds INTEGER,   -- populated on turn_on events; NULL for turn_off
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_valve_events_device ON valve_events(device_id, fired_at DESC);
CREATE INDEX idx_valve_events_home ON valve_events(home_id, fired_at DESC);
```

**New migration:** `supabase/migrations/20260520000000_valve_events.sql`

RLS: only home members can read valve_events for their home.

---

## Part B — Write Events in run-automations

In `fireValve` (the function that actually calls eWeLink), after a successful response, insert into `valve_events`:

- `event_type: 'turn_on'`
- `triggered_by`: derived from context (`is_manual`, or `skipped_weather` for rain skips)
- `duration_seconds`: from the automation config

When `drainValveQueue` processes a `command = 'turn_off'` entry (Issue 4 fix), insert:

- `event_type: 'turn_off'`
- `triggered_by`: same as the paired turn_on event

For rain-skipped runs, insert a synthetic event:

- `event_type: 'turn_on'` with `triggered_by: 'rain_skipped'` and `duration_seconds: 0` — records that the automation was evaluated but valves were not opened.

**File:** `supabase/functions/run-automations/index.ts`

---

## Part C — UI: ValveTimeline Component

Replace the "coming soon" paragraph in `HistoryChart.tsx` with a new `<ValveTimeline>` component.

**New file:** `src/components/integrations/ValveTimeline.tsx`

### Data fetching

Query `valve_events` for the device, ordered by `fired_at DESC`, last 30 days.

### Layout

Group events by calendar date. For each day:

```
📅 Monday 12 May
  ↑ 07:01 AM  Turned on  · 20 min · Scheduled
  ↓ 07:21 AM  Turned off
  🌧  07:00 AM  Skipped (rain)
```

Turn-on/off pairs are shown together. Rain-skipped events use a rain icon.

### Empty state

"No valve activity in the last 30 days."

---

## Files Changed / Created

| File | Change |
|------|--------|
| `supabase/migrations/20260520000000_valve_events.sql` | New: `valve_events` table + indexes + RLS |
| `supabase/functions/run-automations/index.ts` | Write valve_events after successful fireValve calls |
| `src/components/integrations/ValveTimeline.tsx` | New: timeline UI component |
| `src/components/integrations/HistoryChart.tsx` | Replace "coming soon" with `<ValveTimeline deviceId={deviceId} />` |

---

## Execution Order

1. Write + apply migration locally (`supabase migration up`)
2. Update run-automations to write events
3. Build ValveTimeline component
4. Wire into HistoryChart
5. User confirms → `supabase db push` + redeploy
