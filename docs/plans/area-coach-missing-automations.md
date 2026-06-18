# Plan — Area Coach misses automations linked to the area's devices

## Problem
The AI Area Coach doesn't list automations the user has for that area.

## Root cause
`area-sensor-analysis` gathers an area's automations two ways:
1. `automations.area_id == areaId` (the Scope picker, Batch B+), and
2. automations that control a device in the area — but it only checks the **legacy
   `automation_devices`** join (`index.ts:240`).

The unified condition builder (current) stores valves in **`automation_actions.target_device_id`**, not `automation_devices`. So a condition automation whose valve lives in the area but which has no `area_id` set is matched by **neither** path → missed.

## App-reference consulted
- [`07-management/06-integrations-automations.md`](../app-reference/07-management/06-integrations-automations.md) (actions vs legacy devices)
- [`03-garden-hub/03-location-manager.md`](../app-reference/03-garden-hub/03-location-manager.md) (Area Coach)
- [`99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md)

## Approach
In the device-linkage step, also collect automation ids from
`automation_actions.target_device_id IN areaDeviceIds`, unioned with the
`automation_devices` ids. Pure helper `uniqueAutomationIds(...lists)` (Deno-tested) does
the dedupe. One edge-function change; the existing per-area dedup + `area_id` path are
unchanged.

Note: the Coach caches per area and regenerates on a newer sensor reading or `force`. The
panel's **Refresh** button passes `force`, so users see the change immediately after
refresh (no separate cache change needed).

## Files
| File | Change |
|------|--------|
| `supabase/functions/_shared/automationAreaLinks.ts` (new) | `uniqueAutomationIds` pure helper |
| `supabase/tests/automationAreaLinks.test.ts` (new) | Deno tests |
| `supabase/functions/area-sensor-analysis/index.ts` | also query `automation_actions` for device links |
| `docs/app-reference/.../06-integrations-automations.md` / Area Coach refs | note both link paths |

## Tests
- Deno: union + dedupe + empty. `test:functions` green; `deno check` clean.

## Risks
- None material — additive query; dedupe prevents double-counting an automation matched by
  both `area_id` and a device link.

## Deploy
`supabase functions deploy area-sensor-analysis` + `deploy-app-only` (release notes) →
commit + push. No migration.
