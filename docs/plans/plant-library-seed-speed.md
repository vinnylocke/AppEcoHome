# Plan — speed up seeding so 100-plant runs actually finish

## Bug

User runs `count = 100`, function consistently times out around plant 30. Supabase edge function background tasks have a wall-clock cap (~150s on the relevant tier); current batch work blows through that on the 3rd or 4th batch.

## Where the time goes

Per batch (20 plants):
- Build prompt with 5000-entry avoid list → ~62k input tokens.
- Gemini call: processing 62k input + writing 20-plant JSON ~15–25s.
- 20 parallel `plant-image-search` calls (cold cache hits land Wikipedia / Pixabay / Unsplash fetches) ~3–10s.
- 20 sequential postgres inserts ~1–2s.

Total ~20–35s per batch. 5 batches for a 100-plant run = 100–175s. Right at the wall.

## Fix — three changes, biggest two are essential

### A. Drop the avoid list cap from 5000 back to 1500

5000 was overkill — sample size beyond ~1000 gives diminishing returns on dedup rate but proportionally bigger prompts. 1500 random keeps most of the dedup benefit and cuts the prompt input by ~70%.

Expected per-batch Gemini time: 15–25s → 8–12s.

### B. Skip thumbnail fetch during seeding

The lazy-fetch path in `PlantLibrarySearchTab` already backfills missing thumbnails on render (and writes through the server-side `plant_image_cache`). Doing it inline in the seeder doubles the per-batch cost for no extra value.

Stop calling `plant-image-search` during seed. New rows land with `thumbnail_url = null`; the search-results UI fills them in lazily. The image cache still warms organically.

Expected per-batch image time: 3–10s → 0s.

### C. (Optional) Bulk insert instead of per-row

Currently we loop with 20 sequential `INSERT … ON CONFLICT DO NOTHING` calls so we can capture per-row error details for the new "Failed seed inserts" log. Could swap to a single bulk insert, but we'd lose per-row error capture unless we walk the conflict-detection separately.

**Not in this wave** — per-batch insert time is only 1–2s, marginal. Keep the per-row loop for the diagnostics. Revisit if we ever need the speed back.

## Expected new per-batch time

8–12s (Gemini) + ~0s (no image fetch) + 1–2s (inserts) = **~10–14s per batch**.

100 plants = 5 batches × ~12s = ~60s. Comfortable headroom on the 150s cap.

1000-plant cron run = 50 batches × ~12s = ~600s. Still over the cap — but that's a separate problem we can solve with multi-invocation chunking later. For now, 100-plant manual runs will work reliably.

## Out of scope (next wave if needed)

- Multi-invocation orchestration for 1000-plant cron (split into 5 × 200-plant function calls, sequenced from a tiny dispatcher).
- Bulk inserts (if we ever need the few seconds back).
- Family-rotation seeding from the previous plan — separate concern, doesn't affect timing.

## Files

| File | Change |
|------|---------|
| `supabase/functions/seed-plant-library/index.ts` | `INITIAL_AVOID_FETCH` 5000 → 1500; `MAX_AVOID_LIST_SIZE` 5000 → 1500; drop the `fetchThumbnail` call + remove the helper |

No migration, no UI change.

## Sequencing

Edit one file → typecheck → deploy.
