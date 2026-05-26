# Plant Library — Search Lab (modular search-strategy experimentation)

## Goal

Turn the Plant Library search tab into a **modular search lab** where multiple search strategies can be added, toggled between, and compared on the same 40k-row dataset. Ship with 4 methods to start (3 user-requested + 1 industry-standard), structured so adding a 5th/6th in the future is a single-file change.

## App-reference files consulted

- [`docs/app-reference/07-management/10-plant-library-admin.md`](docs/app-reference/07-management/10-plant-library-admin.md) — confirms admin-only access + the `search_text` generated column structure.
- [`docs/app-reference/99-cross-cutting/19-rls-patterns.md`](docs/app-reference/99-cross-cutting/19-rls-patterns.md) — for the new RPC function's `SECURITY DEFINER` decision (the function will run under the caller, gated by an `is_admin` check).

---

## Search methods to ship (v1)

### 1. Alphabetical (current behaviour)
- Server-side ILIKE on `search_text`, ordered by `common_name ASC`.
- The current default behaviour. Useful as a baseline.

### 2. Relevance (user-requested)
- Exact matches first, then prefix matches, then contains matches, with **trigram similarity** as the tiebreak inside each tier, and alphabetical as the final tiebreak.
- Implemented via a Postgres RPC `search_plant_library_relevance(query, page_size, page_offset)` that returns the row + a `rank` integer.

### 3. Advanced (user-requested)
- Mode dropdown: **Starts with / Ends with / Contains**.
- Server-side ILIKE on `search_text` with the matching wildcard placement.
- Plain SQL via the existing PostgREST builder — no RPC needed.

### 4. Fuzzy (industry standard — pg_trgm similarity)
- Typo-tolerant ranking using Postgres `pg_trgm` extension's `similarity()` function.
- Useful when you can't remember the exact spelling ("rhodendron" → finds "Rhododendron").
- RPC `search_plant_library_fuzzy(query, page_size, page_offset)` returns rows ordered by `similarity DESC`, with a configurable similarity threshold to filter out garbage matches.
- Backed by a GIN trigram index on `search_text` so the lookup is fast even on 40k rows.

### Other industry-standard options I considered but am NOT shipping in v1 (so you can decide later)

- **Full-Text Search (FTS) — Postgres `tsvector` + `ts_rank`**. The gold standard for document/description search. Overkill for a name field (handful of words), but if you wanted to extend the library to search `description`, `summary`, growing notes, etc., this would be the right tool. Easy to add as method #5.
- **Vector / semantic search (pgvector)**. Embeds plant rows into a vector space so you can do "find me a low-maintenance drought-tolerant evergreen" queries. Most powerful but most expensive (one embedding API call per row to seed + per query). Probably worth adding once you want descriptive querying, not pure name search.
- **Levenshtein distance (fuzzystrmatch)**. Older typo-tolerance approach. pg_trgm is generally preferred — faster on indexed data and more useful for partial-word matches.
- **External search engines (Meilisearch, Typesense, Algolia)**. Worth considering at 1M+ rows, but Postgres pg_trgm handles 40k–500k rows well. Not needed yet.

---

## Architecture (modular registry)

### New file structure

```
src/services/plantLibrarySearch/
  index.ts                  ← exports SEARCH_METHODS array + types
  alphabetical.ts           ← method #1
  relevance.ts              ← method #2
  advanced.ts               ← method #3
  fuzzy.ts                  ← method #4
```

### Core interface

```ts
export interface SearchMethod<O = unknown> {
  id: string;                                // stable id used as a URL/state key
  label: string;                             // pill label
  description: string;                       // shown under the tabs
  defaultOptions: O;                         // initial options object (can be {})
  /** Optional config UI rendered next to the input. */
  Options?: React.FC<{ value: O; onChange: (next: O) => void }>;
  /** Run the search and return a paginated result. */
  run(args: {
    query: string;
    page: number;
    pageSize: number;
    options: O;
  }): Promise<PlantLibrarySearchResult>;
}

export const SEARCH_METHODS: ReadonlyArray<SearchMethod<any>> = [
  alphabeticalMethod,
  relevanceMethod,
  advancedMethod,
  fuzzyMethod,
];
```

Adding a 5th method = create a new file exporting a `SearchMethod`, append to the array. The tab UI iterates the registry and auto-renders.

### UI changes in `PlantLibrarySearchTab.tsx`

- Pill tabs at the top showing each method's `label`.
- Selected method's `description` shown as small text under the pills.
- Selected method's `Options` component (if any) rendered beside the input.
- Input + Search button remain — pressing Search calls `selected.run({query, page, pageSize, options})`.
- Per-method `options` state lives in a `Record<methodId, options>` map so switching methods preserves each one's settings.

---

## Database migration

New migration `20260525000000_plant_library_search_extensions.sql`:

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. `CREATE INDEX IF NOT EXISTS plant_library_search_text_trgm_idx ON plant_library USING GIN (search_text gin_trgm_ops);`
3. `CREATE OR REPLACE FUNCTION search_plant_library_relevance(p_query TEXT, p_page_size INT, p_offset INT) RETURNS TABLE(...)` — returns `plant_library` columns + `rank` + `total_count` (for pagination).
4. `CREATE OR REPLACE FUNCTION search_plant_library_fuzzy(p_query TEXT, p_page_size INT, p_offset INT, p_min_similarity REAL DEFAULT 0.1) RETURNS TABLE(...)` — similarity-ordered.
5. Both functions are `SECURITY INVOKER` (run under the caller's RLS), and the caller already needs admin to be on this tab so no additional gating.

Pagination via RPC needs the total count — I'll return it as a column on every row (cheap with a window function `COUNT(*) OVER()`).

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/20260525000000_plant_library_search_extensions.sql` | NEW — pg_trgm, GIN index, two RPC functions |
| `src/services/plantLibrarySearch/index.ts` | NEW — registry + interface |
| `src/services/plantLibrarySearch/alphabetical.ts` | NEW — extracts current behaviour |
| `src/services/plantLibrarySearch/relevance.ts` | NEW — calls RPC |
| `src/services/plantLibrarySearch/advanced.ts` | NEW — starts/ends/contains |
| `src/services/plantLibrarySearch/fuzzy.ts` | NEW — calls RPC, threshold slider |
| `src/services/plantLibraryAdminService.ts` | KEEP `searchPlantLibrary` exported but deprecated; new methods don't use it |
| `src/components/admin/PlantLibrarySearchTab.tsx` | Replace direct service call with `selectedMethod.run(...)`, add tabs + per-method options renderer |
| `tests/unit/services/plantLibrarySearch.test.ts` | NEW — covers the three methods that don't need a live DB (advanced + alphabetical pattern building) |

---

## Risks & edge cases

- **Migration order**: pg_trgm extension is a no-op if already enabled (most Supabase projects have it pre-installed). The migration uses `IF NOT EXISTS` for safety.
- **GIN index build** on 40k rows takes ~1s but locks the table briefly. Should be acceptable on the next deploy's `npm run deploy` flow.
- **RPC pagination**: the `COUNT(*) OVER()` window adds a small overhead but is the standard Postgres pattern for "rows + total".
- **Method state preserved across tab switches**: implemented via per-method options map. If we don't preserve, switching tabs would lose the user's typed query — annoying when comparing methods.
- **URL state**: NOT shipping URL persistence in v1 (would require search-params plumbing). Method choice + query reset on page reload.

---

## App-reference doc updates needed

- [`docs/app-reference/07-management/10-plant-library-admin.md`](docs/app-reference/07-management/10-plant-library-admin.md) — update Search tab section to describe the new method registry + 4 starter methods. Out-of-scope for this PR to be a full rewrite; will add a paragraph describing the change and flag for full audit on the next reference pass.

---

## Steps

1. Write migration + run locally (`supabase migration up`).
2. Build the registry + 4 method files.
3. Refactor `PlantLibrarySearchTab.tsx` to use the registry.
4. Add unit tests for advanced/alphabetical pattern-building.
5. Typecheck, run unit tests.
6. Push migration to remote (with explicit confirmation per CLAUDE.md).
7. Deploy via `npm run deploy --bump 1`.

---

## Open questions for the user

Before I start, three things I want to check:

1. **Are you happy with the 4 methods above** (current / relevance / advanced / fuzzy)? Should I add or drop any?
2. **Do you want the `pg_trgm` extension enabled** — it's the load-bearing piece for the Fuzzy + Relevance methods. It's free + supported on every Supabase tier, just want to confirm before I ship a migration that enables it.
3. **Should I keep "Alphabetical" as the default method**, or have "Relevance" be the default (since it's likely what most admin searches will want)?
