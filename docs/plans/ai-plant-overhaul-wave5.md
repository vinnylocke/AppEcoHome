# Plan — AI Plant Overhaul Wave 5: In-app freshness UI

## Goal

Make the freshness loop visible to users. The cron from Wave 4 already runs every night, diffs care guides, and bumps `freshness_version` + writes `plant_care_revisions` rows. Wave 5 surfaces that activity in the UI:

1. An **"Updated" chip** appears on AI plant cards in The Shed when the user's `seen_freshness_version` is behind the catalogue's current `freshness_version`.
2. The **Plant Edit Modal Care tab** renders a yellow callout listing the changed fields, with a "Mark as reviewed" button that upserts `user_plant_ack`.
3. The **Instance Edit Modal Care Guide tab** mirrors that callout.
4. A **"Refresh now" button** (Sage+ only, hidden when the rate limit blocks) sits on the Care tab for global AI plants — wired to the existing `manual-refresh-ai-plant` edge function (already shipped in Wave 2).

This wave is **read-only** — no fork-on-edit flow, no "Reset to catalogue", no `<DetachConfirmModal>`. Those land in Wave 6 alongside the override semantics.

## Deferred-work register (Waves 1–4 → tracked here so Wave 7 can close them)

The user asked for an explicit register so we can connect everything up at the end.

| # | From | Item | Status | Where it lands |
|---|------|------|--------|----------------|
| D1 | Wave 3 | `useAiPlantFreshness` hook | Deferred to Wave 5 | This wave (§ Hook) |
| D2 | Wave 3 | `PlantSearchModal` single-add **AI** branch is pre-existing broken (Add-to-Shed only handles Perenual + Verdantly; an `_provider === "ai"` previewPlant falls through into the Perenual branch) | Out of scope until Wave 7 polish | Wave 7 |
| D3 | Wave 3 | TheShed AI bulk-add still creates a per-home `plants` row (shallow fork) instead of pointing `inventory_items` directly at the global plant_id | Deferred indefinitely — shallow forks work today | Wave 7 (decide: collapse or keep) |
| D4 | Wave 4 | §13 Pass 2 backfill — per-home AI duplicate collapse | Deferred until real prod data exists | Wave 7 (one-shot script) |
| D5 | Wave 4 | UI for freshness chips + per-field highlight | Deferred to Wave 5 | This wave |
| D6 | All | RLS audit of `plants` UPDATE policy (Wave 1 already tightened to deny user updates on AI globals; verify no Perenual flow regressed) | Done in Wave 1 — needs **production smoke test** after first deploy | Wave 7 verification step |

The Wave 7 plan (post-Wave-6 cleanup) will work through D2 / D3 / D4 / D6 explicitly. Wave 5 closes D1 + D5.

## App-reference files consulted

- [03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — confirms `user_plant_ack.seen_freshness_version`, `plants.freshness_version`, `plants.updated_care_fields`, `plants.forked_from_plant_id`, `plants.last_care_generated_at`. Confirms shallow-fork semantics from Wave 3.
- [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — confirms `manual-refresh-ai-plant` is Sage+ tier-gated and 7-day rate-limited at the edge.
- [15-realtime.md](../app-reference/99-cross-cutting/15-realtime.md) — confirms `plants` and `user_plant_ack` are in the `supabase_realtime` publication (added in Wave 1 migration `20260620000300_ai_plant_overhaul_realtime.sql`).
- [17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) — confirms Sage+ check uses `user_profiles.ai_enabled` flag.
- [03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — current Shed grid card structure.
- [08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — Care tab layout, ManualPlantCreation embed.
- [08-modals-and-overlays/08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — Care Guide tab fetches the plant record on tab open.
- `docs/plans/ai-plant-overhaul.md` §8.1–8.5 (read paths + components) and §8.6 Case A only (Wave 5 scope).

## Design tension to flag up-front

**The data model isn't quite where the Wave 5 UI assumes it is.** The original plan (§8.1) assumed `inventory_items` would point directly at the global AI plant_id. But Wave 3 took the **shallow-fork** approach instead — when a user adds a catalogue AI plant, we create a per-home `plants` row with `forked_from_plant_id = global_id, overridden_fields = []`. The home row's care fields are frozen at import time; the global row gets updated by the cron.

For Wave 5 to be meaningful, the Shed + the two modals need to **read the global parent's `freshness_version`, `updated_care_fields`, and (in the modal callout) the changed-field values** via the `forked_from_plant_id` link.

This wave commits to that approach: **the chip's source of truth is the global parent.** Mark-as-reviewed writes a `user_plant_ack` row keyed by the **global plant_id** (not the home-scoped row's id). That matches the schema (`user_plant_ack.plant_id` is just an integer FK; the same user can ack the same global from any of their homes consistently).

If Wave 7 ever collapses shallow forks into pure `inventory_items → global` references, the same UI keeps working — only the JOIN simplifies. So this is forward-compatible.

## What lands in Wave 5

### 1. Hook — `src/hooks/useAiPlantFreshness.ts`

```ts
export interface PlantFreshness {
  global_plant_id: number;          // the canonical AI plant id (forked_from on shallow forks; same id on globals)
  freshness_version: number;
  seen_version: number;             // user's ack version (0 if no ack row)
  updated_care_fields: string[];    // most recent diff
  last_care_generated_at: string | null;
  has_update: boolean;
  acknowledge: () => Promise<void>; // upserts user_plant_ack at the global plant_id + current version
}

export function useAiPlantFreshness(plants: { id: number; forked_from_plant_id: number | null; source: string }[]): {
  byPlantId: Record<number, PlantFreshness | null>;   // keyed by the home-scoped row id (or global id) the caller passed in
  loading: boolean;
  refresh: () => void;
}
```

Behaviour:
- For each input row whose `source === "ai"`:
  - If `forked_from_plant_id != null` → the global is `forked_from_plant_id` (shallow fork).
  - Else if `home_id IS NULL` would be the case for the row (we'll trust `source === "ai" && forked_from_plant_id IS NULL` as the global self-case).
  - Else (a deep fork with `overridden_fields != []`) → return `null` for that row. **Forks don't get the chip.**
- Issues two queries in parallel:
  - `plants` for the distinct set of global IDs → `freshness_version, updated_care_fields, last_care_generated_at`.
  - `user_plant_ack` for `(auth.uid(), plant_id IN [...global_ids])` → `seen_freshness_version`.
- Subscribes to realtime on `plants` (filtered to the global IDs in scope) — re-fetches the version on any update. Cleanup on unmount.
- `acknowledge()` performs an upsert against `user_plant_ack` keyed by `(user_id, global_plant_id)` with the current `freshness_version`.

### 2. Shared components — `src/components/aiPlants/`

A small new folder so we don't add three files to the top-level `components/` directory.

**`UpdatedChip.tsx`** — yellow pill, "N fields updated", click handler. Shows nothing when `count === 0`. Used on the Shed card AND in the modal callouts.

**`CareUpdateCallout.tsx`** — the full yellow banner used inside Plant Edit Modal and Instance Edit Modal. Renders:
- "Care guide updated — N field(s) changed since you last viewed this plant"
- Bullet list of changed field names with human-readable labels (e.g. `watering_min_days` → "Watering frequency")
- Two buttons: "Mark as reviewed" (primary), "View changes" (secondary — toggles per-field highlight inside the form).

Field-name → label mapping lives in this component (`FIELD_LABELS` constant).

**No `<CareGuideField>` wrapper this wave.** The original plan wanted per-field background highlighting on individual inputs, but `ManualPlantCreation` (the form embedded in both modals) doesn't currently expose per-field hooks. Wave 5 ships the callout + a "Show changes" toggle that scrolls/expands to a diff view. **A future tweak** can add the per-field background to `ManualPlantCreation` once we want to invest there; Wave 5 doesn't block on it.

### 3. `useCachedShed` augmentation

Update the existing hook in [src/hooks/useCachedShed.ts](../../src/hooks/useCachedShed.ts):
- Extend the `plants` select to include `forked_from_plant_id, overridden_fields, source, freshness_version`.
- Keep the rest of the cache logic intact. The freshness state isn't cached in localStorage — it's recomputed live by `useAiPlantFreshness` after the shed plants load. This keeps the cache layer simple (no stale freshness rows in localStorage).

### 4. Shed card "Updated" badge

In [src/components/TheShed.tsx](../../src/components/TheShed.tsx), inside the plant-card loop (around line 1380):
- Use `useAiPlantFreshness(plants)` once at the component level, get the `byPlantId` map.
- For each plant card render: when `byPlantId[plant.id]?.has_update`, render a small `<UpdatedChip count={... .length}/>` absolutely-positioned in the top-right of the card image (above the SmartImage, below the selectMode checkbox in z-order). Click → opens the plant in the edit modal.

### 5. Plant Edit Modal Care tab callout

In [src/components/PlantEditModal.tsx](../../src/components/PlantEditModal.tsx) around line 363 (the `activeTab === "care"` block):
- When `plant.source === "ai"`, read `useAiPlantFreshness([plant])` for this single plant.
- If `has_update`:
  - Render `<CareUpdateCallout>` above the existing "Read-only" disclaimer (or above `ManualPlantCreation` for AI plants where it's currently editable).
- Always (when `plant.source === "ai"` AND the plant is a **global** — i.e. `forked_from_plant_id IS NULL`):
  - Render a small "Care guide refreshed N days ago" pill near the top, computed from `last_care_generated_at`.
  - Render a **"Refresh now"** button (Sage+ gated via `aiEnabled` prop):
    - Disabled if the local rate-limit window is active (cache `localStorage[`ai_refresh_${plant.id}`]` for 7 days after a successful refresh — purely client-side fast-path; the edge fn enforces the truth via `ai_plant_manual_refresh_log`).
    - On click → call the `manual-refresh-ai-plant` edge fn via `supabase.functions.invoke`. On success: toast "Care guide refreshed" + optimistically re-fetch the plant row + advance the local rate-limit cache.

For **shallow forks** in this wave: the modal will look the same as a global (`source === "ai"`), the chip will work because the freshness data resolves through `forked_from_plant_id`. The "Refresh now" button is hidden because that's gated on "global" — deferred to Wave 6 / 7 along with the actual fork detect → detach flow.

### 6. Instance Edit Modal Care Guide tab callout

In [src/components/InstanceEditModal.tsx](../../src/components/InstanceEditModal.tsx) around line 145 (where `careGuideData` is fetched):
- After the existing fetch, if the parent plant row is AI:
  - Use `useAiPlantFreshness([plantRecord])` to compute the chip state.
  - Render `<CareUpdateCallout>` above the existing care-guide content when `has_update`.
- The "Mark as reviewed" button shares the same `acknowledge()` from the hook — clicking it from the instance modal clears the chip across every instance of the plant for this user (because `user_plant_ack` is per-plant, not per-instance).

### 7. Tests

**Vitest unit:**
- `tests/unit/hooks/useAiPlantFreshness.test.ts` — given a mocked Supabase, verifies:
  - Global AI plant with `freshness_version=3` + ack at `seen_version=1` → `has_update=true`, count of `updated_care_fields`.
  - Shallow fork resolves via `forked_from_plant_id` and returns the global's state.
  - Deep fork (`overridden_fields.length > 0`) returns `null` (no chip).
  - Non-AI plant returns `null`.
  - `acknowledge()` upserts at the **global** plant_id, not the input row id.

**Vitest unit:**
- `tests/unit/components/UpdatedChip.test.tsx` — renders nothing for `count=0`, renders pill with label for `count>=1`, calls `onClick`.

**Playwright E2E:**
- `tests/e2e/specs/ai-plant-freshness.spec.ts` — seed an AI global with `freshness_version=2`, a home-scoped shallow fork pointing at it, and `user_plant_ack.seen_freshness_version=1`. Verify:
  - Shed card shows the chip.
  - Opening the plant edit modal shows the callout.
  - Clicking "Mark as reviewed" makes the chip disappear (page refresh, ack at version 2 now matches global's 2).

Seed file: extend `supabase/seeds/02_plants_shed.sql` to add one global AI row + one shallow fork pair + one `user_plant_ack` row at the older version. Or a new dedicated seed `13_ai_freshness.sql` — preferable so the existing seeds stay focused on their own concerns.

### 8. Docs

In the **same commit** as the code:

- **[03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md)** — add an "AI freshness chip" subsection under "Visual states" describing when the chip appears + what tapping it does.
- **[08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md)** — add Care tab section "Freshness callout + Refresh now". Mention the Sage+ gate + 7-day cache.
- **[08-modals-and-overlays/08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md)** — add to Care Guide tab section.
- **[99-cross-cutting/15-realtime.md](../app-reference/99-cross-cutting/15-realtime.md)** — note `plants.freshness_version` and `user_plant_ack` as new subscription channels.
- **[99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md)** — clarify `user_plant_ack.plant_id` always references the **global** plant when shallow forks are in play.
- **[docs/plans/ai-plant-overhaul.md](./ai-plant-overhaul.md)** — mark Wave 5 shipped + carry the updated deferred-work register forward.
- **[docs/e2e-test-plan.md](../e2e-test-plan.md)** — add the new spec rows.
- **[TESTING.md § Current Test Inventory](../../TESTING.md)** — bump test counts.

## Out of scope (deliberate, will be picked up by Wave 6 or Wave 7)

| Item | Reason | Lands in |
|------|--------|----------|
| `<DetachConfirmModal>` (fork-on-edit) | Editing flow is Wave 6 | Wave 6 |
| "Reset to catalogue" button | Reset flow is Wave 6 | Wave 6 |
| Source chip ("AI · Auto-updating catalogue" vs "AI · Custom") | Tied to fork visibility, Wave 6 | Wave 6 |
| Per-field "✎ Overridden" badges | Tied to fork visibility, Wave 6 | Wave 6 |
| Per-field background highlight inside `ManualPlantCreation` | Form refactor — wait until we know we need it | Future tweak, not blocking |
| `inventory_items → global plant_id` refactor + collapse migration | Shallow-fork pattern works; only worth doing if we hit a data-bloat issue | Wave 7 decision |
| `PlantSearchModal` single-add AI branch fix (pre-existing) | Pre-existing, low priority | Wave 7 |

## Files modified / created

| File | Type | Notes |
|------|------|-------|
| `src/hooks/useAiPlantFreshness.ts` | new | The hook + realtime sub. |
| `src/components/aiPlants/UpdatedChip.tsx` | new | Small pill. |
| `src/components/aiPlants/CareUpdateCallout.tsx` | new | Yellow banner + mark-as-reviewed. |
| `src/hooks/useCachedShed.ts` | edit | Augment select with freshness columns. |
| `src/components/TheShed.tsx` | edit | Render the chip on plant cards. |
| `src/components/PlantEditModal.tsx` | edit | Care tab callout + "Refresh now" + last-generated pill. |
| `src/components/InstanceEditModal.tsx` | edit | Care Guide tab callout. |
| `tests/unit/hooks/useAiPlantFreshness.test.ts` | new | Hook resolution + ack semantics. |
| `tests/unit/components/UpdatedChip.test.tsx` | new | Render + click. |
| `tests/e2e/specs/ai-plant-freshness.spec.ts` | new | End-to-end chip + ack flow. |
| `supabase/seeds/13_ai_freshness.sql` | new | Seed an unack'd update for the E2E. |
| `docs/app-reference/03-garden-hub/01-the-shed.md` | edit | Chip subsection. |
| `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` | edit | Callout + Refresh now. |
| `docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md` | edit | Callout. |
| `docs/app-reference/99-cross-cutting/15-realtime.md` | edit | New channels. |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | edit | `user_plant_ack` global-id semantics. |
| `docs/plans/ai-plant-overhaul.md` | edit | Mark Wave 5 shipped, carry deferred register. |
| `docs/e2e-test-plan.md` | edit | New rows. |
| `TESTING.md` | edit | Test counts. |

## Process / verification

1. Build the hook first, with unit tests passing, before any component changes.
2. Add `UpdatedChip` + Vitest, verify in Storybook-style isolation (or just visually via `npm run dev` if no Storybook).
3. Wire into the Shed card. Visual-verify on `npm run dev` with a hand-edited local row (set a higher freshness_version on a global, lower seen_version on user_plant_ack).
4. Add `CareUpdateCallout` + integrate into both modals. Visual-verify.
5. Add "Refresh now" button — verify it actually invokes the existing edge fn (already shipped Wave 2, so this is just wiring).
6. Seed + Playwright spec last, since it depends on the prior pieces working.
7. `npx tsc --noEmit` clean. Vitest + Deno tests both green. Playwright spec passes against seeded DB.
8. Update docs in same task.
9. Commit + push with `[skip ci]` (Vercel pause is on but the marker is good practice).
10. **Stop and summarise.** No remote db push needed for this wave (no migrations).

## Risk register

| Risk | Mitigation |
|------|------------|
| Hook fires too many realtime subscriptions when Shed has 200+ plants | Subscribe once at the hook level with a single filter on `plants.id IN [...]`. Existing `useHomeRealtime` already aggregates. |
| Shallow forks don't resolve to a global because `forked_from_plant_id` is NULL on some old AI rows | Wave 3 backfilled new shallow forks; pre-Wave-3 AI plants stay home-scoped only. Hook returns `null` for those rows (no chip). Acceptable — they'll never get updates, but the cron only operates on globals anyway. |
| Mark-as-reviewed writes to the wrong plant_id | Unit test explicitly checks the upsert targets the global, not the input row. |
| "Refresh now" double-fires while the request is pending | Disable the button while the call is in flight. Local 7-day cache prevents repeat clicks after success. Edge fn rate-limit is the truth-of-record. |
| Realtime subscription leaks on modal close | `useEffect` cleanup in the hook. |
| Per-field labels are inconsistent with what's in `updated_care_fields` (Gemini-snake-case vs UI-friendly names) | Single source of truth `FIELD_LABELS` constant in `CareUpdateCallout`, falls back to humanised raw name (`watering_min_days` → "Watering min days") if unmapped. |
| User mark-as-reviewed but the cron updates the row again 90 days later → chip reappears with a new diff | This is **intended behaviour**. The chip should appear every time there's new info. |
| Chip flashes briefly on first load while the hook resolves | Hook returns `loading: true` until both queries land. Card renders no chip while loading. |
