# Readings + AI Area Coach on the dashboard area view

## Problem
Sensor readings (`AreaSensorsPanel`) + the AI Area Coach (`AreaAiAnalysisPanel`)
only live in Location Management's Area Metrics modal. Users want them on the
**dashboard area view** too (`AreaDetails`), where they already manage an area.

## Current state (verified)
- `AreaDetails.tsx` is the dashboard area view. It already receives `homeId` +
  `aiEnabled` props and mounts `AreaInsightsPanel` (line ~514) with both.
- `AreaSensorsPanel` (`{ areaId, areaName, homeId }`) and `AreaAiAnalysisPanel`
  (`{ areaId, homeId, aiEnabled }`) are self-contained and already used in
  LocationManager — they can be reused as-is.

## App-reference consulted
- [03-garden-hub/03-location-manager.md](../app-reference/03-garden-hub/03-location-manager.md)
  — current home of the panels (Area Metrics modal tabs).
- The dashboard AreaDetails reference (in `02-dashboard/` or `03-garden-hub/`) —
  the surface gaining the panels; update it.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md),
  [14-caching.md](../app-reference/99-cross-cutting/14-caching.md),
  [17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) — Coach
  gating + cache (unchanged; same component, same `area_ai_insights` cache).

## Approach
Mount the two panels in `AreaDetails` (e.g. a "Readings" / "AI Area Coach"
section or the same two-tab strip used in LocationManager). Props are already in
scope (`area.id`, `area.name`, `homeId`, `aiEnabled`). No new data/edge work —
the Coach uses the same cache-aware `area-sensor-analysis`, so opening it from
either surface shares the cached insight.

Decision to confirm: **inline section** vs **a tabbed block** mirroring the modal.
Recommend a small collapsible "Environment & AI Coach" section so it doesn't
crowd the dashboard area view, with the AI tab gated by `aiEnabled` (upgrade
card otherwise — the panel already handles this).

## Files
| File | Change |
|------|--------|
| `src/components/AreaDetails.tsx` | import + mount `AreaSensorsPanel` + `AreaAiAnalysisPanel` (tab or collapsible section); pass `area.id`/`name`/`homeId`/`aiEnabled` |

## Tests
- **Vitest**: none new (panels already covered). If a pure layout helper is added,
  test it.
- **e2e**: extend the dashboard area spec — open an area, assert the readings
  panel + the AI Area Coach tab/section render (AI tab gated by tier).

## Risks
- Two mount points for the Coach → make sure both pass the same `homeId`/`areaId`
  so they hit the same cache row (they will; keyed by `area_id`).
- Dashboard density — use a collapsible section to avoid clutter.

## Docs to update
- The AreaDetails surface reference (add the panels), and a cross-link from
  `03-location-manager.md`.
