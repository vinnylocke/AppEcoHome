# Make the type-check real + phantom-column schema audit

**Approved 2026-07-02** (follow-on from RHOZLY-3P/3Q — a missing `useRef` import and two non-existent columns all shipped because no gate checks either).

## Part A — burn down the ~151 type errors so `npm run typecheck` can gate
- Fix the leveraged shared causes first: `withRetry` should accept `PromiseLike<T>` (kills the whole builder-passed-to-withRetry class), missing fields on `UserProfile` in types.ts.
- Then per-file mechanical fixes (TaskCalendar, main.tsx, shepherdAdapter, WeatherForecast, AilmentWatchlist, automationEngine, DeviceBatteryPanel, AreaSensorsPanel, …). Type-only changes — zero behaviour changes; unit suite must stay green.
- Wire `npm run typecheck` into `scripts/deploy.mjs` (before the build step) so a type error can never ship again; document in CLAUDE.md's testing quick reference.

## Part B — phantom-column checker (`scripts/check-schema-columns.mjs`)
- Pulls the live schema from PostgREST's OpenAPI root (works against local or prod via env), extracts every table's real columns.
- Scans `src/` + `supabase/functions/` for `.from("table")…` chains and flags column names used in `.select()` / filters / `.order()` that don't exist (handles embedded `rel(...)`, aliases, `*`).
- Run once against PROD, fix every real finding, keep as `npm run check:schema` for ongoing use.

**App-reference consulted:** 19-rls-patterns / 10-edge-functions-catalogue (query conventions). **Docs to update:** CLAUDE.md (typecheck + check:schema commands), TESTING.md (new gate), 31-deployment.md (deploy step).

## Status — implemented 2026-07-02

- Part A done: 153 → 0 type errors (zero `@ts-expect-error`); `npm run typecheck` added; wired as deploy step 0 (before maintenance mode) alongside `npm run check:schema`.
- Part B done: `scripts/check-schema-columns.mjs` found 76 phantom references (plus 2 same-class bugs it can't scan: an INSERT payload and an embedded-rel typo — fixed opportunistically). All fixed; checker exits 0 against PROD. Several AI context builders regained real grounding data. Fields dropped from grounding for having no schema equivalent (candidates to re-add if persisted later): per-area `sunlight` (lux exists as `areas.light_intensity_lux`), area dims, climate avg-temp/rainfall, ailment severity, plant health_status; `postcode` → `country`.

### Grounding restored from existing data — 2026-07-02

- **Per-area sunlight — RESTORED.** New shared helper `supabase/functions/_shared/luxBand.ts` (`luxBand` + `luxBandLabel`) bands `areas.light_intensity_lux` (<10k low, 10–25k moderate, 25–45k bright, >45k full sun) into e.g. `bright (35000 lux measured)`; line skipped when lux is null. Wired into: `_shared/gardenContext.ts` (area facts + snapshot `sunlight` field), `_shared/userContext.ts` (`UserContextArea.lightIntensityLux` + garden render line), `_shared/visionEnvContext.ts` (`Sunlight:` line), `optimise-area-ai` (`SUNLIGHT:` prompt line), `generate-swipe-plants` (GARDEN AREAS — MEASURED LIGHT block), `suggest-rotation-plants` (fills the prompt's existing `areaContext.sunlight` slot), `generate-landscape-plan` (`sunlight` key in areas JSON). `plant-doctor-ai` needed no change (it only renders identity/location/weather/behaviour/preferences sections). Deno tests: `supabase/tests/luxBand.test.ts` (6 cases) + a sunlight-band case in `visionEnvContext.test.ts`.
- **Climate averages — RESTORED** in `_shared/gardenContext.ts`: fetches the home's `weather_snapshots.data` (columnar Open-Meteo daily arrays), computes the 7-day avg of daily (max+min)/2 midpoints and 7-day `precipitation_sum` total → `Climate: - Recent week: avg 18°C, 22mm rain`. Skipped entirely when no snapshot exists. Snapshot fields `climate.recent_avg_temp_c` / `climate.recent_rain_mm` keep the audit trail on `plan_overhaul_inputs.context_used`.
- **Deliberately NOT re-added** (no data exists — original note stands): area dims, ailment severity, plant health_status.

## Follow-ups — real runtime bugs surfaced by the type pass — ALL FIXED 2026-07-02
1. ✅ AilmentWatchlist ~1052/~1171 — buttons now call `() => searchPerenual(perenualQuery)` / `() => searchWithAI(aiQuery)` (same state vars as the Enter-key path); `as unknown as MouseEventHandler` casts removed.
2. ✅ AilmentWatchlist ~1745 — `plant_instance_ailments` added to `HOME_TABLES` (`src/context/HomeRealtimeContext.tsx`, with a realtime-cost note) and to the `supabase_realtime` publication + REPLICA IDENTITY FULL via migration `20260829000000_plant_instance_ailments_realtime.sql` (applied locally; **not yet pushed to remote**). Cast at the call site removed.
3. ✅ GardenEditorToolbar ~482 — floating-bubble Layers popover now passes the full overlay prop set (companions/frost/wind/pH/moisture), matching the desktop LayersGroup usage; `ComponentProps` spread-cast removed.
4. ✅ NewPlanForm ~148 — insert now `.select("id, name")`; `(newPlan as any)` cast removed; PLAN_CREATED logs the real `plan_name`.
5. ✅ PlantDoctorChat ~939 — `handleRegenerate` finds the last user message in the truncated history and passes its `content` as `userText`, so agent-chat receives the user turn it must re-answer.
6. ✅ GuideList ~732 — dead `(activeTab as string) === "community"` branch removed. The community empty state already renders correctly inside `CommunityGuidesTab.tsx` ("No community guides yet"), so the intent is satisfied there; the rhozly-tab empty state now unconditionally shows "No guides found".
7. ✅ Logger.warn — `context` (third arg) is now sent to Sentry via `withScope` + `setExtras` + `captureMessage(…, "warning")` when provided, mirroring Logger.error's context shape.

Validation after the fixes + grounding restore: `npm run typecheck` 0 errors; `npm run check:schema` 0 phantom columns (131 tables); `npm run test:unit` 1091/1091; `npm run test:functions` 751/751 (744 + 7 new); `npm run build` green.
