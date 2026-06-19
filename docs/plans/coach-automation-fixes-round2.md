# Area Coach + automation fixes (round 2)

Investigation of the 2026-06-19 feedback, all confirmed against the reporting user's prod data.

## App-reference consulted
- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — builder, run-limit, condition tree, run statuses.
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `automation_runs.status`, run-limit columns.
- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants.soil_*`, library back-fill.
- [03-garden-hub/03-location-manager.md](../app-reference/03-garden-hub/03-location-manager.md) — AI Area Coach panel.
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md), [27-weather.md](../app-reference/99-cross-cutting/27-weather.md).

---

## Fix 1 — Manual-plant soil ranges only partially populate

**Root cause:** [`CARE_RANGE_SCHEMA`](../../supabase/functions/_shared/plantCareRangeGen.ts#L12-L22) has **no `required` array** (and uses uppercase `"OBJECT"`/`"NUMBER"` types, unlike the working lowercase+`required` `AREA_ANALYSIS_SCHEMA`). Gemini therefore omits fields → only some of the 6 ranges return, and they drift each 15-min regen. Confirmed: the Strawberry's mins came from a partially-seeded Fragaria `plant_library` row, not generation; EC + maxes stayed null despite 4 generation calls in 24h.

**Change:** add `required: [all 6 fields]` + lowercase types to `CARE_RANGE_SCHEMA`. Then full ranges generate → persist to `plants` AND top up the partial `plant_library` row (existing back-fill logic). Deploy `area-sensor-analysis` (bundles the shared module).

**Test:** Deno unit on `plantCareRangeGen` (schema has `required`; `parseCareRangeResponse` round-trips all 6).

---

## Fix 2 — Area Coach: dedupe per plant + show each plant's recommended ranges

**Confirmed:** the bed has **11 Strawberry instances, all the same `plant_id`** → the per-plant analysis repeats "Strawberry" 11×. Also the per-plant section shows only fit pills, not the actual target numbers.

**Change (`area-sensor-analysis/index.ts` + `areaAnalysisPrompt.ts` + `AreaAiAnalysisPanel.tsx`):**
- **Dedupe** the `plants` array by `plant_id` (fallback `plant_name`) before building the prompt + per-plant analysis — one entry per unique plant (optionally `× N`).
- **Per-plant ranges:** add a deterministic `plants[]` block to the insight (name + moisture/EC/temp ideal `[min,max]` from `careById`) so the panel shows e.g. *"Strawberry — moisture 30–60%, EC 800–1800 µS/cm, soil-temp 15–27 °C"* next to the AI fit. Deterministic (no AI drift).

**Test:** Deno (dedupe helper pure-tested), Playwright (one card per plant).

---

## Fix 3 — `complete task` action: chip selector + search (match `task_due`)

**Change (`AutomationBuilderModal.tsx`):** replace the `<select>` in `BlueprintActionSelect` with single-select toggle chips + the existing `pickerFilter` search, mirroring `TaskFields` in `ConditionNodeEditor`. Frontend only. **Test:** Playwright.

---

## Fix 4 — Automation looks like it should run but doesn't (and no skip is logged)

**Root cause (two layers):**
1. **It's rate-limited, working as configured.** The automation has `run_limit_count = 2 / 24h`; it fired 2× on 06-18 (12:35 + 14:05), both still inside the rolling 24h window → correctly capped until they age out (~12:35 today). CH2=27 <30 + no rain ⇒ condition true; the engine reaches the run-limit gate and decides `rate_limited`.
2. **The skip is invisible (the actual bug).** [`automation_runs_status_check`](../../supabase/migrations/20260530000000_automations.sql#L73-L75) only allows `pending/success/partial/failed/skipped_weather/skipped_no_tasks` — **missing `skipped_rate_limited` and `deferred_weather`**. So the skip-run INSERT violates the constraint and silently fails (the engine doesn't check the insert error) → run history shows nothing → looks broken.

**Change:**
- **Migration** widening `automation_runs_status_check` to every status the engine writes: `pending, success, partial, failed, skipped_weather, skipped_no_tasks, skipped_rate_limited, deferred_weather` (audit `_shared` for any others before finalising).
- **`evaluate-automations`**: check the skip/defer/run INSERT error and `logError` on failure, so a future status mismatch can't silently swallow runs again.
- **UI** (`AutomationRunHistory` / `automationRunSummary.ts`): render `skipped_rate_limited` as *"Skipped — run limit reached (N/Hh)"* so the reason is explicit. (Confirm unknown statuses already degrade to a neutral chip.)

**Note (UX):** the run limit is the user's own setting; surfacing it (above) is the fix, not changing the default.

**Test:** migration applied locally; Deno test the status set; Playwright the history chip.

---

## Fix 5 — Weather snapshot: FALSE ALARM (no fix needed)

My initial "no `weather_snapshots` row" was a **diagnostic error** — the probe query selected `created_at`, but the column is `updated_at`, so it errored and I misread it as missing. The snapshot **exists** (last `updated_at` 2026-06-19 07:18; rain 0 mm / 4% prob / 25.7 °C max), so `readForecast` reads real data and the rain leaf correctly resolves `false`. No code change. Minor observation: `updated_at` is a few hours old, suggesting the hourly `sync-weather` cron lags — worth a glance during the engine/cron review (Fix 6) but not a bug on its own.

---

## Fix 6 (separate, larger) — Hybrid event-driven automation engine

User chose the hybrid model. **Design (own plan doc to follow):** evaluate sensor-triggered automations the moment a new `device_readings` row is ingested (the webhook/poll already writes those) — scoped to automations linked to that sensor/area — for near-real-time response that scales with reading volume; keep the 5-min cron only for **time / date_range / weather** conditions. Decouple evaluation from valve actions via the existing queue. This is a substantial change (new trigger/edge path, idempotency, dedupe vs the cron) and will get its own plan + phased rollout — not bundled with the bug fixes above.

---

## Deployment note
Fixes 1–2 + 4 touch **edge functions** (`area-sensor-analysis`, `evaluate-automations`) — these deploy via `supabase functions deploy` (part of `npm run deploy`). Fix 4 also needs a **migration** (`supabase db push`). Fix 3 is frontend-only (Vercel). All to be applied locally first.
