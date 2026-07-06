# Plant search — match "other names", show all name fields, and space-insensitive matching

## Goals

1. **Match alternate names.** Searching a plant by a name in its **Other Names** field should return it. Today search only looks at `common_name` + `scientific_name`.
2. **Show all names in results.** Wherever plant results appear, show **common name + scientific name + other names**.
3. **Intuitive spacing.** "crab apple" and "crabapple" (and "crab-apple") should be treated as the same — searching one should find the other, cleanly ranked.

## Findings (map)

- **Field:** `plant_library.other_names` — `jsonb` array (default `[]`). Also carried on `PlantDetails.other_names: string[]` for provider results. It exists but is **never searched or displayed**.
- **Catalogue search column:** `plant_library.search_text` — generated `lower(common_name || ' ' || COALESCE(scientific_name::text,''))`. No `other_names`, space-sensitive. Trigram index `plant_library_search_text_trgm_idx`.
- **RPCs** (`20260710020000_ordering_bug_fixups_v2.sql`): `search_plant_library_relevance` (exact→prefix→contains→similarity on `search_text`/`common_name`) and `search_plant_library_fuzzy` (similarity on `search_text`). Both **return the whole `plant_library` row** as `row_data` — so `other_names` already reaches the client; only display + matching need work.
- **Search surfaces:** browser "Find a plant" (`src/components/shared/PlantSearch.tsx` → `search_plant_library_relevance`); agent-chat `search_plant_database` (`supabase/functions/agent-chat/executors/read.ts`, direct `.ilike("search_text",…)`); admin (`src/services/plantLibrarySearch/*`). Provider search (Perenual/Verdantly) returns `other_names` in details but doesn't search it.
- **Display:** `ResultRow` in `PlantSearch.tsx` shows common + scientific only; `PlantDetailModal.tsx` header shows common + scientific; `PlantInfoPanel.tsx` shows neither other_names. None render `other_names`.

## App-reference consulted

- [99-cross-cutting/25-plant-providers.md](../app-reference/99-cross-cutting/25-plant-providers.md) — providers + search sources. **Will update.**
- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — plant/catalogue schema. **Will update (search_text/search_norm).**
- [08-modals-and-overlays/38-plant-detail-modal.md](../app-reference/08-modals-and-overlays/38-plant-detail-modal.md) — result detail. **Will update.**

## The change

### 1. Migration — `search_norm` + `other_names` in `search_text`

Generated column `search_text` can't have its expression altered, so **drop its index + column and re-add** (data regenerates), then add a normalized column:

- **`search_text`** (rebuilt) — `lower(common_name || ' ' || COALESCE(scientific_name::text,'') || ' ' || COALESCE(other_names::text,''))` — now includes other names (fixes goal 1 for trigram similarity + any `search_text` matcher).
- **`search_norm`** (new, generated) — `regexp_replace(lower(common_name||' '||COALESCE(scientific_name::text,'')||' '||COALESCE(other_names::text,'')), '[^a-z0-9]+', '', 'g')` — collapses to lowercase alphanumerics, so "crab apple"/"crabapple"/"crab-apple" all become `crabapple` (fixes goal 3). All expressions are immutable.
- Trigram GIN indexes on both columns.
- **Update both RPCs** to normalize the query (`qnorm = regexp_replace(lower(trim(p_query)),'[^a-z0-9]+','','g')`) and match/rank on `search_norm` (space-insensitive) alongside `search_text`. New relevance ranks: normalized common_name exact (0) → normalized prefix (1) → `search_norm` contains `qnorm` (2, covers other_names) → else (3). WHERE widened to `search_norm LIKE %qnorm% OR search_text % qtext`. Similarity = `greatest(similarity(search_text,qtext), similarity(search_norm,qnorm))`.

Per repo rules: apply locally with `supabase migration up` first; no new table (grants unchanged).

### 2. agent-chat `search_plant_database` (`read.ts`)

Match `search_norm` with a JS-normalized query (`query.toLowerCase().replace(/[^a-z0-9]+/g,'')`) instead of `search_text`, and add `other_names` to the `.select(...)` so the model can name alternates.

### 3. Display — common + scientific + **other names**

- **`ResultRow`** (`PlantSearch.tsx`): pass `other_names` through from `row_data` and render a small "also: …" line under the scientific name (only when non-empty, comma-joined, truncated).
- **`PlantDetailModal.tsx`**: add an "Also known as" line in the header when `other_names` present.
- **`PlantInfoPanel.tsx`**: add an "Also known as" row.
- A tiny pure helper `src/lib/plantNames.ts` — `normalizePlantName(s)` (collapse to alnum, mirrors the SQL) + `formatOtherNames(value): string[]` (accepts `string[] | jsonb | null`, dedupes vs common/scientific, trims). Unit-tested.

## Tests

- **Vitest** `tests/unit/lib/plantNames.test.ts` — `normalizePlantName` ("crab apple"==="crabapple"==="Crab-Apple"), `formatOtherNames` (array/jsonb/null, dedupe, trim).
- **E2E** — update the plant-search Page Object/spec if selectors change; add an assertion that a result row can show an "also known as" line. (Catalogue-dependent; keep light.)
- **SQL** — not unit-testable here; manual verification after local `migration up`: search an alternate name → the plant appears; "crab apple" and "crabapple" return the same top hit.

## App-reference updates

- `25-plant-providers.md` — note search now covers `other_names` and is space-insensitive.
- `03-data-model-plants.md` — document `search_norm` + `search_text` now including `other_names`.
- `38-plant-detail-modal.md` — note the "Also known as" line.

## Risks

- **Collapsing spaces** loses word-order flexibility (e.g. "apple crab" won't match "crabapple"). Acceptable — the request is same-phrase spacing; `search_text` (spaced) similarity still backstops.
- **Dropping/re-adding `search_text`** briefly rebuilds the generated column + index on ~94k rows — a one-off migration cost, fine.
- Keep provider (Perenual/Verdantly) result display consistent — they already carry `other_names` in `PlantDetails`.
