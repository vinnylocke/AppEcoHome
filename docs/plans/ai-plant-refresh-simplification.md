# Plan — Simplify the AI plant refresh model

## What the user actually wants

> "All I want is a simple feature for AI plants where you can update them if they are out of date and it updates the care guide for you and shows you the fields that have changed. I don't want to add a plant, then refresh and find there's 10 changes in less than 30 seconds."

Three concrete grievances mapped to root causes:

| Symptom | Root cause |
|---|---|
| Pot Marigold calls `plant-doctor`, Desert Marigold calls `manual-refresh-ai-plant` — two different network requests | We have **two refresh paths**: orphan rows go through `plant-doctor.generate_care_guide` (self-heal), linked rows go through `manual-refresh-ai-plant`. Both end up calling Gemini and updating `care_guide_data`, but via different endpoints with different semantics. |
| Refreshing seconds after adding finds "10 changes" | `manual-refresh-ai-plant` **re-runs Gemini on every click** and diffs against the stored guide. Gemini at temp 0.2 still produces minor wording variation across calls → diff fires → version bumps. Repeat → noise. |
| "maintenance" gets flagged as a changed field but isn't visible on the form | `STRUCTURED_CARE_FIELDS` (used by the diff) includes fields that aren't rendered to the user. `maintenance`, `care_level`, `growth_rate` are in the payload + cared about by Gemini but never rendered in `ManualPlantCreation`. The chip lists them and the user has no UI to see what changed. |

The architecture has drifted further than the user's mental model. Time to bring it back to "one button, one endpoint, no spam".

## New model

**The cron is the only thing that runs Gemini.** Manual refresh becomes a "pull pending updates from the catalogue" button — never calls Gemini itself.

```
        ┌──────────────────────────────────────────────────────────────────┐
        │ refresh-stale-ai-plants  (daily cron, only thing that hits Gemini)│
        │   ├── walks global AI rows whose last_freshness_check_at > 90 d   │
        │   ├── runs diffCareGuide                                          │
        │   └── on change: bumps freshness_version + updates care_guide_data│
        │                  + updates top-level columns (new)                │
        └──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  global plant row (home_id = NULL)  freshness_version = 2         │
        │                                     last_care_generated_at = ... │
        │                                     care_guide_data = {…}        │
        │                                     watering_min_days = 5  (new) │
        └──────────────────────────────────────────────────────────────────┘
                                 │
                  has_update = global.fv > user_ack.seen_fv
                                 │
                                 ▼
       ┌────────────────────────────────────────────────────────────────┐
       │  "Refresh Care Guide" button → ONE endpoint, NO Gemini call    │
       │   ├── load home plant + resolve global parent (auto-link if    │
       │   │   orphan; no Gemini, just lookup by name)                  │
       │   ├── compute filtered diff between home top-level fields and  │
       │   │   global top-level fields (only user-visible fields)       │
       │   ├── if any → apply global's values to home's top-level cols  │
       │   │   + upsert user_plant_ack at global.freshness_version      │
       │   └── return { changed: bool, changed_fields: string[] }      │
       └────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                "Care guide refreshed — N fields updated" / "Up to date"
```

The button stops being expensive and non-deterministic. The cron is the single source of truth for what's a "new version".

## Changes by file

### `supabase/functions/manual-refresh-ai-plant/index.ts` — full rewrite

Accept either `plantId` (legacy: global id) OR `homePlantId` (new: any AI plant the user has — orphan, shallow fork, or pure global). The function:

1. Loads the plant row. Verifies caller is a home member.
2. **Resolve the global** for this row:
   - `source === 'ai' AND home_id IS NULL` → row IS the global. (Power-user case.)
   - `forked_from_plant_id IS NOT NULL` → that's the global.
   - Orphan (`source = 'ai' AND home_id != NULL AND forked_from_plant_id IS NULL`) → look up an existing global by `scientific_name_key` OR `common_name ILIKE`. If none exists, **promote this home row** by:
     - Inserting a global row with the same data (via service-key, race-safe via the unique index).
     - Setting this home row's `forked_from_plant_id` to the new global's id.
     - **No Gemini call.** We use the home row's existing data.
3. **Compute the filtered diff** between the home row's top-level user-visible columns and the global's. Only count fields from the new `USER_VISIBLE_CARE_FIELDS` list (no description, no maintenance/care_level/growth_rate).
4. If pending changes:
   - UPDATE the home row's top-level columns from the global (excluding `overridden_fields` entries — but on a shallow fork that array is empty, so all visible fields sync).
   - Upsert `user_plant_ack` at `global.freshness_version`.
   - Insert a `plant_care_revisions` row with `source = 'manual_refresh'` IF the global advanced since the last revision. (Optional, mostly for audit.)
   - Return `{ changed: true, changed_fields, freshness_version: global.fv }`.
5. If no pending changes:
   - Just upsert ack (defensive — clears any stale chip).
   - Return `{ changed: false, freshness_version: global.fv }`.

**Rate limit**: keep the existing `AI_REFRESH_RATE_LIMIT_MINUTES` window (per user, per plant). With no Gemini call, this is mostly a button-spam guard — could even be dropped, but keeping it preserves the abstraction. Default 7 days, env override to 1 minute locally.

**No Gemini call anywhere in the function.**

### `supabase/functions/_shared/refreshStaleAiPlants.ts` — cron also updates top-level columns

Currently the cron only updates `care_guide_data` jsonb. The home rows + the global itself never get their top-level columns synced from new Gemini data, so even though the cron "found 3 changes", the form keeps showing old data.

Fix: when the cron writes a new `care_guide_data`, ALSO update the global's top-level columns from the new payload. The manual-refresh function then copies those down to the home rows on click.

This is the change that makes the whole pipeline actually deliver updated values to the user.

### `supabase/functions/_shared/aiPlantCatalogue.ts` — trim the diff fields

Replace `STRUCTURED_CARE_FIELDS` with `USER_VISIBLE_CARE_FIELDS` that EXACTLY matches what `ManualPlantCreation` renders:

```ts
export const USER_VISIBLE_CARE_FIELDS = [
  "plant_type",
  "cycle",
  "watering_min_days",
  "watering_max_days",
  "sunlight",
  "flowering_season",
  "harvest_season",
  "pruning_month",
  "propagation",
  "attracts",
  "is_toxic_pets",
  "is_toxic_humans",
  "indoor",
  "is_edible",
  "drought_tolerant",
  "tropical",
  "medicinal",
  "cuisine",
] as const;

// Free-text fields are intentionally NOT included in the diff. Gemini
// produces small wording variations on every call which would flag
// "description changed" on every refresh — pure noise.
export const FREE_TEXT_CARE_FIELDS: readonly string[] = [];
```

Removed because the user can't see them in the form:
- `common_name` (rendered, but never changes from a Gemini regen for the same species)
- `scientific_name` (same)
- `care_level`, `growth_rate`, `maintenance` — internal, never rendered
- `thumbnail_url` (cosmetic, not a "field change" worth flagging)
- `description` — free-text noise

`diffCareGuide` is updated to iterate only `USER_VISIBLE_CARE_FIELDS`. Same change to the client-side mirror in `src/lib/aiPlantOverrides.ts`.

### `src/components/PlantEditModal.tsx` — drop the orphan branch

Strip the entire `healOrphan` helper + the `if (!freshness)` branch. The handler becomes:

```ts
const handleManualRefresh = async () => {
  if (refreshing) return;
  setRefreshing(true);
  try {
    const { data, error } = await supabase.functions.invoke(
      "manual-refresh-ai-plant",
      { body: { homePlantId: plant.id } },
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (data?.changed) {
      const n = (data.changed_fields ?? []).length;
      toast.success(`Care guide refreshed — ${n} field${n === 1 ? "" : "s"} updated.`);
    } else {
      toast.success("Care guide is up to date.");
    }
    // Tell the parent to re-fetch so the form shows the new top-level values.
    onClose();
  } catch (err: any) {
    // ... existing rate-limit toast handling stays
  }
};
```

One endpoint, no orphan branch, no `PlantDoctorService.generateCareGuide` import here.

The freshness hook (`useAiPlantFreshness`) and chip remain — they're how the user knows there's a pending update before they click. Orphan rows already correctly return null from the hook → no chip shown until the first manual-refresh self-heals the link.

### `src/lib/aiPlantOverrides.ts` — same field-list trim

Update `OVERRIDABLE_CARE_FIELDS` to match `USER_VISIBLE_CARE_FIELDS`. Drop description, common_name, scientific_name, care_level, growth_rate, maintenance from the override-detection set. Editing those non-rendered fields shouldn't trigger the detach modal anyway (the user can't reach them via the form).

### Tests + docs

- **`tests/unit/lib/aiPlantOverrides.test.ts`** — update the field list assertions.
- **`supabase/tests/aiPlantCatalogue.test.ts`** — update the diff test cases (no description, trimmed structured fields).
- **`docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md`** — rewrite the Refresh flow subsection to match the new "no Gemini, one endpoint" model.
- **`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`** — update `manual-refresh-ai-plant` entry: now takes `homePlantId`, never calls Gemini.
- **`docs/plans/ai-plant-overhaul.md`** — add a "Refresh model simplification" subsection under the Wave 7 post-fix section.

## What this does and doesn't change

**Does fix:**
- One network call from the Refresh button (always `manual-refresh-ai-plant`).
- No more "10 changes in 30 seconds" — manual refresh doesn't call Gemini, so it can't produce noise. Only the daily cron does.
- `maintenance` won't be flagged because it's removed from the diff.
- Orphan plants self-heal on first Refresh click invisibly to the user.

**Doesn't change:**
- The cron's job (running Gemini every 90 days per global).
- The Revert button (uses the existing `revert_ai_plant_fork_in_place` RPC).
- The Wave 6 detach-on-edit flow for user edits.
- The catalogue dedup, shallow-fork model, ack-based chip — all stay.

**Trade-offs:**
- Sage+ users can no longer "force-regenerate" a fresh care guide on demand. The button now strictly applies whatever the cron has produced. If this matters later, a separate "Generate New Version" admin/power-user action can be added — but the simple Refresh button stays simple. The user explicitly asked for this.
- The current 7-day rate limit on manual-refresh becomes mostly cosmetic (no Gemini cost). We keep it as a button-spam guard.

## Process

1. Update the field lists in both shared + client.
2. Rewrite `manual-refresh-ai-plant/index.ts` (no Gemini, orphan-aware).
3. Update the cron to sync top-level columns from `care_guide_data`.
4. Strip `healOrphan` from PlantEditModal.
5. Update tests (Vitest + Deno).
6. Manual verify locally:
   - Open Pot Marigold (orphan) → click Refresh → expect "up to date" toast + modal closes + Pot Marigold now linked.
   - Open Desert Marigold (linked, no pending update) → Refresh → "up to date".
   - Click Refresh again 5s later → "up to date" again (no new revision).
7. Typecheck + Vitest + Deno tests.
8. Update docs.
9. Commit + push.

Migration of existing data: none required. The cron will start syncing top-level columns on its next run for any plant it processes; in the meantime, manual-refresh will report "up to date" for plants whose home rows match the global's frozen-at-add-time data. This is acceptable — we're not retroactively claiming we have a new version when we don't.
