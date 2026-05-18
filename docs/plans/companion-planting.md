# Plan — Companion Plants Tab

## Goal

Add a "Companions" tab to both `PlantEditModal` (shed plants) and `InstanceEditModal` (plant instances). On tab click it auto-fetches companion planting data and displays it in three sections (Beneficial / Harmful / Neutral) with checkboxes so the user can bulk-add companions to the Shed.

---

## Data sources

| Plant source | Companion data source |
|---|---|
| `verdantly` | Verdantly API: `GET /v2/companion-planting/{verdantly_id}` |
| `api` (Perenual) + AI enabled | Gemini: generate same format |
| `api` (Perenual) + no AI | Show upgrade message |
| `ai` or `manual` + AI enabled | Gemini: generate same format |
| `ai` or `manual` + no AI | Show upgrade message |

### Verdantly companion response shape
```json
{
  "beneficial": [{ "id": "...", "name": "...", "reason": "...", "scientificName": "..." }],
  "harmful":    [{ "id": "...", "name": "...", "reason": "...", "scientificName": "..." }],
  "neutral":    [{ "id": "...", "name": "..." }]
}
```
Gemini returns the same shape. `id` is the Verdantly ID for Verdantly results; `null` for AI results.

---

## Architecture

### 1. New edge function — `supabase/functions/companion-planting/index.ts`

Accepts body:
```ts
{ source: string; verdantly_id?: string; plant_name: string; home_id: string; ai_enabled: boolean }
```

Logic:
- If `source === "verdantly"` and `verdantly_id` is set: call `GET /v2/companion-planting/{verdantly_id}` with the existing `VERDANTLY_API_KEY` / `RAPIDAPI_HOST` pattern used by `verdantly-search`.
- Else if `ai_enabled`: call Gemini with a structured prompt asking for the companion planting relationships in the exact same JSON format. Returns `{ beneficial, harmful, neutral }`.
- Else: return `{ error: "ai_required" }`.

### 2. New component — `src/components/CompanionPlantsTab.tsx`

Props:
```ts
interface Props {
  source: string;           // "verdantly" | "api" | "ai" | "manual"
  verdantlyId?: string | null;
  plantName: string;
  homeId: string;
  aiEnabled: boolean;
}
```

Behaviour:
- Auto-fetches companions from edge function on mount (no manual trigger).
- Loading skeleton while fetching.
- If `{ error: "ai_required" }`: show upgrade message "Companion planting insights require the AI add-on — upgrade in Account Settings."
- On success: render three collapsible sections (Beneficial / Harmful / Neutral) each with a coloured header and list of plants.
- Each plant row: checkbox + common name + scientific name (if present) + reason text (if present).
- "Add X to Shed" button (disabled when 0 checked): fixed at bottom of the tab panel, appears when at least one plant is checked.
- Add-to-shed flow: calls `verdantly-search` edge function (details action) for each item that has a Verdantly ID, or creates a minimal `manual` plant record for AI-generated items. On success: toast "X companion(s) added to your Shed".
- Already-in-shed detection: query plants table by name/verdantly_id before the add action; skip duplicates and show "X already in Shed" toast.

### 3. Modify `src/components/PlantEditModal.tsx`

- Add `aiEnabled?: boolean` prop (passed through from TheShed which already has it).
- Add `{ id: "companions", label: "Companions", icon: Sprout }` to the `tabs` array.
- Add `activeTab === "companions"` branch in the tab body rendering:
  ```tsx
  <CompanionPlantsTab
    source={plant.source}
    verdantlyId={plant.verdantly_id ?? null}
    plantName={plant.common_name}
    homeId={homeId}
    aiEnabled={aiEnabled ?? false}
  />
  ```
- Update `TheShed.tsx` to pass `aiEnabled={aiEnabled}` to `PlantEditModal` (the prop already exists on TheShed).

### 4. Modify `src/components/InstanceEditModal.tsx`

- Add `"companions"` to the `activeTab` type union.
- Add `{ id: "companions", label: "Companions", icon: Sprout }` to the `tabs` array.
- On `activeTab === "companions"`: fetch the parent plant record from `plants` table (same pattern as the existing `care_guide` lazy-fetch) to get `source` and `verdantly_id`.
- Render `<CompanionPlantsTab>` with those values, `instance.plant_name`, `homeId`, and `aiEnabled`.

---

## Files changed

| File | Change |
|---|---|
| `supabase/functions/companion-planting/index.ts` | **New** — edge function |
| `src/components/CompanionPlantsTab.tsx` | **New** — tab component |
| `src/components/PlantEditModal.tsx` | Add `aiEnabled` prop, add Companions tab |
| `src/components/InstanceEditModal.tsx` | Add Companions tab, lazy-fetch plant record |
| `src/components/TheShed.tsx` | Pass `aiEnabled` to `PlantEditModal` |

---

## Tests

- **Unit**: `tests/unit/lib/companion-planting.test.ts` — mock edge function responses for the three paths (Verdantly, AI, upgrade).
- **E2E**: `tests/e2e/specs/companion-plants.spec.ts` — open shed plant modal, click Companions tab, verify sections render.
- **Test docs**: update `docs/e2e-test-plan.md`.

---

## Risks / decisions

- **Already-in-shed check**: simple name match is fuzzy. If a Verdantly ID match is available that takes priority; name is the fallback. Avoids full dedup complexity.
- **Add-to-shed for AI companions**: no Verdantly ID available, so created as `source: "manual"` with only `common_name` set (user can enrich later from the shed).
- **Neutral companions**: typically have no reason text. Render them as a collapsed section (opened on click), since it's often a long list of plants with no actionable info.
- **No caching** for companion data — it's a lightweight call and the Verdantly cache table is for plant details, not companion relationships. Session-level caching inside the component state is sufficient.
