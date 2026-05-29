# Plan — "Multi-ID" Plant Doctor action (multi-plant detect + weighted mapping)

## Goal

Add a new Plant Doctor action, **Multi-ID**, alongside Identify / Diagnose / Pest Scan. The user uploads or snaps **one photo containing several plants**; the AI returns a **bounding box per detected plant** which we overlay on the image, plus a **mapping below** listing, per box, the AI's best-guess identities with a **confidence weighting**.

Name chosen by the user: **Multi-ID** (internal action value: `identify_scene`).

## App-reference files consulted

- `docs/app-reference/05-tools/02-plant-doctor.md` — the surface, its action set, the single action-discriminated `plant-doctor` edge function, the Pro-first `VISION_DIAGNOSIS_MODELS` cascade, the auto rate-limit + Sage+ AI gate applied to every non-exempt action, session writes.
- `docs/app-reference/08-modals-and-overlays/15-area-scan-modal.md` — confirms **Area Scan** is the area-bound audit tool (creates tasks/ailments for a specific garden Area). Multi-ID is deliberately different: a lightweight, identification-only Plant Doctor action with a **visual box overlay + weighted candidate mapping**, not tied to an Area and creating nothing.
- `docs/app-reference/99-cross-cutting/13-ai-gemini.md`, `10-edge-functions-catalogue.md`, `17-tier-gating.md` — Gemini call conventions, edge-fn catalogue, tier gating.

## How it works (Gemini)

Gemini's vision models return native object-detection boxes as `box_2d = [ymin, xmin, ymax, xmax]` normalised to **0–1000**. The new action asks Gemini to detect each distinct plant and return its box plus ranked candidate identities with confidence. Uses the existing Pro-first `VISION_DIAGNOSIS_MODELS` cascade (better visual reasoning) at low temperature for consistent boxes.

## Changes

### 1. Edge function — new action in `supabase/functions/plant-doctor/index.ts`

- Add `SCENE_MAP_SCHEMA` (responseSchema) near the other schemas:
  - `regions: [{ box_2d: integer[4] ([ymin,xmin,ymax,xmax], 0–1000), candidates: [{ name, scientific_name, confidence:0–100 }] }]`, plus optional `notes`.
- Add `if (action === "identify_scene")` handler (mirrors `identify_vision`, lines 1027-1055):
  - Require `imageBase64`; strip the data-URL prefix.
  - Prompt: "Detect every DISTINCT plant in this photo. For each, return its bounding box and up to 3 ranked identities (common name, scientific name, confidence 0–100). Only box things that are actually plants; don't invent regions. Cap at 12." Include the existing `locationLine` for regional priors.
  - `callGeminiCascade(apiKey, FN, toMessages([promptText, { inlineData: { data: cleanBase64, mimeType } }]), { responseSchema: SCENE_MAP_SCHEMA, models: VISION_DIAGNOSIS_MODELS, temperature: 0.2, logContext: { action } })`.
  - Server-side hygiene: drop regions with malformed `box_2d` (not 4 ints / out of 0–1000 / zero-area) or empty `candidates`; clamp confidence 0–100; sort candidates desc; cap regions at 12.
  - `logAiUsage(...)`; return JSON.
- **Gating/limits come for free**: `identify_scene` is *not* in `skipAiGate` and runs after `enforceRateLimit` (lines 526-536), so it's Sage+ and rate-limited automatically — no extra code.
- **Session write**: write a lightweight `plant_doctor_sessions` row (action `identify_scene`, `image_url`, `plant_name` = region 1's top candidate) so it appears in History, **only if** the History renderer tolerates an unknown action gracefully. I'll verify `PlantDoctorHistory` / `usePlantDoctorSessions` during implementation; if it would render badly, v1 skips the session write (logged via `logAiUsage` regardless). Noted as a checkpoint, not a guess.

### 2. Service — `src/services/plantDoctorService.ts`

- Types: `SceneRegion { box: [number,number,number,number]; candidates: { name: string; scientific_name?: string; confidence: number }[] }`, `SceneMapResult { regions: SceneRegion[]; notes?: string }`.
- `identifyScene({ homeId, imageBase64, mimeType }): Promise<SceneMapResult>` — mirrors `analyseComprehensive` (base64 in body, action `identify_scene`), normalises `box_2d` → `box`.

### 3. Pure helper — `src/lib/sceneMap.ts` (unit-tested)

- `boxToPercent([ymin,xmin,ymax,xmax]) → { topPct, leftPct, widthPct, heightPct }` (÷1000×100, clamped 0–100, non-negative w/h).
- `isValidBox(box)`, `topCandidate(region)`, `clampConfidence(n)`.
- Keeps all coordinate math out of the component → cleanly unit-testable.

### 4. UI — `src/components/PlantDoctor.tsx`

- Add a **Multi-ID** button to the secondary action row (next to Identify/Diagnose/Pest Scan), `data-testid="doctor-action-multi-id"`, gated by `aiEnabled`, disabled without an image. New `activeAction` value `"scene"`.
- Handler calls `PlantDoctorService.identifyScene(...)` → stores `sceneResult` state; shows the existing in-flight spinner.
- When `activeAction === "scene"`, render the new result card instead of the identify/diagnose panels.
- Hidden in `compact` mode (`/quick/lens`) — same as the rest of the secondary row.

### 5. UI — new `src/components/lens/SceneMapResultCard.tsx`

- Props: `{ imageUrl: string; result: SceneMapResult }`.
- **Image with overlay**: a `position: relative` wrapper around the `<img>`; one absolutely-positioned `<button>` per region using `boxToPercent` (top/left/width/height %), a coloured border + a numbered badge. Colours cycle through a small palette so boxes are distinguishable. Tapping a box sets `activeRegion`.
- **Mapping below**: a numbered list; per region, ranked candidates each with name (+ italic scientific) and a **confidence weight bar** (bar width = confidence %) + the % label; top candidate emphasised. Tapping a list row sets `activeRegion` too — two-way highlight with the boxes.
- Empty state: "Couldn't pick out distinct plants — try a clearer, wider shot in good light."
- Responsive: percentage positioning means the overlay tracks the rendered image at any width.

### Deliberately out of v1 (notes for later)

- **"Identify just this one"** per region (crop → full `identify_vision`) — natural follow-up; omitted to bound v1 to detect + weighted mapping.
- **Save a detected plant to the Shed** from a box — same; can layer on once the overlay ships.

## Tier gating

Sage+ (`aiEnabled`), identical to Identify/Diagnose/Pest. Sprout/Botanist see the existing AI-tier lock on the button. Rate-limited via the shared `enforceRateLimit`.

## Tests

- **Vitest** `tests/unit/lib/sceneMap.test.ts` — `boxToPercent` (incl. clamping + zero-area), `isValidBox`, `topCandidate`, `clampConfidence`.
- **Vitest** `tests/unit/components/SceneMapResultCard.test.ts` — renders N boxes + N mapping rows + confidence bars from a fixture; empty-state path (mirrors `AnalyseResultCard.test.ts`).
- **E2E** — add the button + result testids; add a `docs/e2e-test-plan.md` row (mock the `plant-doctor` edge fn returning two regions). Boxes are network/AI-dependent, so assert structure (boxes + mapping rendered), not pixels.

## Docs to update

- `05-tools/02-plant-doctor.md` — actions table, component graph, edge-fn action table, tier gating, Role 2 flow, code references (add `SceneMapResultCard`, `sceneMap.ts`).
- `99-cross-cutting/10-edge-functions-catalogue.md` — add `identify_scene`.
- `99-cross-cutting/13-ai-gemini.md` — note object-detection (`box_2d`) usage.
- `99-cross-cutting/17-tier-gating.md` — add Multi-ID (Sage+).
- `docs/e2e-test-plan.md` — Multi-ID rows.

## Migration

None. Reuses `plant_doctor_sessions` (no schema change), the existing `plant-doctor` edge function, and the `VISION_DIAGNOSIS_MODELS` cascade.

## Risks / edge cases

- **Box accuracy** — Gemini detection is good but not pixel-perfect; the weighted mapping (confidence %) sets honest expectations, and the empty-state covers "no distinct plants found". Low temperature + Pro-first cascade for the steadiest boxes.
- **Crowded photos** — capped at 12 regions to keep the overlay legible and the payload bounded.
- **Cost** — one Pro-first vision call per run (cents), same envelope as Identify; rate-limited.

## Process

1. Edge fn (schema + `identify_scene` handler) → service → `sceneMap.ts` + tests → `PlantDoctor` button → `SceneMapResultCard`.
2. `npx tsc --noEmit` + `npm run build` + `npm run test:unit`.
3. Update docs.
4. Release note; deploy with **`--bump-major`** (major new feature, per release convention); push to main.
