# Image Tap → Right/Wrong → Remove & Replace (Follow-up #2)

## Implementation status (2026-07-23)

Approved + built. Ailment source decision: **Perenual → iNaturalist → Wikipedia**.

- **P1 — Data model** ✅ `image_rejections` + `ailment_image_overrides` (`20261023`/`20261024`), applied locally, RLS/GRANTs, docs synced. (Reviewed SHIP.)
- **P2 — plant-image-search rejection-aware** ✅ `_shared/imageRejections.ts` + 6 Deno tests. (Reviewed SHIP.)
- **P3 — Plant judge (detail hero)** ✅ `src/lib/imageRejections.ts` + `JudgeImagePrompt` + the PlantEditModal Care-hero judge (fork-safe via `handleSaveWithOverride`). Client unit test. **Card-grid overlay = fast-follow** (fork risk of a card-inline write; the detail hero is the fork-safe surface).
- **P4 — ailment-image-search** ✅ new function (`ailment_image_cache`/`ailment_gallery_cache` via `20261025`) + `_shared/ailmentImageVet.ts` + 3 Deno tests. `deno check` clean.
- **P5 — Ailment judge (card)** ✅ `src/lib/ailmentImageOverride.ts` + the AilmentCard corner judge (writes `ailments.thumbnail_url` + the override). **Detail `heroExtra` judge + full ailment picker = fast-follow.**
- **P6 — ailment_library backfill** ⏸ DEFERRED (optional; touches the now-disabled seeding fns; null images already handled by the "Add a photo" button + KindIcon).
- **E2E** — robust ailment affordance spec (AIMG-001, no-network Right path) shipped. **Deferred to a seeded run:** the full Wrong→mock→replace→DB-assert flow (plant + ailment) — needs the local seeded stack to author + verify without guessing worker UUIDs / the modal-open path.

**Status:** SHIPPED (pending the final combined deploy with #6). Original plan below.

---

**Status (original):** PLAN — awaiting owner approval + the load-bearing source decision (Open Question 1). Do not implement until approved.
**Date:** 2026-07-23
**Source:** 4-area parallel investigation (plant image pipeline, ailment image pipeline, override/RLS patterns, judge UI surfaces) + architect design.

## Goal

On surfaces the user OWNS (their Shed plants and Watchlist ailments), let the user **tap the main image and mark it right or wrong; if wrong, remove it and replace it with another candidate** — and never show that rejected image again for that home.

## App-reference files consulted

- `docs/app-reference/99-cross-cutting/24-image-sources.md`, `25-plant-providers.md`, `13-ai-gemini.md`, `06-data-model-ailments.md`, `03-data-model-plants.md`, `19-rls-patterns.md`, `01-data-model-home.md`, `10-edge-functions-catalogue.md`
- `docs/app-reference/03-garden-hub/01-the-shed.md`, `02-watchlist.md`

## How images work today (why the design is shaped this way)

- **Plant main image** = `plants.default_image` (aliased `thumbnail_url`/`image_url` client-side). When there's no usable stored URL, `PlantResultThumb.tsx` self-resolves via `plant-image-search {query, count:1}`, which serves whatever `images[0]` was the first time anyone searched that name (shared `plant_image_cache`, 90-day TTL). The **count:9** pool = up to 1 Wikipedia + 3 Unsplash + 3 Pixabay, fixed order, **view-only** galleries (`DiagnosisImageGallery`, `MultiImageGallery`, chat) — none currently expose a "use this / set as main" action.
- **Ailment image** = `ailments.thumbnail_url` (home row) falling back to the **global, client-read-only** `ailment_library.image_url` — which is **null by design** for most rows, so most ailment cards show a bare Bug/Biohazard icon. `plant-image-search` structurally **mis-scores** pests (decorative-plant bias, aesthetic ranking, a "living growing plant" vet that downranks correct insect/lesion macros).
- **Copy-on-write:** editing `default_image` on an AI/Perenual/Verdantly plant **forks** the plant (existing invariant).

## Data model (2 new home-scoped tables — CLAUDE.md new-table GRANTs required)

**`image_rejections`** — persistent "this URL is WRONG for this subject in this home", filtered from every future candidate pool (survives the 90-day cache TTL). Columns: `id`, `home_id` (FK homes, cascade), `subject_kind` (`'plant'|'ailment'` CHECK), `subject_key` (the **normalised** name/name_key the pool is cache-keyed on), `rejected_url`, `subject_id` (loose audit pointer, not FK — plants PK is int, ailments PK is uuid), `rejected_by`, `created_at`. RLS: canonical home-scoped `FOR ALL` (`home_id IN (SELECT home_id FROM home_members WHERE user_id = (SELECT auth.uid()))`); GRANT SELECT/INSERT/DELETE to `authenticated` (DELETE = undo; no UPDATE). Unique dedup index `(home_id, subject_kind, subject_key, rejected_url)` + lookup index `(home_id, subject_kind, subject_key)`. Edge functions read it via **service role** filtered by request `home_id`.

**`ailment_image_overrides`** — per-home chosen ailment image (needed because `ailment_library` is global read-only). Columns: `id`, `home_id`, `ailment_library_id` (bigint FK, **nullable**, resolved best-effort by name_key like `user_favourite_ailments`), `identity_key` (lowercased name bridge when no library match), `image_url`, `thumb_url`, `image_credit jsonb`, `source`, `created_by`, timestamps. RLS: same home-scoped `FOR ALL`; GRANT SELECT/INSERT/UPDATE/DELETE. Two partial unique indexes (like `user_favourite_ailments`): `(home_id, ailment_library_id) WHERE NOT NULL` and `(home_id, identity_key) WHERE NULL` → find-then-upsert. Resolution order: home `ailments.thumbnail_url` → override → `ailment_library` image → KindIcon.

## Edge functions

- **`plant-image-search`** — make **rejection-aware** (only change; the reject itself is a plain client INSERT). Accept optional `{home_id, subject_kind}`; when present, load the rejected set (service client) and (a) skip the count:1 cache winner if rejected → live refetch; (b) filter the merged pool and return the next survivor(s); (c) **CRITICAL — suppress the shared-cache write-through when a rejection was applied** (that cache is cross-user; one home's reject must not leak). Empty survivors → `{images:[]}` so the UI keeps the current image. Prefer verifying home membership from the caller JWT over trusting raw `home_id`.
- **`ailment-image-search`** (NEW) — structural fork of plant-image-search: provider order Perenual pest/disease `images[]` first → the organism source chosen in **Open Question 1** → Wikipedia by clean scientific title; **drop Unsplash/Pixabay**; new ailment-aware Gemini vet (`_shared/ailmentImageVet.ts` — "rate 0-1 how clearly this shows the pest/disease organism OR its damage, NOT a healthy ornamental/diagram/logo/person", fail-open); own service-role caches `ailment_image_cache` + `ailment_gallery_cache`; rejection-aware. Never call Gemini/providers from the browser. Add to `10-edge-functions-catalogue.md`.
- **`seed-ailment-library` / `add-ailment-to-library`** (optional, Phase 6) — backfill the always-null `ailment_library` image columns at source via the sanctioned service-role path (never grant clients write to the global catalogue).

## UI — the judge affordance on 4 owned surfaces

1. **Shed plant card** — small `stopPropagation`'d icon button in the free **top-right** corner (MultiImageGallery corner pattern). Tap → shared `JudgeImagePrompt` ("Is this the right photo of {name}?" · Right / Wrong). Right = ephemeral dismiss. Wrong → INSERT rejection → `plant-image-search {count:1, home_id}` → write next survivor **through `handleSaveWithOverride`** (honours the fork invariant) → optimistic swap. Empty → keep + toast. testid `judge-image-plant-${id}`.
2. **Plant detail (PlantEditModal Care hero)** — gate the existing hero tap behind `JudgeImagePrompt`; Wrong offers auto-next **and** the existing `WikiImagePicker` as manual fallback; respect `formReadOnly` + surface the fork consequence; persists on Save.
3. **Watchlist ailment card** — same corner button. Wrong → INSERT rejection → `ailment-image-search {count:1, home_id, perenual_id?, scientific_name?}` → UPDATE `ailments.thumbnail_url` **and** upsert `ailment_image_overrides` → swap SmartImage. When the card is icon-only (null image, the common case) the same button reads **"Add a photo"**. testid `judge-image-ailment-${id}`.
4. **Ailment detail (AilmentDetailBody `heroExtra` slot)** — render the judge button in the existing render-prop seam; builds the first ailment "pick another" picker (ailment-tuned WikiImagePicker generalisation calling `ailment-image-search count:9`); uploads land in the existing `plant-images` bucket.

## Open questions for the owner

1. **⭐ Which image source powers `ailment-image-search`?** (Load-bearing.) Options: Perenual pest/disease only / **iNaturalist** (large CC-licensed organism photos, free, needs attribution) / GBIF / just swap the vet prompt on the existing providers / Bing-Google (licence risk, discouraged). **Rec:** Perenual-first when a scientific match resolves → iNaturalist as the general CC source → Wikipedia tertiary; drop Unsplash/Pixabay for ailments.
2. **Plant hero replace on a forkable plant** forks the whole plant (existing invariant). **Rec:** route through `handleSaveWithOverride` and surface the same fork note users already see for any field edit.
3. **Rejection scope key** — whole species/organism (normalised name_key, matches cache keying) vs the one row on screen. **Rec:** name_key (store concrete id in `subject_id` for audit only).
4. **Watchlist ailment write target** — `ailments.thumbnail_url` vs override table vs both. **Rec:** both (override = source of truth for library/favourite surfaces; mirrored column = no-join card render, offline-safe).
5. **Persist the "Right" verdict?** **Rec:** ephemeral for v1 (the value is the Wrong→replace path; persisting positives is speculative).
6. **Trust client `home_id` in the edge functions?** **Rec:** verify membership from the caller token (cheap defence-in-depth).
7. **Admin moderation viewer for widely-rejected images now?** **Rec:** defer, but add the `(subject_kind, subject_key, rejected_url)` index so it drops in later without a migration.

## Phasing (tests + app-reference docs mandatory each phase)

1. **Data model** — both tables + RLS/GRANTs + indexes; docs (06-data-model-ailments, 24-image-sources incl. the SmartImage single-src drift fix, 19-rls-patterns); seed a rejection + override; resolution-helper unit test.
2. **`plant-image-search` rejection-aware** — Deno tests: rejected winner skipped, next survivor served, shared cache NOT overwritten, empty-pool graceful. No UI.
3. **Plant judge UI** (card + detail) — `JudgeImagePrompt`, `imageRejections.ts`, Playwright spec, the-shed doc.
4. **`ailment-image-search`** + caches — Deno tests (vet, provider order, rejection exclusion); edge-fn catalogue.
5. **Ailment judge UI** (card + detail) + ailment picker — Playwright spec, watchlist doc, e2e-test-plan rows.
6. **(optional)** library image backfill at source — only after Open Question 1 is answered.

## Top risks

- **Shared-cache leak (most important invariant):** rejection filtering must stay per-home and must never overwrite/delete the shared cache winner. Test explicitly.
- **Copy-on-write surprise:** plant hero replace must go through `handleSaveWithOverride`, never a raw UPDATE.
- **Pool exhaustion:** return empty gracefully; UI keeps the last image + "no other photos found"; never blank to a placeholder.
- **Ailment coverage / API quotas:** many pests have no clean match — KindIcon stays the graceful floor; weigh Perenual/iNaturalist rate limits under repeated rejects.
- **Hot-path perf:** the count:1 thumbnail path is universal — short-circuit with a client per-home rejection Set when empty; indexed server lookup.
- **Attribution:** carry `image_credit` into the stored row / override or lose required licence attribution (esp. iNaturalist CC).
- **Non-unique testid trap:** per-entity testids (`judge-image-plant-${id}` / `judge-image-ailment-${id}`), not a shared one.
- **Card tap target:** the judge button is a `stopPropagation`'d top-corner overlay, not an interception of "tap card = open details"; keep clear of the bottom-corner source badge / gallery button.
