# Plant Library — search on submit, not on keystroke

## Problem

With 40k+ rows in `plant_library`, the current search behaviour:

- On mount, fires an empty-query search that does a `count: "exact"` ordered by `seeded_at desc` — full-table count, never finishes loading on weak connections / DB cold reads.
- On every keystroke (debounced 250ms), fires another count + ILIKE query.

The user wants:

- Empty state when nothing has been searched (no auto-fetch on mount, no fetch on keystroke).
- Search only runs when the user types a term and clicks Search (or presses Enter).

## App-reference files consulted

- [`docs/app-reference/07-management/10-plant-library-admin.md`](docs/app-reference/07-management/10-plant-library-admin.md) — confirms the search tab is admin-only and the data model uses the `search_text` generated column. No flow changes there beyond the new gate.

## Change

In [`src/components/admin/PlantLibrarySearchTab.tsx`](src/components/admin/PlantLibrarySearchTab.tsx):

- Remove the keystroke debounce effect.
- Don't auto-run `searchPlantLibrary` on mount — start with `result = null` and a "Type a plant name and tap Search to begin" empty state.
- Add a Search button next to the input + handle Enter on the input to submit.
- Submit handler sets `appliedQuery = input`, resets page to 1, and calls `runSearch`.
- Keep pagination + lazy thumbnail behaviour unchanged.

App-reference update is out of scope here — the admin reference describes the search behaviour at a high level and the new "type + submit" behaviour fits within that description; no rewrite needed unless future drift accumulates.

## Steps

1. Edit PlantLibrarySearchTab.
2. Typecheck.
3. Bump + deploy.
