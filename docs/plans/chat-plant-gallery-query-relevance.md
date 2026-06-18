# Plan — Improve chat plant-gallery photo relevance

## Problem

Asking the chat to show a "runner bean" returns a gallery where only a couple of
images are the actual plant. Cause: the gallery queries `plant-image-search` with the
bare name ("runner bean"), and Unsplash/Pixabay tag that phrase mostly to the *food /
dried beans*, not the growing plant. (Wikipedia — always fetched first — gives the one
good canonical shot, which is the "couple" the user sees.)

## App-reference consulted

- [`05-tools/03-plant-doctor-chat.md`](../app-reference/05-tools/03-plant-doctor-chat.md) — gallery / `plant-image-search` wiring (just updated).

## Approach — two small levers

1. **Bias the search query toward the plant** (`src/lib/plantPhotoQuery.ts`, new, pure +
   tested). Build the gallery query from the model's `search_query` (falls back to name)
   and append a botanical descriptor (`" plant"`) unless the phrase already contains one
   (plant/flower/foliage/tree/shrub/vine/leaf/bush/herb). So "runner bean" →
   "runner bean plant", which stock sources tag to the growing plant. Wikipedia's
   OpenSearch still resolves the article fine.
2. **Encourage a better `search_query` from the model** (`agent-chat/tools.ts`). Tighten
   the `search_query` field description: ask the model to supply the botanical/common
   name plus "plant" (e.g. "Phaseolus coccineus plant" / "scarlet runner bean plant")
   for accurate photos. Still optional — lever 1 guarantees a baseline even when omitted.
3. **Pull a few more photos** — `ChatPlantGallery` count `6 → 9` (more chances of the
   real plant; matches `MultiImageGallery`).

## Files changing

| File | Change |
|------|--------|
| `src/lib/plantPhotoQuery.ts` (new) | Pure query-biasing helper |
| `tests/unit/lib/plantPhotoQuery.test.ts` (new) | Unit tests |
| `src/components/PlantDoctorChat.tsx` | `ChatPlantGallery` uses `plantPhotoQuery`, count 9 |
| `supabase/functions/agent-chat/tools.ts` | Stronger `search_query` guidance |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Note the query biasing |

## Tests

- Vitest for `plantPhotoQuery`: bare name → "+ plant"; already-descriptive phrase
  unchanged; uses search_query over name; trims/handles empty.
- `tsc` + `npm run build` + `npm run test:unit` green.

## Risks

- Appending "plant" could rarely narrow an already-good query — mitigated by the
  descriptor-already-present skip. Wikipedia (canonical) is unaffected (still first).
- New cache keys in `plant_image_cache` (e.g. "runner bean plant") — fine, just fresh entries.

## Deploy

`agent-chat` fn (tools.ts) individually + `scripts/deploy-app-only.mjs --bump 1`.
