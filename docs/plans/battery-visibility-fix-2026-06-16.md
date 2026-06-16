# Battery visibility hot-fix

**Date:** 2026-06-16
**Status:** Plan — awaiting approval

## Problem

After shipping the Ecowitt voltage fix in 25.0003 the user still sees "no reading received" for both providers after hitting Refresh. Three independent issues plausibly contributing:

1. **Refresh doesn't touch eWeLink.** The button at the top of Integrations only invokes `integrations-ecowitt-poll`. For eWeLink, state is only fetched when the user opens a valve's Detail modal (triggers `ValveControlPanel.fetchState`). So a user who hits Refresh once expecting it to update everything sees no eWeLink battery, because no eWeLink path ever ran.
2. **Card pip is hidden entirely when battery is null** — same UI for "wired but waiting" and "not wired". User correctly wants battery info on the card itself, not buried in Settings.
3. **Voltage range may be too narrow.** AA Lithium nominal is 1.5V, range 1.0-1.7V. But some gateway firmware variants might centivolts (e.g. 150 for 1.5V) or other scales. Better to be permissive.
4. **Possible silent failure of the devices column update.** The `insertReading` helper updates `devices.battery_percent` without inspecting the response error — if the migration didn't actually land on prod the update fails and no one knows.

## Approach

### A. Make Refresh actually refresh everything

Extend `refresh()` in `IntegrationsPage` to also iterate all active eWeLink valves and call `integrations-ewelink-state` for each — same pattern as the existing Ecowitt poll call. Best-effort: if any individual valve errors we keep going to the next one and the final `load()` still re-reads from the DB. Net effect: tap Refresh once, every supported device is asked for fresh state including battery.

### B. Card-level battery visibility — always show *something*

Replace the conditional `BatteryPip` on `DeviceCard` with a small always-visible row: `Battery: 87%` colour-graded when known, or `Battery: —` muted when null with a tooltip explaining "no reading received yet — try Refresh or check that your device exposes a battery field". User gets battery info at a glance without opening Settings or Detail.

Same for `DeviceDetailModal` header — surface the battery prominently in the existing header row rather than only the small pip.

### C. Loosen the Ecowitt voltage range

Accept `0.5V - 3.5V` (covers AA + AAA + over-voltage edge cases) and `500 - 3500` for millivolts. Old narrow range was being safe but too strict — better to surface a slightly inaccurate value than nothing.

Also: when the parser returns `null` for a channel that DID have a `soilbatt{N}` value (i.e. the field was present but the value was out of range), log it via the structured logger so we can spot the actual values being sent and tighten the range later.

### D. Surface insert failures

Change `insertReading` so the `devices` UPDATE response error is logged (not thrown — still best-effort), and add `.select()` so we know whether the row was actually touched. If the column doesn't exist on prod we'll see it in Sentry / log streams instead of guessing.

### E. Self-diagnostic — verify migration landed

Add a one-shot read in `IntegrationsPage` to query the `information_schema.columns` view via a SECURITY DEFINER RPC `check_battery_columns_exist()` returning a boolean. If false, render a single banner: "Battery columns missing on database — contact support." Lets us instantly tell schema-missing apart from data-not-flowing without DB access.

Actually — simpler. Since `select("*")` on devices will return battery columns if they exist, we can detect the presence at the client without a new RPC: check if `Object.keys(devices[0]).includes("battery_percent")`. If not, show the banner. Zero new edge function needed.

## Files to change

- `src/components/integrations/IntegrationsPage.tsx` — extend Refresh; add the schema-missing banner.
- `src/components/integrations/DeviceCard.tsx` — always-visible battery row.
- `src/components/integrations/DeviceDetailModal.tsx` — battery surfaced in header.
- `supabase/functions/_shared/integrations/ecowittFields.ts` — wider voltage range; log out-of-range values.
- `supabase/functions/_shared/integrations/readings.ts` — surface UPDATE errors via the structured logger; verify the row was actually touched.
- `supabase/tests/ecowittFields.test.ts` — update voltage-range tests for the wider window.

## Plan size

Small. ~1h.
