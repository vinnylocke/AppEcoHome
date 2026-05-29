# Plan — Fix plant-search result images (especially the library)

## Problem

Plant-search result thumbnails are mostly broken/missing:

- **Library rows** render the leaf placeholder, never a photo. The bulk seeder and `add-plant-to-library` store `thumbnail_url: null` + `image_url: null` (`_shared/plantSeedPrompt.ts:343-344`) — Gemini enrichment produces care data, not images. The library is the bulk of search results, so "most cases" show no image.
- **Provider rows (Perenual)** use `item.default_image?.thumbnail` (`src/lib/plantProvider.ts:80`), which on the free tier is the `upgrade_access` placeholder or a hotlink-blocked URL → a broken `<img>`.

Result thumbnails are rendered with a raw `<img src={thumb}>` (no fallback, no proxy) in two places:
- `ResultRow` in `src/components/shared/PlantSearch.tsx` (every host: Library, Add-to-Shed, Shopping, Nursery, `/library`).
- The cart/review list in `src/components/BulkSearchModal.tsx` (~line 356).

## Key insight — the fix infra already exists

`supabase/functions/plant-image-search/index.ts` has a **`count === 1` fast path** backed by the **`plant_image_cache`** table (90-day TTL, write-through, cross-user/device). Its own comment calls the result-list thumbnail "the universal hot path." `PlantInfoPanel` already uses this function for its ⓘ gallery. The result rows simply never call it. So the fix is to route result thumbnails through this existing, optimised path — no new table, no cron, no `plant_library` backfill needed (the image cache already persists across users for 90 days).

## App-reference files consulted

- `docs/app-reference/99-cross-cutting/24-image-sources.md` — `plant-image-search`, `image-proxy`, `SmartImage`, `plant_image_cache`.
- `docs/app-reference/99-cross-cutting/25-plant-providers.md` — Perenual/Verdantly thumbnail shapes (referenced).
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — `PlantSearch` / `ResultRow` contract.
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `plant-image-search` entry.

## Approach

A single shared, self-resolving thumbnail component used everywhere a plant-search result thumbnail renders. "One place to update."

### New `src/lib/plantThumb.ts` (unit-testable core)

- `isUsablePlantImageUrl(url): boolean` — non-empty string, not a Perenual `upgrade_access` placeholder, not a blob/data leftover. Centralises the `upgrade_access` filter currently duplicated in `BulkSearchModal` and `PlantSearchModal`.
- `resolvePlantThumbUrl(name): Promise<string | null>` — calls `supabase.functions.invoke("plant-image-search", { body: { query: name, count: 1 } })`, returns `images[0]?.thumb_url ?? null`. Module-level `Map<normalisedName, Promise<string|null>>` dedupes concurrent/repeat lookups in a session (the server cache handles cross-session).

### New `src/components/PlantResultThumb.tsx` (thin wrapper)

Props: `name: string`, `url?: string | null`, `source?: string`, `size?`/`className?`.
- If `isUsablePlantImageUrl(url)` → render that `<img>` first; on `onError`, fall through to resolution.
- If no usable stored URL (library rows) → immediately resolve via `resolvePlantThumbUrl(name)`.
- While resolving → subtle pulse; on miss/error → existing placeholder icon (`Sparkles` for `source === "ai"`, else `Leaf`).
- Plain `<img onError>` (not `SmartImage`) so hotlink/CORS-protected provider URLs that load in an `<img>` but would fail a `fetch()` still display, and broken ones trigger the lazy fallback.

### Wire it in

- `src/components/shared/PlantSearch.tsx` — replace the `<img>`/icon block inside `ResultRow` (lines ~544-552) with `<PlantResultThumb name={name} url={thumb} source={source} />`. Fixes Library + external rows across **all** hosts at once.
- `src/components/BulkSearchModal.tsx` — replace the cart/review `<img>` (~356-363) with `<PlantResultThumb>`; drop the local `upgrade_access` filter in favour of `isUsablePlantImageUrl`.
- `src/components/PlantSearchModal.tsx` — replace its `safeImage` `upgrade_access` filter with `isUsablePlantImageUrl` (dedupe; behaviour unchanged).

## Out of scope (and why)

- **Backfilling `plant_library.thumbnail_url`** — unnecessary: `plant_image_cache` already gives cross-user 90-day persistence via write-through, so the first lookup of any name is the only external fetch.
- **Detail/preview hero images** (`PlantPreview` / `PlantDetailModal`) — driven by the catalogue plant, a separate path. Can follow as a second pass if the user wants; this plan targets the result lists they asked about.

## Risks / edge cases

- **Load on first search of new names** — up to ~10 library rows with null images → up to ~10 concurrent `plant-image-search` calls. Each is Wikipedia-first (no key, fast) and server-cached after the first hit; this is the designed hot path. Lookups are lazy (only rendered rows) and deduped.
- **Resolution miss** → graceful placeholder icon (current behaviour, no regression).
- **Stale/oversized cache** — `plant_image_cache` is the function's existing concern; unchanged here.

## Tests

- **Vitest** (`tests/unit/lib/plantThumb.test.ts`): `isUsablePlantImageUrl` (null/empty/`upgrade_access`/valid) and `resolvePlantThumbUrl` (mock `supabase.functions.invoke` → returns first thumb; dedupes concurrent calls; null on empty/error).
- **E2E**: result rows keep their testids and the image is decorative/network-dependent (mocked in CI), so no new assertion; add a note to `docs/e2e-test-plan.md` that result thumbnails resolve via `plant-image-search`.

## Docs to update

- `docs/app-reference/99-cross-cutting/24-image-sources.md` — add the result-thumbnail resolution path (`PlantResultThumb` → `plant-image-search count:1` → `plant_image_cache`), and note library rows store null images by design.
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — note `ResultRow` thumbnails self-resolve.
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` (or the plant_library section) — note AI-seeded `plant_library` rows have null `image_url`/`thumbnail_url`.

## Process

1. Add `src/lib/plantThumb.ts` + `PlantResultThumb.tsx`; wire into `PlantSearch` (ResultRow) + `BulkSearchModal` + `PlantSearchModal`.
2. `npm run build` (catches what tsc misses) + `npx tsc --noEmit` + `npm run test:unit`.
3. Update docs.
4. Release note; deploy `--bump 1`; push to main.
