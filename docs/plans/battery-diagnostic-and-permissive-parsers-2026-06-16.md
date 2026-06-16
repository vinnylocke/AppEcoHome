# Battery — diagnostic dump + permissive parsers

**Date:** 2026-06-16
**Status:** Plan — awaiting approval

## Problem

After three hot-fixes, the user still doesn't see battery. The most reliable next step is to look at the actual JSON each provider returns, then make the parser match. Today I'm guessing field names against partial docs. Two improvements:

1. **Permissive parsing now** — broaden where each parser looks, so common field-name variants are picked up even if the doc is unclear.
2. **Inspection tool** — let the user grab the raw provider response from inside Rhozly and paste it back, so we can target the actual shape without more guessing.

## Approach

### A. Ecowitt — look in more places for battery

The `device/real_time` v3 API returns nested per-channel data. Battery is currently being searched only in the flat `soilbatt{N}` key (correct for the webhook POST format, NOT confirmed for the cloud API). Expand the flattener + parser to also check:

- `data.soil_ch{N}.battery.value` (channel-nested, v3 cloud convention)
- `data.soil_ch{N}.voltage.value` (some firmware variants)
- `data.battery.soilmoisture_sensor_ch{N}` (top-level battery block — common Ecowitt convention across other sensor families)
- Any field key inside the channel wrapper matching `/^batt/i` or `/^voltage$/i` as a last-resort fallback. Logs which one matched so we can tighten later.

The flattener also stamps a top-level `battery_top_block` shadow map so the per-channel parser can pick `battery.soilmoisture_sensor_ch1` → `soilbatt1` for backward compat.

### B. eWeLink — expand candidate list + scan `params` permissively

- Add more candidates: `battery`, `battPercentage`, `batteryPercentage`, `batteryLevel`, `batt`, `voltage`.
- Last resort: scan all keys of `params` for any matching `/batt/i` with a numeric 0-100 value.
- Clarification in code comment: `getDevicePowerUsage` is for mains-powered Sonoff POW (current consumption in kWh), not for SWV / Zigbee valve battery. We stay on `thing/status` + `params`.

### C. New `integrations-inspect-device` edge function

JWT-verified, `integrations.manage` gated. Takes `deviceId`, looks up the integration's provider + credentials, calls the same API the sync path uses, and returns the **raw** response JSON. No transformation.

UI surface: new **"Inspect raw provider response"** button in `DeviceSettingsModal` (below the battery diagnostic). Opens a small modal with the raw JSON in a `<pre>` + a copy-to-clipboard button. The user can paste it back so we can target the actual shape for the next iteration.

This is the diagnostic equivalent of the Test Webhook simulator — gives the user a way to see exactly what their hardware sends without leaving the app.

### D. Tests

- New cases for each Ecowitt battery location (channel-nested, top-level battery block, voltage variant, /batt/i fallback).
- New eWeLink cases for the expanded candidate list + the regex fallback.

## Files

- `supabase/functions/_shared/integrations/ecowittFields.ts` — broaden battery search
- `supabase/functions/_shared/integrations/ewelinkDevice.ts` — broaden + comment
- `supabase/functions/integrations-inspect-device/index.ts` — new edge fn
- `supabase/config.toml` — register the new fn
- `src/components/integrations/InspectDeviceModal.tsx` — new UI
- `src/components/integrations/DeviceSettingsModal.tsx` — open-inspect button
- `supabase/tests/ecowittFields.test.ts` + `supabase/tests/ewelinkDevice.test.ts` — new cases

## Plan size

Small-medium. ~1.5h.
