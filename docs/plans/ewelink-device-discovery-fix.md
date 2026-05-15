# Plan — eWeLink Device Discovery Fix

## Problem

Three issues in the device discovery pipeline:

1. **Wrong field name** — edge function filters `t.type === 1` but the API returns `itemType`, not `type`. Both items have `itemType: 1` but `t.type` is always `undefined`, so the filter drops everything → 0 discovered devices.

2. **Sub-device metadata not passed through** — the SWV-ZNE water valve is a Zigbee sub-device connected via a ZBBridge-P. Its control requires `parent_device_id` (the bridge's `deviceid`) and `sub_device_id` (the Zigbee `subDevId` from params), which are different from the device's own `deviceid`. These values are available in the API response but not forwarded to the wizard or stored in `devices.metadata`.

3. **Bridge included in discoverable list** — the ZBBridge-P hub appears in `thingList` alongside the water valve. Users should not be able to add the bridge as a device — it's infrastructure. Bridge devices have `params.subDevices` array; controllable leaf devices do not.

Confirmed from live API response:
- Water valve: `deviceid: "a480134c69"`, `params.parentid: "10026c962a"`, `params.subDevId: "fffffd341438c1a47047"`
- Bridge: `deviceid: "10026c962a"`, `params.subDevices: [...]`, no `parentid`

## Changes

### 1. `supabase/functions/integrations-ewelink-connect/index.ts`

- Change `t.type === 1` → `t.itemType === 1`
- Filter out hub/bridge devices: exclude any device where `v.itemData?.params?.subDevices` is a non-empty array
- Add `isSubDevice`, `parentDeviceId`, `subDeviceId` fields to each discovered device:
  - `isSubDevice = !!params.parentid`
  - `parentDeviceId = params.parentid ?? null`
  - `subDeviceId = params.subDevId ?? null`
- Remove the `[diag]` console.log lines added for debugging

### 2. `src/components/integrations/ConnectDeviceWizard.tsx`

Add optional fields to `DiscoveredDevice`:
```typescript
export interface DiscoveredDevice {
  externalDeviceId: string;
  name: string;
  channel?: number;
  model: string;
  isSubDevice?: boolean;
  parentDeviceId?: string | null;
  subDeviceId?: string | null;
}
```

### 3. `src/components/integrations/wizard/Step5Confirm.tsx`

Fix `buildMeta` for eWeLink to use actual sub-device fields:
```typescript
// eWeLink sub-device (e.g. SWV-ZNE via ZBBridge-P)
if (device.isSubDevice) {
  return {
    model: device.model,
    use_sub_device: true,
    parent_device_id: device.parentDeviceId,
    sub_device_id: device.subDeviceId,
    default_duration_seconds: 1800,
  };
}
// eWeLink direct device
return {
  model: device.model,
  use_sub_device: false,
  direct_device_id: device.externalDeviceId,
  default_duration_seconds: 1800,
};
```

## No frontend UI changes

Step4Discovery and Step5Confirm already handle the device list correctly — no changes to the display logic are needed. The new fields are stored as metadata and used by the control/state edge functions.

## Risk

Low. All changes are in the discovery and persistence layer — the control and state functions already support both direct and sub-device paths (`buildControlPayload`, `parseDeviceState`). The metadata schema matches what those functions already expect.

## Files

| File | Change |
|------|--------|
| `supabase/functions/integrations-ewelink-connect/index.ts` | Fix filter, add sub-device metadata, remove diag logs |
| `src/components/integrations/ConnectDeviceWizard.tsx` | Add 3 optional fields to `DiscoveredDevice` |
| `src/components/integrations/wizard/Step5Confirm.tsx` | Fix `buildMeta` to use actual sub-device fields |
