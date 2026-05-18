# Plan — Issue 6: Valve Shows Offline (Device Card)

## Root Cause

`DeviceCard.tsx` determines online/offline status using `last_seen_at`:

```ts
const isOnline =
  device.last_seen_at
    ? Date.now() - new Date(device.last_seen_at).getTime() < 60 * 60 * 1000
    : false;
```

Soil sensors send periodic readings, so `last_seen_at` stays fresh. Water valves only update `last_seen_at` when they fire — which may be days ago. The 60-minute threshold always fails → valve always shows offline.

When the modal opens it re-queries device status from eWeLink directly, which correctly shows online — this is why it appears online after the modal loads.

## Fix

For `device_type === "water_valve"`, skip the time-based check entirely. Instead, treat the valve as online if it has a valid `external_device_id` (i.e. it was successfully linked) and the integration itself is connected.

```ts
const isOnline = device.device_type === "water_valve"
  ? !!device.external_device_id  // valve: online if linked
  : device.last_seen_at
    ? Date.now() - new Date(device.last_seen_at).getTime() < 60 * 60 * 1000
    : false;
```

If we want to be more precise, we could also check `device.integration?.status === "connected"`, but `external_device_id` presence is the simplest reliable signal.

## File Changed

| File | Change |
|------|--------|
| `src/components/integrations/DeviceCard.tsx` | Update `isOnline` logic for water_valve |

## Risks

- If a valve is unlinked or the eWeLink account disconnects, it will still show online unless `external_device_id` is cleared on disconnect. Acceptable — the modal will show the real status when opened.
