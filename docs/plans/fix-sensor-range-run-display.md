# Fix — soil-requirements run shows "0" in admin + transient sweep Sentry noise

## Problem
After deploying the self-chaining soil-requirements run, an admin run of 100 completed **succeeded with `count_inserted = 100`** in the DB (verified: the library's missing-range count dropped exactly 100, 93,464 → 93,364), but the Plant Library Admin **Recent runs** table showed **0**, and Sentry logged **RHOZLY-3S**.

Two independent causes:

1. **Display bug (the visible "0").** `RunRow` (`PlantLibraryAdmin.tsx:1558`) renders the Inserted/Matched column as
   `run.kind === "seed" ? run.count_inserted : run.count_matched`.
   A `sensor_ranges` run writes `count_inserted`, so the non-seed branch shows `count_matched` (always 0 for these runs). Backend was always correct.
2. **RHOZLY-3S — transient network blip.** The best-effort stale-run **sweep** (`sweepStalePlantLibraryRuns`, run on page load) threw `TypeError: Failed to fetch` (a one-off mobile network drop). It's already caught, but logged via `Logger.error` → Sentry. Both `Logger.error` and `Logger.warn` route to Sentry, so a network blip becomes a paged error. It has no effect on runs (retries next load).

## App-reference consulted
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` (sensor-range fns — confirmed `count_inserted` is the field these runs write)
- `docs/app-reference/07-management/10-plant-library-admin.md` (Recent-runs table / RunRow — the surface being fixed)

## Changes (all in `src/components/admin/PlantLibraryAdmin.tsx`)
1. **Line 1558** — map the column by kind correctly: `run.kind === "verify" ? run.count_matched : run.count_inserted` (verify → matched; seed & sensor_ranges → inserted).
2. **Line 1552 (Kind cell)** — render `sensor_ranges` as "Soil ranges" (raw value shows the ugly "Sensor_ranges"); seed/verify unchanged.
3. **Sweep catch (≈line 119)** — skip logging when the error is a transient fetch failure (`/failed to fetch/i`); still `Logger.error` for real failures.

## Not changing
- No backend/edge/migration change — the run pipeline is verified correct.
- No new count columns; `count_amended`/`count_matched` stay 0 for sensor_ranges (N/A), which is fine under the shared header.

## Tests / docs
- `npm run typecheck` + `npm run build` before deploy.
- Update `docs/app-reference/07-management/10-plant-library-admin.md` RunRow column note to record that `sensor_ranges` reports in the Inserted column.
- No E2E spec covers RunRow column values today; the change is display-logic only. No Page Object/selector/route/label change that would break existing specs.

## Deploy
Frontend-only → build + Vercel. Since a UI fix ships, deploy via the normal pipeline; **+1 bump, no user-facing release note** (internal admin fix).
