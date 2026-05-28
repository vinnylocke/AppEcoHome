# Realtime — Supabase Channels, Presence

> Rhozly uses Supabase Realtime (Postgres → WebSocket) to keep multi-device + multi-user state in sync. Each home-scoped table can be subscribed to via the `useHomeRealtime(table, callback)` hook. Presence is used for showing "X is editing this plan" in Plan Staging.

---

## Quick Summary

```
Postgres ──► Supabase Realtime ──► WebSocket ──► Browser
                                                    │
                                                    └── useHomeRealtime(table, callback)
                                                        triggers callback on INSERT/UPDATE/DELETE
                                                        scoped via home_id filter
```

---

## Role 1 — Technical Reference

### `useHomeRealtime` hook

```ts
useHomeRealtime("plans", refetchPlans);
useHomeRealtime("task_blueprints", refetchBlueprints);
useHomeRealtime("shopping_lists", refetchLists);
useHomeRealtime("shopping_list_items", refetchItems);
useHomeRealtime("integration_devices", refetchDevices);
// etc.
```

Internally:
- Opens a Supabase channel per table.
- Filters by `home_id = currentHomeId`.
- Calls the callback on any change event.
- Cleans up on unmount.

### Channels in active use

| Table | Subscribers |
|-------|-------------|
| `plans` | PlannerDashboard |
| `task_blueprints` | BlueprintManager |
| `shopping_lists` | ShoppingLists hook |
| `shopping_list_items` | ShoppingLists hook |
| `integration_devices` | IntegrationsPage |
| `automations` | AutomationsSection |
| `home_dashboard_stats` (if subscribed) | Dashboard |
| `plants` (Wave 1 of AI Plant Overhaul) | `useCachedShed` only — refetch when home-scoped rows change. `useAiPlantFreshness` does NOT yet subscribe to realtime because `useHomeRealtime` filters by `home_id` and global AI plants have `home_id IS NULL`. Wave 5 ships a fetch-on-mount model; freshness only refreshes on page navigation. Realtime on globals is deferred to Wave 7 if cross-device freshness sync becomes important. |
| `user_plant_ack` (Wave 1 of AI Plant Overhaul) | Published in the `supabase_realtime` table set so the channel is available, but no client currently subscribes. Wave 5 uses optimistic local updates from `useAiPlantFreshness.acknowledge()` instead of waiting for a realtime echo. Wave 7 could add a sub for cross-device sync (acknowledging on phone clears chip on desktop immediately). |

### Presence (`PresenceAvatars`)

Plan Staging opens a presence channel keyed on `plan.id`. Other users editing the same plan appear as avatar chips.

```ts
const channel = supabase.channel(`plan:${plan.id}`)
  .on("presence", { event: "sync" }, () => { ... })
  .subscribe();
channel.track({ user_id, name, joined_at });
```

### RLS implications

Realtime respects RLS — you only receive events for rows you have read access to.

### Rate limits

Supabase Realtime has connection + message limits per tier. The hook batches subscriptions where possible.

### Reconnection

WebSocket auto-reconnects on flap. Pending events may be lost during the gap — pair with pull-to-refresh as the manual fallback.

### `HomeRealtimeContext` — the shared home channel

`HomeRealtimeContext` opens ONE channel per home (`home-realtime-${homeId}`) that multiplexes postgres_changes subscriptions across a fixed set of home-scoped tables (`HOME_TABLES`). Components register interest via `useHomeRealtime(table, callback)`; the context fans changes out to registered callbacks.

**Scalability Wave D (2026-05-28):** the table set was trimmed from 13 → 11. `weather_snapshots` and `weather_alerts` were removed — they change on an hourly cron, never from user action, so per-client realtime push was pure overhead (realtime server memory + CPU scale with concurrent clients × tables × write rate). The dashboard now refetches weather on tab-focus (throttled to once per 5 min) via a `visibilitychange` handler in `App.tsx` instead. The remaining 11 tables all change from user action and benefit from sub-second cross-client freshness.

### Where Realtime is NOT used

Weather snapshots + alerts (hourly cron — dashboard refetches on tab-focus; removed from realtime in Wave D).
Garden Shapes (single-user editing model — collab edit is a future feature).
Chat messages (single-user; the agent confirm cards hydrate from `chat_tool_calls` on load instead).

---

## Role 2 — Expert Gardener's Guide

### Why realtime matters

If you and your partner both have Rhozly open and they tick off a task, your screen updates within seconds. No manual refresh.

Presence in Plan Staging tells you "they're looking at this plan right now" — useful for "don't both edit at once".

### Implications

- Most lists self-refresh.
- Some screens (Tasks, Layout) still need pull-to-refresh.
- If realtime drops (network flap), pull-to-refresh forces sync.

---

## Related reference files

- [Pull To Refresh](../09-persistent-ui/07-pull-to-refresh.md)
- [Sync Indicator](../09-persistent-ui/05-sync-indicator.md)
- [Offline Queue](./16-offline-queue.md)

## Code references for ongoing maintenance

- `src/hooks/useHomeRealtime.ts`
- `src/components/PresenceAvatars.tsx`
- Supabase Realtime config (channels)
