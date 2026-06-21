# Chat image accuracy — disclaimer + AI relevance vetting

## Problem

The Garden AI chat shows plant photos from the **web** (Wikipedia / Unsplash / Pixabay,
via `plant-image-search`) in two places:

- `ChatPlantGallery` — up to 9 photos when the user asks to *see* a plant (`show: true`).
- `ChatPlantCard` (default) — a single Wikipedia thumbnail per suggestion.

Two gaps versus the rest of the app:

1. **No accuracy disclaimer** (areas + plant search now carry one). Web photos can show the
   wrong species/variety, produce instead of the plant, or unrelated scenes.
2. **No relevance filtering.** `plant-image-search` returns whatever Unsplash/Pixabay match
   the text query — it never checks the photo actually *shows* the plant. So a "runner bean"
   gallery can include a plate of beans or a stock person.

The user wants: (A) the disclaimer in chat too, and (B) the AI to score each photo for
whether it really shows the requested plant and hide ones below a confidence threshold.

## App-reference files consulted

- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — chat gallery + card behaviour.
- `docs/app-reference/99-cross-cutting/24-image-sources.md` — image providers + cache.
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `plant-image-search`.
- `docs/app-reference/99-cross-cutting/13-ai-gemini.md` — Gemini call patterns + `logAiUsage`.

## Part A — Disclaimer in chat (small, low-risk)

The existing `src/components/ImageDisclaimer.tsx` copy names Perenual/Verdantly as the
"verified" source — but chat photos come from Wikipedia/Unsplash/Pixabay (none verified),
so that wording is wrong here.

- Generalise `ImageDisclaimer` to accept an optional `text?: string` (default = current
  search copy), keeping the icon + styling.
- In `PlantDoctorChat.tsx`, render one `<ImageDisclaimer text={…} />` at the bottom of the
  `suggested_plants` block (after the cards, ~line 1175), so it appears once per reply that
  shows photos — covering both the gallery and the thumbnail cards.
- Chat copy (web sources): *"Photos come from the web (Wikipedia, Unsplash, Pixabay) and may
  not show the exact plant or variety — use them as a guide."*

## Part B — AI relevance vetting (the confidence score + threshold)

Add an **opt-in vetting step** to `plant-image-search`, used by the chat gallery only.

**Flow (server, in `plant-image-search`):**
1. Gather the up-to-9 images as today.
2. If `vet: true` in the request body (chat gallery passes it; thumbnail `count===1` path does
   NOT), run **one batched Gemini vision call**: fetch each image's `thumb_url`, base64 it, and
   ask the model to score every image 0–1 for *"does this clearly show {query} (the growing
   plant)?"* in a single structured response `{ scores: number[] }`.
3. Drop images scoring below a threshold constant (`MIN_PLANT_PHOTO_CONFIDENCE`, start ~0.55).
4. Return survivors (optionally with their score). If **all** are filtered → return `[]`
   (chat already shows "No photos found"; we'll word it "No clear photos found").
5. **Fail open:** on any vision error/timeout, return the *unvetted* images so the gallery
   never breaks. Log the vision call via `logAiUsage` (action `vet_plant_images`,
   contextBlock = query + per-image alt/source, prompt, rawResult).

**Caching:** today only the first image is cached. Extend the cache so the *vetted gallery*
is stored per query (a new `plant_gallery_cache` table, or a JSON `gallery` column keyed by
`query_normalised`, 90-day TTL) — so vetting is a one-time cost per query, not per render.

**Bounding cost/latency:** only the explicit "show me" gallery is vetted (not the hot
thumbnail path); scores are cached; scoring uses small `thumb_url` bytes; fail-open keeps it
non-blocking on errors.

## Decisions (confirmed)

- **Ship scope:** disclaimer **and** vetting together (one piece of work).
- **Gating:** vetting runs for **all chat tiers (Sage+)** — no extra tier gate, since chat is
  already Sage+ only. So `plant-image-search` just vets whenever `vet: true` is passed; no
  per-user tier resolution needed. Cost is bounded by the per-query gallery cache.

## Tests

- **Unit (Vitest):** `ImageDisclaimer` renders custom `text`; a pure
  `filterByConfidence(images, scores, threshold)` helper in `src/lib/` (or `_shared`).
- **Deno:** the vetting parse/filter logic in `plant-image-search` (extract a pure
  `selectConfidentImages` helper in `_shared/` and test threshold + fail-open + all-filtered).
- **E2E (Playwright):** extend `tests/e2e/fixtures/api-mocks.ts` `plant-image-search` mock to
  return scores; assert the disclaimer shows under a photo reply and low-confidence thumbs are
  absent.

## Docs to update

- `05-tools/03-plant-doctor-chat.md` — disclaimer + vetting step + threshold.
- `99-cross-cutting/10-edge-functions-catalogue.md` — `plant-image-search` now optionally
  calls Gemini (`vet` flag).
- `99-cross-cutting/24-image-sources.md` — vetting + gallery cache.
- `docs/e2e-test-plan/` — chat surface rows for disclaimer + filtering.

## Risks / notes

- Gemini multi-image vision token cost — mitigated by cache + thumb-size + show-only scope.
- `plant-image-search` still imports `serve` from deno.land/std; I'll convert it to
  `Deno.serve` while editing (consistent with the rest, immune to the bundler outage).
- No change to the on-demand `ReadAloudButton` or the auto-read fix (separate plan).
