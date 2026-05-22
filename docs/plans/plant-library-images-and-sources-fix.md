# Plan — Plant Library: image fetch + verifier sources

Two real bugs in the wave we just shipped.

## Bug 1 — no thumbnails on seeded rows

The seeder calls `plant-image-search` via `db.functions.invoke()` for each plant. That function throws hard when `UNSPLASH_ACCESS_KEY` is missing — even though Pixabay + Wikipedia could still return a result. If the prod env doesn't have Unsplash configured, every call returns null and every seeded plant lands with `thumbnail_url = null`.

**Fix layered**:

1. **Soft-fail Unsplash** in `plant-image-search` — only throw when ALL three providers (Unsplash, Pixabay, Wikipedia) are unavailable. Wikipedia is always available (no key needed), so practically the function should never throw.
2. **Add a direct Wikipedia thumbnail helper** in `_shared/plantLibrarySources.ts` (`fetchWikipediaThumbnail`) — same REST API as `fetchWikipediaSummary` but returns just the thumbnail URL. The seeder can call it as a guaranteed fallback if `plant-image-search` returns null for any reason.
3. **Order in the seeder**: try `plant-image-search` first (uses the shared image cache; first device pays, everyone else gets a cache hit). Fall through to `fetchWikipediaThumbnail` if it returns null. If neither yields anything, the row saves with `null` thumbnail — UI falls back to the placeholder.

## Bug 2 — amended rows have empty `sources`

The verifier's response schema marks `sources` optional. Gemini is amending the row but omitting the citations, so `sources` ends up as `[]`. The user can't tell what informed the correction.

**Fix**: stop trusting the AI to include sources at all. We already have the `wiki` and `gbif` results in hand before sending the prompt. When verdict is `'amended'`, construct the sources array deterministically from whichever of the two returned a usable result, with the licence string already on the helper response (`CC BY-SA 4.0` / `CC0 1.0`). This guarantees every amended row has at least one source.

We still record the AI's `sources` output if it provides one (richer than just the two we know about), but we OR-merge with the deterministic list so the user-visible behaviour is "amended rows always cite".

## Files to change

| File | Change |
|------|--------|
| `supabase/functions/plant-image-search/index.ts` | Don't throw on missing Unsplash; only fail when no providers at all are reachable |
| `supabase/functions/_shared/plantLibrarySources.ts` | Add `fetchWikipediaThumbnail(name)` returning `{ url, licence, source: 'wikipedia' } | null` |
| `supabase/functions/seed-plant-library/index.ts` | Try `plant-image-search` first; fall back to `fetchWikipediaThumbnail` |
| `supabase/functions/verify-plant-library/index.ts` | Build sources from `wiki` + `gbif` we already have; merge in AI's sources if any |

No DB migration needed; no client-side changes.

## Sequencing

1. Edit four files.
2. Typecheck + deploy.
3. Smoke-test in the admin page: run a small seed (10), confirm thumbnails populate. Run a verify, confirm an amended row has sources.
