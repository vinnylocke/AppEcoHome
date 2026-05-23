# Plan — Search tab on Plant Library Admin

## Goal

Add a Search tab to `/admin/plant-library` so the user can dogfood what library search will eventually look like once it's wired into user-facing surfaces. For now it only queries `plant_library` (the AI-seeded knowledge base), not any of the user's per-home tables.

## App-reference consulted

- [docs/app-reference/07-management/10-plant-library-admin.md](../app-reference/07-management/10-plant-library-admin.md) — the surface being extended.
- `src/components/PlantSearchModal.tsx` — pattern for "result list + info → larger preview with chips" UI.
- `src/components/ManualPlantCreation.tsx` — the preview component that renders the chips (already used by PlantSearchModal in read-only mode).

## Requirements

- Single text input (no separate common-name vs scientific-name fields).
- Server-side search matches both `common_name` and `scientific_name`.
- 10 results per page.
- Each result row shows thumbnail + name.
- **Tap a row → opens the existing care-guide modal** (a portal modal wrapping `ManualPlantCreation` in `isReadOnly` mode — the same component PlantSearchModal renders in its preview pane). The plant_library row maps onto the component's expected shape directly (jsonb arrays → arrays, text → text), so there's no AI call or extra fetch — the modal just paints from the row.
- The modal shows the larger image, description, and all the chips PlantSearchModal already renders (cycle, watering, sunlight, care level, edible/toxic flags, hardiness, etc) plus the admin-relevant verification status + sources.

## Schema change

Add a generated `search_text` column to `plant_library` to make the OR-across-fields query trivial in PostgREST:

```sql
ALTER TABLE plant_library
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(common_name || ' ' || COALESCE(scientific_name::text, ''))
  ) STORED;
```

Then `.ilike("search_text", "%query%")` matches both fields in one go. No new index for V1 (table small enough that a seq scan is fine); add a GIN trigram index later if/when the table crosses ~50k rows.

## Files

| File | Change |
|------|---------|
| `supabase/migrations/<ts>_plant_library_search_text.sql` | Generated column |
| `src/services/plantLibraryAdminService.ts` | `searchPlantLibrary(query, page)` returning `{ rows, total, page, pageSize }` |
| `src/components/admin/PlantLibraryAdmin.tsx` | Add `tab` state + tab bar; mount existing content as "Overview", new component as "Search" |
| `src/components/admin/PlantLibrarySearchTab.tsx` | NEW — search input + paginated results list; row click opens the care guide modal |
| `src/components/admin/PlantLibraryCareGuideModal.tsx` | NEW — portal modal wrapping `ManualPlantCreation` (read-only) populated from the row. Adds an admin-only header strip showing verification status + sources. |

## Why reuse the existing care guide UI

`ManualPlantCreation` in read-only mode is already the canonical way the rest of the app renders a populated care guide (PlantSearchModal uses it for preview; PlantPreview uses it for the Care Guide tab). Reusing it means:

- No new rendering code for chips / fields — visual consistency across surfaces.
- When we eventually wire `plant_library` into user-facing search, the same modal works there too.
- `plant_library` row → `ManualPlantCreation` initialData: identical field shapes (jsonb arrays → arrays, text → text), no transform layer needed.

The admin-only additions on top: a small header strip showing `valid` status (matched / amended / unverified / default-passed) and the `sources` array if present.

## Chip strip (already rendered by ManualPlantCreation)

- **Cycle** (annual / perennial / biennial) — green chip
- **Watering** (frequent / average / minimum) — blue chip
- **Sunlight** (array) — amber chip per entry
- **Care level** (low / medium / high) — slate chip
- **Hardiness** (USDA zones if both min + max set) — teal chip
- **Edible** — emerald
- **Toxic to pets** — rose, only when true
- **Toxic to humans** — rose, only when true
- **Drought tolerant** — sky, only when true
- **Indoor** — purple, only when true
- **Days to harvest** (range when both set) — amber

Empty/false flags are omitted (no "Not toxic" chip noise).

The verification status (`valid = true/false/null`) and the `sources` array are also surfaced in the modal — admin-relevant context that user-facing search won't show but is useful for spot-checking quality.

## V1 limits / out of scope

- No filters (cycle, sunlight, edible-only, etc). The brief says single text input.
- No "add to my Shed" or "go to plant page" actions — we'll wire those when this connects to user-facing flows.
- The search is text-only ILIKE — no fuzzy matching, no synonym expansion. Sufficient for dogfooding.
- Pagination is client-driven over a server-paged query, not infinite scroll.

## Sequencing

1. Migration (apply locally, confirm before remote push).
2. Service helper + types.
3. Tab refactor of PlantLibraryAdmin.
4. Search tab component.
5. Detail modal.
6. Typecheck + deploy.
