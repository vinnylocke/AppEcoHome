# grow-guide refresh cron failing nightly (Sentry RHOZLY-3B)

## Problem

`refresh-stale-grow-guides` (cron, 03:30 UTC daily) threw every run:
`column plants_1.data does not exist` — 18 events / 18 days. The nightly grow-guide
freshness refresh has been fully broken.

## Root cause

`_shared/refreshStaleGrowGuides.ts` selected `plants(common_name, scientific_name, source,
data)`, but `plants` has no `data` column. `extractManualNotes(source, data)` reads
`description/notes/manual_notes` out of that object — the real column is **`plant_metadata`**
(jsonb, migration `20260527200000`).

## Fix

`data` → `plant_metadata` in three spots: the embedded select (line ~110), the `PlantJoinRow`
type (line ~54), and the `extractManualNotes(…, plantInfo.data)` call (line ~147).
`extractManualNotes` logic is unchanged.

## Verify

`deno check` clean; full Deno suite (666) green. A unit test wouldn't have caught this (it's a
PostgREST/schema mismatch only surfaced at runtime); the change just realigns the query to the
real column. Tagged `Fixes RHOZLY-3B`.
