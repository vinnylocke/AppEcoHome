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

## Follow-ups — real runtime bugs surfaced by the type pass (deliberately not fixed in a type-only change)
1. AilmentWatchlist ~1052/~1171 — Perenual + AI search BUTTONS pass the MouseEvent as the query string → TypeError, click does nothing (Enter works).
2. AilmentWatchlist ~1745 — `useHomeRealtime("plant_instance_ailments")`: table not in HOME_TABLES → subscription never fires.
3. GardenEditorToolbar ~482 — floating-bubble Layers popover lacks companions-overlay props → its "Companions" button throws.
4. NewPlanForm ~148 — PLAN_CREATED event logs `plan_name: undefined` (only `id` selected).
5. PlantDoctorChat ~939 — regenerate path sends `message: undefined` to agent-chat.
6. GuideList ~732 — "No community guides yet" empty state is dead code (wrong tab branch).
7. Logger.warn third-arg context is accepted but never logged.
