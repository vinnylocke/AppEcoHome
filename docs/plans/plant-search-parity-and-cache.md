# Plan — Plant search parity, AI thumbnails, and shared image cache

Four issues the user reported on the plant search inside the seed-packet editor:

1. **Perenual results don't appear to page.** The API call DOES page, but Perenual returns ~30 results per page and `has_more` only flips true at the page boundary — so users see one giant 30-row dump with no "Show more". The Shed search (BulkSearchModal) solves this with client-side visible-count slicing on top of API paging: show 10, "Show more" expands by 10, when the current batch is exhausted it fetches the next API page.
2. **AI results have no thumbnails.** The AI endpoint returns just match names — `thumbnail_url: null`. The Library + Shed searches solve this by calling `plant-image-search` (Wikipedia / Pixabay / Unsplash) per AI common name and caching the result.
3. **Search results aren't cached.** The seed-launched search re-runs the API every time the modal opens. The Library does sessionStorage-per-device caching, but there's **no shared (database) cache for plant images** today — every call to `plant-image-search` re-hits Unsplash / Wikipedia / Pixabay even when another user just looked up the same plant. AI search results ARE shared-cached server-side (`plant-doctor`'s `search_plants_text` action uses `aiCache`).
4. **UI consistency between the seed-launched search and the Shed search.** BulkSearchModal has its own layout (different from what I just shipped); they should match.

## App-reference / code consulted

- `src/components/BulkSearchModal.tsx` — the Shed's plant search. Pattern of record for visible-count pagination + auto-prefetched details + result-card layout.
- `src/components/library/LibrarySearchTab.tsx` — has the AI-thumbnail prefetch pattern via `plant-image-search`.
- `supabase/functions/plant-doctor/index.ts` — `search_plants_text` action shows server-side caching via `aiCache` is already wired for AI search results.
- `supabase/functions/plant-image-search/index.ts` — no caching today; every call hits Unsplash / Pixabay / Wikipedia.

## What we'll change

### A. PlantSearchModal — Perenual visible-count pagination

Match BulkSearchModal:

- Add `perenualVisibleCount` state (initial 10).
- Show only the first `perenualVisibleCount` of `rankedPerenual` on screen.
- "Show more" handler:
  - If `perenualVisibleCount < rankedPerenual.length`, bump visibleCount by 10 (client-side reveal).
  - Else, if `perenualHasMore`, fetch the next API page, append it, bump visibleCount by the count returned.
- Show more is enabled when EITHER condition above is true.

Verdantly + AI stay as they are (those endpoints return ~10 per page natively, so direct API paging is right).

### B. AI thumbnails — wire `plant-image-search`

Match LibrarySearchTab's pattern:

- New `aiThumbs: Map<string, string>` + `aiThumbsRef` + `aiInflightRef` (the StrictMode-safe shape).
- After AI results land, fire `prefetchAiThumbnails(matches)` — for each unseen name, call `supabase.functions.invoke("plant-image-search", { query: name, count: 1 })`, store the first `thumb_url` in the map.
- Render uses `aiThumbs.get(name.toLowerCase()) || plant.thumbnail_url` as the displayed thumb.
- Empty string in the map = "looked up, none found" → falls back to the `IconPlantDB` placeholder.

### C. Shared image cache (server-side)

This is the "store in our database" part the user called out. New `plant_image_cache` table:

```sql
CREATE TABLE public.plant_image_cache (
  query_normalised   text PRIMARY KEY,                -- lowercased, trimmed plant name
  thumb_url          text NOT NULL,
  full_url           text NOT NULL,
  source             text NOT NULL,                   -- 'wikipedia' / 'pixabay' / 'unsplash'
  attribution        jsonb,                           -- photographer, wiki_page, etc. (license-aware)
  cached_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL             -- 90 days from cached_at
);

-- RLS — public read (no PII), service-role write.
ALTER TABLE public.plant_image_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read plant image cache"
  ON public.plant_image_cache FOR SELECT TO authenticated USING (true);
```

`plant-image-search` edge fn becomes:

1. Normalise the query → `query.trim().toLowerCase()`.
2. Lookup `plant_image_cache` by `query_normalised`. If hit AND `expires_at > now()`, return cached row (keep the existing response shape — wrap as one-image `images: [{...}]`).
3. Cache miss → call providers (Unsplash first, then Wikipedia, then Pixabay) as today. On the first hit, upsert into `plant_image_cache` with a 90-day expiry. Continue building the rest of the gallery as before (we only cache the FIRST result — that's the thumbnail; gallery uses the full provider responses for the multi-image picker).
4. Return the gallery to the client unchanged.

This way:
- First user to search "Sungold tomato" → fresh fetch + cache write.
- Every subsequent user searching the same name → DB hit, no external API call, sub-50ms.
- Image's licensing attribution stays alongside the URL so credit-aware components keep working.

Trade-offs:
- The cache stores the FIRST returned image only — the full multi-image gallery still re-fetches every time. That's OK because the multi-image picker is opened rarely; the thumbnail is the universal hot path.
- 90-day TTL is generous; plants don't change much. If an image gets pulled by the provider, the cached URL might 404 — the client image element falls back to placeholder via `onerror` (already in place).

### D. sessionStorage cache for the search itself

Add per-device search snapshot caching to PlantSearchModal (mirroring LibrarySearchTab's `library:lastQuery` + snapshot key):

- Key `plant_search_modal:lastSnapshot` storing `{ query, aiResults, aiHasMore, aiOffset, perenualResults, perenualHasMore, perenualNextPage, verdantlyResults, verdantlyHasMore, verdantlyNextPage }`.
- On mount with `initialSearchTerm`, hydrate from snapshot if its query matches — skip the initial network fan-out entirely.
- After every successful search / load-more, rewrite the snapshot.

This survives "close modal, reopen it" but dies on app reload (sessionStorage). Combined with C, even an app reload doesn't refetch images.

### E. UI parity tweaks (small)

BulkSearchModal renders results in a slightly different layout than my current grouped sections. The key differences:

- Section labels in BulkSearchModal are inline header pills (`AI Suggestions` / `Plant Database` / `Verdantly`). Mine has the same idea; copy is consistent.
- Result cards in BulkSearchModal are slightly more compact (smaller thumb, tighter padding). Match it.
- "Show more" pill style — match the soft tinted version.

Keep the overall flow (single-add → preview → Add to Shed) unchanged. Only the result-list styling changes.

## Files to change

| File | Change |
|------|--------|
| `src/components/PlantSearchModal.tsx` | Visible-count Perenual paging, AI thumbnail prefetch, sessionStorage snapshot, UI tweaks |
| `supabase/functions/plant-image-search/index.ts` | Read from / write to `plant_image_cache` |
| `supabase/migrations/<ts>_plant_image_cache.sql` | New table + RLS |

## Tests

- Existing `tests/unit/components/EditSeedPacketModal.test.ts` — already mocks `PlantSearchModal`, no change needed.
- No new tests for the edge fn caching — straightforward read-through pattern; ship with a manual smoke test.

## Out of scope

- **Server-side caching for Perenual / Verdantly search results.** Perenual / Verdantly already cache their own API responses, and we'd be storing per-page result lists — a non-trivial schema. If we keep seeing latency we can add it later.
- **Multi-image cache for the gallery picker.** Today the picker re-fetches the full provider responses. Volume is low (only opened when the user wants a different image); the cost of caching multi-image arrays would dwarf the savings.
- **Replacing PlantSearchModal with BulkSearchModal.** BulkSearchModal is wired to a multi-add cart flow; converting it to single-add would be a bigger refactor than parity tweaks.

## Sequencing

1. Migration for `plant_image_cache` + edge-fn caching change. Apply locally first (`supabase migration up`), confirm before pushing to remote.
2. Wire AI thumbnail prefetch in `PlantSearchModal`.
3. Add Perenual visible-count slicing.
4. Add sessionStorage snapshot.
5. UI tweaks to match BulkSearchModal.
6. Typecheck + tests + deploy.
