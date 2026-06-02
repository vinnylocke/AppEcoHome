# Plan — Plant Lens: up-to-5 photos + Pl@ntNet primary ID with AI cross-check

## Context

Vinny wants two enhancements to the Plant Lens (formerly Plant Doctor) + the disease/pest paths:

1. **Up to 5 photos per ID** for everything except Multi-ID (which stays at 1 — its premise is "one photo, many plants").
2. **Pl@ntNet as the primary identifier** (he has an API key), cross-checked with Gemini, with Gemini still owning everything Pl@ntNet doesn't do: care guides, health/sunlight, pruning, propagation, edibility, disease, pest, suggested tasks.

This document covers both changes and recommends a two-wave rollout so each can land cleanly.

## App-reference files consulted

- [docs/app-reference/05-tools/02-plant-doctor.md](docs/app-reference/05-tools/02-plant-doctor.md) — full surface contract including the four single-plant actions, Multi-ID, vision cascade.
- [docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md](docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — pattern for shared upstream services.
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](docs/app-reference/99-cross-cutting/13-ai-gemini.md) — Pro-first vision cascade, model order, env-block grounding.
- [docs/app-reference/99-cross-cutting/25-plant-providers.md](docs/app-reference/99-cross-cutting/25-plant-providers.md) — Perenual + Verdantly contract; Pl@ntNet will join as a third upstream.

## Pl@ntNet at a glance

- Endpoint: `POST https://my-api.plantnet.org/v2/identify/{project}` (we'll use `all`).
- Auth: `api-key=…` query param.
- **Up to 5 images per request** (perfect fit for the "up to 5 photos" goal).
- Multipart form-data, optional `organs` per image (`leaf` / `flower` / `fruit` / `bark` / `auto`).
- Response: `results[]` with `score` (0–1), `species.scientificNameWithoutAuthor`, `species.commonNames[]`, `genus`, `family`, plus `bestMatch` + `remainingIdentificationRequests` (quota tracking).
- Strength: trained on millions of curated botanical photos — beats general vision LLMs at species ID.
- Limit: identification only. No diagnose / pest / care / edibility.

## Recommended approach — two-wave

### Wave 1 — Multi-photo foundation (no Pl@ntNet yet)

Lift the whole photo plumbing to support 1–5 images. Edge function still calls Gemini for every action, but with multiple images for better visual reasoning. Zero risk of regressions on the Pl@ntNet side because Pl@ntNet doesn't exist yet.

**Frontend:**
- `PlantDoctor.tsx` — replace `selectedFile: File | null` + `imagePreview: string | null` with `images: PhotoEntry[]` where `PhotoEntry = { file, previewUrl, organ?: "leaf" | "flower" | "fruit" | "bark" }`.
- Multi-photo capture UI:
  - A horizontal strip of up-to-5 thumbnail slots above the existing capture row.
  - Each thumbnail: ✕ to remove, organ-tag dropdown (`leaf/flower/fruit/bark` — default `auto`, hidden by default behind a small "Tag organ" affordance to keep the UI calm for new users).
  - Capture buttons stay where they are; tapping them appends to the strip until 5 are present (then the buttons disable with a "Up to 5 photos" tooltip).
- **Multi-ID is special-cased**: shows only 1 slot, "Multi-ID uses a single overview photo of several plants."
- Annotation overlay (`PhotoAnnotationOverlay`) operates on the **first** photo; we'll add a future enhancement to per-photo annotations, out of scope here.

**Service (`plantDoctorService.ts`):**
- Add `PhotoInput = { base64: string; mimeType: string; organ?: PlantOrgan }`.
- New shape: `images: PhotoInput[]` field on every action.
- Keep `imageBase64` legacy field accepted server-side for one release, then drop next wave. Internally on the client we move to the array shape immediately.

**Edge function (`plant-doctor/index.ts`):**
- Normalise inbound: `images = body.images ?? (body.imageBase64 ? [{base64: body.imageBase64, mimeType: body.mimeType}] : [])`.
- All Gemini prompt builders now produce a multi-image `parts[]` content block instead of single image part.
- Multi-ID guards: if `action === "identify_scene"` and `images.length > 1`, return 400 "Multi-ID accepts exactly one overview photo" — UI enforces this too.

**Schema:**
- `plant_doctor_sessions.image_url` becomes an array: add `image_urls text[]` column (nullable, defaults to `'{}'`), keep `image_url` for back-compat (population gets `image_urls[0]`).
- History UI shows a small grid of thumbs instead of the single image when there are >1.

**Tests / docs:**
- Vitest: add a `tests/unit/components/PlantDoctorPhotos.test.tsx` for the photo-strip add/remove/cap-at-5 logic. (New surface, new test.)
- E2E: update `tests/e2e/specs/plant-doctor.spec.ts` (if it exists) to capture two photos before running Identify.
- Update [02-plant-doctor.md](docs/app-reference/05-tools/02-plant-doctor.md) to document the multi-photo flow + the new schema column.

### Wave 2 — Pl@ntNet primary ID + Gemini cross-check

**New shared module: `supabase/functions/_shared/plantnet.ts`**
```ts
export interface PlantNetMatch {
  score: number;                        // 0–1
  commonName: string | null;            // species.commonNames[0] ?? null
  scientificName: string;               // species.scientificNameWithoutAuthor
  genus: string | null;
  family: string | null;
  gbifId: string | null;
  remainingRequests: number | null;     // from response header / field
}
export interface PlantNetIdentifyResult {
  bestMatch: PlantNetMatch | null;
  topMatches: PlantNetMatch[];          // top 5 ranked desc
  query: { project: string; organs: string[]; imageCount: number };
}

export async function identifyWithPlantNet(input: {
  images: Array<{ base64: string; mimeType: string; organ?: PlantOrgan }>;
  apiKey: string;
  lang?: string;                        // default "en"
}): Promise<PlantNetIdentifyResult>;
```

Uses `FormData` + `fetch`, handles rejection (no-plant), retries once on 503, throws clearly on 401 / quota errors so the edge function can fall back to AI gracefully.

**Edge function changes (`plant-doctor/index.ts`):**

For `identify_vision` and the ID step of `analyse_comprehensive`:

1. Call Pl@ntNet first with up to 5 images.
2. **Confidence routing:**
   - `bestMatch.score ≥ 0.4` → trust Pl@ntNet. Pass the species name + scientific name into the Gemini prompt as *grounded ID*, asking Gemini to write care/health/disease/etc. for that confirmed species. Gemini still runs but skips the ID step.
   - `0.15 ≤ bestMatch.score < 0.4` → "cross-check" mode: Gemini ID runs too. If both agree (case-insensitive scientific name match), surface as confirmed. If they differ, surface as a small "AI suggests X — Pl@ntNet suggests Y" disagreement note.
   - `bestMatch === null` (rejected as non-plant) or `score < 0.15` → fall back entirely to Gemini ID (current behaviour).
3. Returned payload adds an `identification_source` field: `"plantnet"` / `"plantnet+ai_confirmed"` / `"ai_fallback"` so the UI can surface a small provenance pill.

For `diagnose`, `identify_pest`, **Multi-ID**:
- **Disease**: stays Gemini-only (no Pl@ntNet equivalent). But the user already-identified plant goes into the prompt as grounding when present.
- **Pest**: stays Gemini-only.
- **Multi-ID**: stays Gemini-only — Pl@ntNet is single-species per request, and Multi-ID's whole point is detecting boxes in a busy photo.

**Frontend changes:**
- The identification card shows the Pl@ntNet match + its score (a quiet "Pl@ntNet confidence 86%" pill).
- Tap the pill → small expander listing the top 3 Pl@ntNet candidates with scores (useful when score is in the cross-check band).
- Identification-source pill: `"Pl@ntNet"` / `"Pl@ntNet + Gemini agreed"` / `"Gemini fallback"`.
- All other panels (Health, Pruning, Disease, Pest, Suggested tasks) unchanged.

**Schema:**
- `plant_doctor_sessions` adds `plantnet_result jsonb` (top 3 matches + scores + source decision). Existing `results jsonb` keeps everything else. Both are optional.

**Secret:**
- `PLANTNET_API_KEY` added to Supabase project secrets. The edge fn reads `Deno.env.get("PLANTNET_API_KEY")`. Missing key → silently fall back to AI-only ID + a one-liner Sentry warning (so we don't break prod if the key is mid-rotation).

**Cost / quota:**
- Pl@ntNet charges per request; you said you have a paid key, so the budget is yours. No client rate-limiting changes; we log Pl@ntNet calls into `ai_usage_log` with `model: "plantnet/v2-identify-all"` and a flat per-call cost (placeholder until you tell me the per-call rate).
- Gemini still rate-limited by the existing `enforceRateLimit`.

**Tests / docs:**
- Deno test: `supabase/tests/plantnet.test.ts` — mocks `fetch`, asserts the request shape (multipart, organs, api-key query) + response parsing.
- Update [02-plant-doctor.md](docs/app-reference/05-tools/02-plant-doctor.md), [25-plant-providers.md](docs/app-reference/99-cross-cutting/25-plant-providers.md), [10-edge-functions-catalogue.md](docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md).
- App-reference: new file `docs/app-reference/99-cross-cutting/38-plantnet.md` (Role 1 + Role 2 + cross-links).

## Why two waves and not one

- Wave 1 is self-contained: changes touch UI + service + edge fn + schema, but no new upstream service. Easy to roll back if multi-photo behaviour surprises us.
- Wave 2 layers on Pl@ntNet on top of clean multi-photo plumbing — testing the upstream integration in isolation, without simultaneously debugging "did the multi-photo strip handle the failure properly?".
- Cumulative risk drops massively. Each wave is ~one or two days of focused work + tests + deploy.

If you prefer to ship both as a single bundle I'll squash, but I'd rather not.

## Files changed (summary)

### Wave 1

| File | Why |
|------|-----|
| `src/components/PlantDoctor.tsx` | Multi-photo state + capture strip UI + Multi-ID guard |
| `src/components/lens/AnalyseResultCard.tsx` | Carousel-style image preview when >1 |
| `src/services/plantDoctorService.ts` | `PhotoInput[]` shape, multi-image payloads |
| `supabase/functions/plant-doctor/index.ts` | Multi-image normaliser, multi-part Gemini prompts |
| `supabase/migrations/<ts>_plant_doctor_image_urls.sql` | `image_urls text[]` column on `plant_doctor_sessions` |
| `src/components/PlantDoctorHistory.tsx` | Thumb grid for sessions with >1 photo |
| `src/components/PhotoAnnotationOverlay.tsx` | Operates on first photo only (docs note) |
| `tests/unit/components/PlantDoctorPhotos.test.tsx` | New test for the strip behaviour |
| `docs/app-reference/05-tools/02-plant-doctor.md` | Document multi-photo |

### Wave 2

| File | Why |
|------|-----|
| `supabase/functions/_shared/plantnet.ts` | New Pl@ntNet helper |
| `supabase/functions/plant-doctor/index.ts` | Route identify through Pl@ntNet → Gemini cross-check; new payload field |
| `supabase/migrations/<ts>_plant_doctor_plantnet_result.sql` | `plantnet_result jsonb` column |
| `src/services/plantDoctorService.ts` | Surface `identification_source` + `plantnet_top_matches` |
| `src/components/lens/AnalyseResultCard.tsx` | Provenance pill + expandable Pl@ntNet candidate list |
| `src/components/PlantDoctor.tsx` | Identify result card mirrors the new pill |
| `supabase/tests/plantnet.test.ts` | New Deno tests |
| `docs/app-reference/05-tools/02-plant-doctor.md` | Document the routing logic |
| `docs/app-reference/99-cross-cutting/25-plant-providers.md` | Add Pl@ntNet section |
| `docs/app-reference/99-cross-cutting/38-plantnet.md` | New ref file |
| `docs/app-reference/00-INDEX.md` | Index the new ref |

## Open questions

1. Two waves vs one big ship?
2. Confidence thresholds for Pl@ntNet — happy with the suggested **≥ 0.4 trust / 0.15–0.4 cross-check / < 0.15 AI fallback** bands? These match Pl@ntNet's own published interpretation guidance.
3. When Pl@ntNet + Gemini disagree, do we want a hard-block "you choose" UI, or a quiet inline note "AI suggests X, Pl@ntNet suggests Y — pick one to save to Shed"?
4. Org-tag dropdown per photo — default visible, or hidden behind a "Tag organ" toggle? Pl@ntNet's `auto` works well but explicit organ tagging measurably improves accuracy.
