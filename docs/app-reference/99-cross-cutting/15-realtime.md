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

### Where Realtime is NOT used

Tasks (use `generate-tasks` cron + manual refresh).
Garden Shapes (single-user editing model — collab edit is a future feature).
Chat messages (single-user).

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
