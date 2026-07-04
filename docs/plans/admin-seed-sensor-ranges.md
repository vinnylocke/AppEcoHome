# Admin: seed plant-library soil requirements on demand

## Goal

In **Plant Library Admin**, let an admin pick a **quantity of library plants** that are missing soil requirements and **generate them on demand** (moisture / EC / soil-temp) — instead of waiting for the daily `backfill-plant-sensor-ranges` cron — with the same live run feedback the Seed/Verify runs give.

## What already exists (reuse, don't rebuild)

- **The generation itself:** `_shared/plantCareRangeGen.ts` (prompt/schema/parser) + `_shared/sensorRangeBackfill.ts` (pure `needsRangeBackfill` / `buildRangePatch` / `selectBackfillRows`, Deno-tested) + the `backfill-plant-sensor-ranges` cron edge fn — all built in the sensor-requirements feature.
- **The admin run pattern** (`PlantLibraryAdmin.tsx`): a "Manual runs" section of **RunBlock** cards (count input + Run button + optional Repeat & schedule). `handleSeed`/`handleVerify` call `triggerSeedRun(count, userId)` / `triggerVerifyRun(count, userId)` (`plantLibraryAdminService.ts:410-437`), which invoke the `seed-plant-library` / `verify-plant-library` edge fns with `{ count, triggered_by }` and return `{ run_id }`.
- **Run tracking** (`plant_library_runs`, migration `20260624000900_plant_library.sql:138-153`): each edge fn creates a `status='running'` row, runs in the background via `EdgeRuntime.waitUntil`, calls its own `updateRunProgress()` (counts + tokens + cost + `model_usage`) and `finalizeRun()` (`succeeded`/`partial`/`failed`). The admin UI **polls every 3s** and renders each row in **Recent runs** (Requested / Inserted / Skipped / Failed / Tokens / Est. cost / Duration / Status). RLS gates reads to admins; writes are service-role.
- **Stats strip** (`fetchPlantLibraryStats`, `plantLibraryAdminService.ts:56-91`): four `COUNT(*)` queries on `plant_library` (total / unverified / matched / amended). Easy to add a fifth.
- **Route gating:** `App.tsx` only mounts `/admin/plant-library` when `profile.is_admin`; the component redirects non-admins.

## App-reference consulted

- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — the `soil_*` columns + the seeder/backfill/self-heal paths (documents `backfill-plant-sensor-ranges`).
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` + `11-cron-jobs.md` — the seed/verify/backfill functions + cron conventions.
- (Plant Library Admin has no dedicated app-reference file today — the surface is documented via the edge-fn catalogue + data-model; I'll add coverage where the docs mandate.)

Source read: `PlantLibraryAdmin.tsx` (RunBlock, `handleSeed`, stats), `plantLibraryAdminService.ts`, `backfill-plant-sensor-ranges/index.ts`, `_shared/sensorRangeBackfill.ts`, `seed-plant-library/index.ts` (run create/finalize + `waitUntil`), `20260624000900_plant_library.sql`, `20260624001900_plant_library_run_schedules.sql` (kind → URL dispatcher).

## Proposed changes

### 1. Shared orchestrator (avoid duplicating the backfill loop)

Extract the query→generate→persist→progress loop into `supabase/functions/_shared/sensorRangeBackfillRun.ts`:

```ts
runSensorRangeBackfill(db, apiKey, {
  table: "plant_library" | "plants",
  limit,
  aiAttribution: { userId, homeId },   // cron = {null,null}; admin = {adminId,null}
  onProgress?: (delta: { filled; skipped; failed; usage }) => Promise<void>,
}): Promise<{ scanned; filled; skipped; failed }>
```

- Reuses the pure `needsRangeBackfill` / `buildRangePatch` from `sensorRangeBackfill.ts` (kept pure).
- **Refactor `backfill-plant-sensor-ranges` (the cron) to call it** (library then global `plants`), so there's ONE implementation.
- The admin fn calls it for `plant_library` only, passing an `onProgress` that updates the run row.

### 2. New admin edge fn `seed-plant-sensor-ranges`

Mirrors `seed-plant-library`:
- `requireAuth` → **`requireAdmin`** (read `user_profiles.is_admin` for the JWT user — see Open Q3; the existing seed/verify don't gate server-side, but this one spends Gemini so a server check is worth adding).
- Body `{ count, triggered_by }`. Clamp `count` to a max (Open Q2).
- Create a `plant_library_runs` row `{ kind: "sensor_ranges", triggered_by, count_requested: count, status: "running" }`.
- `EdgeRuntime.waitUntil(runSensorRangeBackfill("plant_library", limit=count, aiAttribution={userId: triggered_by}, onProgress → updateRunProgress))`, then `finalizeRun`.
- Return `{ run_id }` (202), so the UI polls it live — identical to Seed/Verify.
- **Meaning of the run counters for this kind:** `count_inserted` = plants whose ranges were filled, `count_skipped` = plants already complete (no gap), `count_failed` = generation failures. Renders fine in the existing Recent-runs table.

### 3. Migration — widen the `kind` CHECK

`plant_library_runs.kind` is currently `CHECK (kind IN ('seed','verify'))`. Add `'sensor_ranges'`:

```sql
ALTER TABLE public.plant_library_runs DROP CONSTRAINT <kind_check>;
ALTER TABLE public.plant_library_runs ADD CONSTRAINT <kind_check> CHECK (kind IN ('seed','verify','sensor_ranges'));
```

(No new columns; grants already exist.) If repeat-scheduling is in scope (Open Q1), also widen `plant_library_run_schedules.kind` + add a `WHEN 'sensor_ranges' THEN '.../seed-plant-sensor-ranges'` case to `tick_plant_library_schedules()`.

### 4. Service — `triggerSensorRangeSeedRun(count, userId)`

In `plantLibraryAdminService.ts`, mirroring `triggerSeedRun`: `invoke("seed-plant-sensor-ranges", { body: { count, triggered_by: userId } })` → `{ run_id }`. Also extend `fetchPlantLibraryStats` with a fifth count **`missingRanges`** = `plant_library` rows where any of the six `soil_*` columns `IS NULL` (an `.or()` count) so the admin sees the backlog.

### 5. UI — a "Soil requirements" run + a "Missing ranges" stat

- Add a **StatCard "Missing ranges"** to the stats strip (from `stats.missingRanges`) so the admin knows how many need seeding before picking a quantity.
- Add a **RunBlock "Soil requirements"** to the Manual runs section (or its own card): count input (default e.g. 100, max = Open Q2), "Run soil requirements", wired to a `handleSeedSensorRanges` that mirrors `handleSeed`. Its run then appears in Recent runs and polls live. Repeat & schedule only if Open Q1 = yes.

## Tests

- **Deno:** `sensorRangeBackfill.test.ts` already covers the pure selection/patch. Add a small Deno test for `runSensorRangeBackfill`'s progress accumulation if it can be exercised with an injected fake `db`/`gemini` (or keep the orchestrator thin and rely on the pure-helper coverage + manual admin verification).
- **Vitest:** add coverage only if a new pure client helper is introduced (likely none — the stat is a query).
- **Playwright:** admin-gated (seeded test accounts aren't admins), so an end-to-end run isn't feasible in CI. Add a component-level/mocked check that the "Soil requirements" RunBlock + "Missing ranges" stat render, or document manual admin verification in the e2e-test-plan. Confirm at implementation which is practical.

## Docs to update

- `10-edge-functions-catalogue.md` — new `seed-plant-sensor-ranges` (admin) + note the cron now shares `runSensorRangeBackfill`.
- `03-data-model-plants.md` — the admin on-demand seeding path + the new `plant_library_runs.kind='sensor_ranges'`.
- `e2e-test-plan/` + `TESTING.md` if a spec/Deno test is added.

## Decisions (approved 2026-07-04)

- **O1 — Repeat-scheduling:** ✅ **single manual run** only (no schedule plumbing this pass).
- **O2 — Max count per run:** ✅ default **100**, cap **2000**.
- **O3 — Server-side admin check:** ✅ **add `requireAdmin`** to the new fn. The existing seed/verify lack it — flagged as a separate follow-up, not retrofitted here.
- **O4 — Scope:** ✅ **library only** (`plant_library`). Confirmed the library is the shared global reference — RLS `FOR SELECT TO authenticated USING (true)` (`20260624000900_plant_library.sql:126-130`), so every signed-in user reads it and seeding it benefits all users; only edge fns (service-role) write it. The daily cron still also sweeps the global `plants` catalogue.
- **Cost visibility:** the run row already tracks tokens + est. cost per model, so the admin sees spend per run in Recent runs — no extra work.
