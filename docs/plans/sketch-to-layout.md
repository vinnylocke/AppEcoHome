# Plan — Sketch → 2D Garden Layout (AI shape detection + confirmation wizard)

**Status:** plan for approval (replanned + re-grounded 2026-07-12). No code written yet.

## Goal
Let a user photograph or upload a top-down hand-drawn sketch of their garden, have AI detect the shapes (beds, planters, paths, structures, water, boundary), then step through a wizard that sets the scale and classifies each detected shape into a real preset — producing a genuine `garden_layouts` + `garden_shapes` record that opens in the **existing** 2D/3D Garden Layout editor. No parallel layout path; the sketch flow is just a new *way in* to the same editor.

## App-reference + code consulted
- App-reference: `03-garden-hub/05-garden-layout-list.md` (entry point + the existing 3-option create modal), `03-garden-hub/06-garden-layout-editor.md` (render + insert contract), `99-cross-cutting/14-garden-shapes.md` (shape contract), `13-ai-gemini.md`, `10-edge-functions-catalogue.md`, `17-tier-gating.md`, `24-image-sources.md`. *(The pre-replan draft mis-cited `05-tools/` for these surfaces — corrected here.)*
- Code **verified 2026-07-12**: migrations `20260505000000_garden_layout.sql` (base `garden_layouts`/`garden_shapes` + RLS), `20260505100000_garden_shapes_extrude.sql` (`extrude_m` + `preset_id`), `20260505000001_garden_shapes_dashed.sql`, `20260518211456_garden_layout_workflows.sql` (`plan_id`), `20260708120000_garden_shapes_type_check.sql` (the `shape_type` CHECK); `GardenShapePanel.tsx` (preset catalogue — ids/shapeType/color/extrude_m/dashed confirmed), `_shared/gemini.ts` (`callGeminiCascade`, `toMessages`, `DEFAULT_MODELS` vs `VISION_DIAGNOSIS_MODELS`). Plus (from the prior pass): `GardenLayoutEditor.tsx`, `GardenShapeProperties.tsx`, `generate-garden-overhaul/index.ts`, `scan-area`/`scan-journal-photos` (`validateObservation` closed-vocabulary hardening), `_shared/aiGuard.ts`/`rateLimit.ts`/`aiUsage.ts`/`gardenContext.ts`, `AreaScanModal.tsx`, `ConnectDeviceWizard.tsx`.

---

## 1. End-to-end data flow
```
[Wizard] upload/capture sketch → client resize→base64
      → POST sketch-to-layout {homeId, sketchBase64, mimeType}
[Edge] requireAuth → guardAiByHome (Sage/Evergreen) → enforceRateLimit
      → store sketch in `garden-sketches` bucket (audit + wizard bg)
      → callGeminiCascade(VISION ladder, DETECTION_SCHEMA) → validateDetection()
      → logAiUsage → return 200 { detection }   ← SYNCHRONOUS (one fast call)
[Wizard] Step scale → Step per-shape classify → Step review
      → client builds garden_layouts + garden_shapes rows (client uuids)
      → insert → navigate to /garden-layout/:layoutId (existing editor)
```
The vision call is a single structured pass (like `scan-area`), so we return the detection **synchronously** — no 202/waitUntil needed (that's only for `generate-garden-overhaul`'s N follow-on Imagen calls). The wizard, not the edge fn, writes the final layout (mirrors how the editor already inserts shapes, so RLS + offline-queue behave identically).

## 2. Intermediate detection schema (the AI↔wizard contract)
The model returns **normalized** geometry (0–1 relative to the sketch's own bounds) — a scaleless sketch can't yield real metres, so absolute size is set later in the scale step. Bound via Gemini `responseSchema` (JSON mode) AND re-validated server-side (`validateDetection`, closed vocabulary — the `scan-journal-photos` pattern):

```ts
interface SketchDetection {
  garden_outline: { width_ratio: number; height_ratio: number }; // sketch aspect (for canvas)
  shapes: Array<{
    detected_kind:            // CLOSED vocabulary → maps to a preset_id (§7)
      | "raised_bed" | "planter_box" | "round_planter" | "oval_bed" | "l_shape_bed"
      | "greenhouse" | "shed" | "path" | "fence" | "wall"
      | "pond" | "tree" | "lawn" | "boundary" | "unknown";
    geometry:
      | { type: "rect"|"ellipse"; x: number; y: number; w: number; h: number }   // all 0..1
      | { type: "circle"; cx: number; cy: number; r: number }                     // 0..1
      | { type: "polygon"; points: Array<{ x: number; y: number }> };             // 0..1 (≥3)
    label_guess: string | null;   // any text read off the sketch ("Bed 1", "shed")
    confidence: number;           // 0..1
  }>;
}
```
`validateDetection` drops unknown kinds→`"unknown"`, clamps all ratios to 0..1, drops shapes with <3 polygon points or zero area, caps the count (e.g. ≤40), and returns `null` if nothing usable (→ wizard shows "couldn't read the sketch, draw it again / add shapes manually").

## 3. Vision prompt strategy
System prompt: *"You are reading a hand-drawn TOP-DOWN sketch of a garden. Identify each distinct region as one of the allowed kinds. Return normalized coordinates 0–1 where (0,0) is the top-left of the sketch and (1,1) the bottom-right. Do NOT invent real-world measurements — only relative position and size. If a region is labelled with text, copy it into label_guess. Use `unknown` when unsure rather than guessing."* + the closed kind list + `responseSchema`, `temperature: 0.2`, `VISION_DIAGNOSIS_MODELS` (Pro-led — reading messy hand-drawing needs the stronger visual reasoning), `maxOutputTokens ~2000`. Ground lightly with `buildGardenContext` (existing area names help label matching).

## 4. The confirmation wizard (`SketchToLayoutWizard.tsx`)
Step machine + modal shell copied from `ConnectDeviceWizard` (`createPortal` + `useFocusTrap`, sticky header progress bar, `data-testid="sketch-to-layout-wizard"`).

1. **Upload / capture** — camera + file (AreaScanModal resize→base64). Preview + clear. Then calls the edge fn; "Reading your sketch…" spinner.
2. **Set scale** — the crux. Show the sketch with detected shapes overlaid. User sets ONE real dimension: either *"my whole garden is __ m wide"* (drives canvas_w_m; height from aspect) OR tap a shape and enter its real width. That fixes metres-per-ratio; every shape's normalized geometry × scale → metres. Live-preview the resulting canvas size.
3. **Classify shapes** — per detected shape (mirrors `GardenShapeProperties` fields): thumbnail (bbox on sketch) + **preset picker** (the 18 presets grouped beds/structures/hardscape/features), editable **label** (pre-filled from `label_guess`), optional **area link** (existing `areas` dropdown), colour (defaults from preset). Low-confidence (<0.5) shapes float to the top flagged "please check"; `unknown` defaults to a neutral rect the user re-types; a **Remove** action drops false positives; an **Add shape** escape hatch covers misses.
4. **Review & create** — summary table + a mini 2D preview (reuse the editor's Konva render read-only). "Create layout" inserts `garden_layouts` (name, canvas dims) + `garden_shapes[]` (client uuids, via the same path the editor uses so offline-queue works), then `navigate('/garden-layout/:id')`.

## 5. Scale & measurement handling
Normalized detection (§2) + one user-supplied reference (§4 step 2) → `metresPerUnit`. `canvas_w_m = referenceWidth / refShape.w` (or the direct garden-width input); `canvas_h_m = canvas_w_m × (height_ratio/width_ratio)`. Each shape: `x_m = geo.x × canvas_w_m`, etc.; circle `radius_m = geo.r × canvas_w_m`; polygon points scaled likewise. Clamp to sane bounds (canvas 1–200 m). `extrude_m`/`dashed`/`color` come from the chosen preset, not the AI.

## 6. Mapping detection → `garden_shapes`
`detected_kind → preset_id` table (all 18 presets exist): raised_bed→`raised-bed`, planter_box→`planter-box`, round_planter→`round-planter`, oval_bed→`oval-bed`, l_shape_bed→`l-shape`, greenhouse→`greenhouse`, shed→`shed`, path→`path`, fence→`fence-panel`, wall→`wall`, pond→`pond`, tree→`tree-canopy`, lawn→(rect, no preset), boundary→`garden-boundary`, unknown→(rect, user picks). `geometry.type → shape_type` (rect/ellipse/circle/polygon). The insert row is exactly the editor's `commitDraw` contract (§ research), so it renders in 2D + 3D unchanged. **Schema gap:** a sketch gives no `area_id` (optional — linked in step 3 or later) and no `rotation` (default 0; user rotates in-editor). No new columns needed on `garden_shapes` (verified: `preset_id`, `extrude_m`, `dashed`, `plan_id`, nullable `area_id` all already exist; sketch shapes set `plan_id = null`). `color`/`extrude_m`/`dashed` are copied **from the chosen preset**, never from the AI.

> **⚠ Critical invariant (verified in `20260708120000_garden_shapes_type_check.sql`):** `shape_type` is CHECK-constrained to exactly `rect | path | circle | ellipse | polygon`, **and the 2D/3D editors silently DROP any shape whose `shape_type` they don't recognise** (this already caused an all-empty-canvas bug when a seed wrote `'rectangle'`). So `detectionToShapes` must emit *only* those five values, and the DB CHECK is the backstop. This is a correctness requirement, not a nicety — it gets a dedicated Deno test (§11).

## 7. Data-model changes
- **New storage bucket `garden-sketches`** (private; the original sketch, for audit + the wizard preview). Add to `07-data-model-media.md` + `10-edge-functions-catalogue.md`.
- Optional: `garden_layouts.source_sketch_url text null` so the editor can show "created from a sketch" + let the user re-open the original. Low priority — could ship without.
- No changes to `garden_shapes`.

## 8. Tier gating (standing directive: anything AI = tier-gated)
Sage/Evergreen only, enforced **server-side** in the edge fn (`guardAiByHome` + explicit tier check, mirroring `generate-garden-overhaul`), plus `enforceRateLimit` (a new `sketch-to-layout` entry in the tier-limits table; conservative — vision is Pro-cost). Client: the "Convert a sketch" entry card renders for all tiers but shows an upsell for Sprout/Botanist (existing `FeatureGate`/upsell pattern), so the feature is discoverable but gated. Metered via `logAiUsage` (action `sketch_detection`, cost from `estimateGeminiCostUsd`).

## 9. Edge cases & failure modes
- Unreadable / non-garden image → `validateDetection` returns null → wizard: "couldn't read that — try a clearer top-down sketch, or start a blank layout." No layout created, AI still metered.
- Zero / very few shapes → proceed with what there is + the Add-shape path.
- Over-detection (40+) → cap + a note; user removes extras.
- Wizard abandoned before step 4 → nothing persisted (layout written only on "Create"). The sketch upload + AI call already happened (cost logged) — acceptable.
- Re-run vision → a "Re-analyse" button on step 1 re-calls the fn (counts against rate limit).
- Offline → the entry card is disabled/online-gated (AI needs network), consistent with other AI surfaces.
- Rate-limited / tier-blocked → 429/403 surfaced as the standard toast; wizard offers "start a blank layout instead."

## 10. New files & touch points
**New:**
- `supabase/functions/sketch-to-layout/index.ts` — the edge fn (+ `config.toml` entry; NOT a cron so `verify_jwt` stays default/true).
- `supabase/functions/_shared/sketchDetection.ts` — `DETECTION_SCHEMA`, `validateDetection`, `KIND_TO_PRESET`, `detectionToShapes(detection, scale)` — pure, Deno-tested.
- `src/components/SketchToLayoutWizard.tsx` (+ step sub-components) and `src/services/sketchToLayoutService.ts` (client call, mirrors `gardenOverhaulService`).
- Migration: `garden-sketches` bucket + policies (+ optional `source_sketch_url`).
- Docs: new app-reference surface file for the wizard; catalogue/media/tier updates.

**Changed:**
- `GardenLayoutList.tsx` — add a **4th card, "Convert a sketch ✨"**, to the existing create-layout choice screen (currently Blank Canvas / Garden Builder / Starter Layout). Extend the `wizardMode` union (`null | "choice" | "scratch" | "builder" | "starter"`) with `"sketch"`, which renders `<SketchToLayoutWizard>` instead of the inline steps. **Note:** this list surface currently has *no* tier gating, so the sketch card is the **first tier gate** here — it renders for all tiers but shows the Sage+ upsell for Sprout/Botanist (consistent with the 3D editor already being Sage/Evergreen-gated on the sibling editor surface).
- Tier-limits table — add `sketch-to-layout`.

## 11. Tests (mandatory)
- Deno `supabase/tests/sketchDetection.test.ts` — `validateDetection` (unknown-kind drop, ratio clamp, degenerate-shape drop, cap, null-on-empty), `KIND_TO_PRESET` completeness, `detectionToShapes` scale maths (normalized→metres for rect/circle/polygon; canvas from aspect).
- Vitest for the client scale helper if any pure math lands in `src/lib`.
- Playwright `tests/e2e/specs/sketch-to-layout.spec.ts` — entry card → wizard opens → (mocked edge fn) detection renders → scale → classify → create → lands in editor with N shapes. Page object + `docs/e2e-test-plan/` rows + seeded-fixtures note.
- Edge-fn auth test — Sprout → 403, cross-home → 403 (extends `edge_function_auth.test.ts`).

## Decisions (locked 2026-07-12 — tell me to change any)
1. **Scale UX** → **offer both**, defaulting to "enter whole-garden width" (simplest), with "tap a shape + enter its real size" as the more-accurate alternative.
2. **Tier** → **Sage+**, enforced server-side. Consistent with the 3D editor already being Sage/Evergreen on the sibling surface, and it's a Pro-vision cost.
3. **Model** → **`VISION_DIAGNOSIS_MODELS`** (Pro-led). Reading messy hand-drawing needs the stronger visual reasoning; it's a low-frequency, ~$0.02 action.
4. **Store the original sketch** → **yes, in v1**: create the `garden-sketches` bucket + `garden_layouts.source_sketch_url` so the wizard can show the sketch under the overlay and the editor can later "re-open original". (Clean cut-point if we ever want to defer — the wizard also holds the base64 in memory for the session.)
5. **`garden_shapes` contract** → **verified, no schema changes** (see §6 invariant + the 2026-07-12 verification in "consulted").

## Implementation routing (agent × model — the different-model approach in action)
When you approve, I'll build in vertical slices, routing each to the model the policy assigns:

| Slice | What | Route | Why |
|---|---|---|---|
| A. Detection lib | `_shared/sketchDetection.ts` — `DETECTION_SCHEMA`, `validateDetection`, `KIND_TO_PRESET`, `detectionToShapes` | **main thread · Opus** | The feature's judgment core — shape_type invariant, scale maths, closed-vocab hardening |
| B. Edge function | `sketch-to-layout/index.ts` — auth → guard → rate-limit → vision → validate → log | **main thread · Opus** | Security-sensitive: auth / tier / RLS + a new AI surface |
| C. Wizard | `SketchToLayoutWizard.tsx` + step sub-components | **main thread · Opus** | Non-trivial multi-step UI (camera, overlay, classify, live scale preview) |
| D. Migration | `garden-sketches` bucket + policies + `source_sketch_url` | **general-purpose · Sonnet** | Routine SQL following the existing bucket pattern |
| E. Service | `sketchToLayoutService.ts` | **general-purpose · Sonnet** | Thin client call mirroring `gardenOverhaulService` |
| F. Entry card | 4th choice card + tier gate in `GardenLayoutList.tsx` | **general-purpose · Sonnet** | Small pattern-following change |
| Tests | Deno lib tests, edge-auth test, Playwright spec + page object | **`test-writer` · Sonnet** | Dedicated tier; encodes the three-tier + `data-testid` conventions |
| Run checks | test suites + `typecheck` + `check:schema` + `build` | **`test-runner` · Haiku** | Mechanical run + failure triage |
| Review | pre-deploy fresh review, security lens on slice B | **`code-reviewer` · Opus** (→ xhigh/`fable` if it flags an auth/RLS risk) | Must be fresh eyes, not the code's author |
| Deploy | `npm run deploy` after your go-ahead | **me · human-gated** | Deploy stays behind your explicit confirmation |

**Why the core (A–C) stays on the Opus main thread rather than delegated:** delegating Opus→Opus loses context for no cost saving. Delegation earns its keep where it *changes* the model — the routine slices drop to Sonnet, running drops to Haiku — and where fresh context is the point (the code-reviewer must not be the writer). That's best-model-for-job, not delegation for its own sake.

## Not doing yet
This is the plan only — waiting for your approval before any code. Build order on approval: **A + B + their tests first** (the risky core, behind the tier gate), then **C the wizard**, then **D–F wiring + entry card**, each tested green before the next; then a fresh `code-reviewer` pass; then deploy on your go-ahead.

---

## Delivered — Phase 1: server core (2026-07-12)

Built + verified (routing: **Opus** core, **Sonnet** tests, checks inline):
- **Slice A — `supabase/functions/_shared/sketchDetection.ts`** (Opus): `DETECTED_KINDS`, `DETECTION_SCHEMA` (Gemini uppercase dialect, flat geometry superset), `validateGeometry`, `validateDetection` (closed-vocab, clamp 0..1, drop degenerate/zero-area, cap 40 shapes / 24 polygon points, null only on structurally-broken input). `deno check` clean.
- **Slice B — `supabase/functions/sketch-to-layout/index.ts`** (Opus): synchronous single Vision pass → 200 `{ detection, sketch_url }`. Full audited auth chain **`requireAuth → requireHomeMembership → guardAiByHome → explicit Sage+ → enforceRateLimit`** (the overhaul fn omits `requireHomeMembership`; added here per the edge-auth audit). Stores the sketch in the private `garden-sketches` bucket (signed URL). `logAiUsage` action `sketch_detection`. `deno check` clean.
- **Migration `20260914000000_garden_sketches_bucket.sql`**: private `garden-sketches` bucket + nullable `garden_layouts.source_sketch_url`. **Applied to local DB** cleanly.
- **Wiring**: `config.toml` `[functions.sketch-to-layout]` (verify_jwt=true) + `rateLimit.ts` TIER_LIMITS (`sage 10/hr, evergreen 25/hr`).
- **Tests (Sonnet `test-writer`)**: `supabase/tests/sketchDetection.test.ts` (20 cases, green) + `edge_function_auth.test.ts` EF-015/016/017. Full Deno suite **975 passed / 0 failed**. TESTING.md counts updated.
- **Docs**: `10-edge-functions-catalogue.md`, `07-data-model-media.md`, `17-tier-gating.md` updated.

**Architecture refinement (discovered mid-build):** `validateDetection` (server hardening) stays in the Deno `_shared` lib, but `detectionToShapes` + `KIND_TO_PRESET` move to **`src/lib/garden/` (client, Vitest)** — they need the editor's metre conventions and run in the wizard, which writes the layout client-side. The Deno lib and the client mapping can't share a module (different runtimes); a Vitest test will assert `KIND_TO_PRESET` covers every `DETECTED_KINDS` value. This lands with Phase 2.

**Next (Phase 2 — awaiting go-ahead):** Slice C the wizard (`SketchToLayoutWizard.tsx` + steps, Opus), the client mapping `src/lib/garden/sketchToShapes.ts` (+ Vitest), Slices D–F (service + entry card, Sonnet), the Playwright spec + e2e-test-plan surface + new app-reference surface `03-garden-hub/13-sketch-to-layout.md`, then a fresh `code-reviewer` pass, then deploy on your go-ahead.

---

## Delivered — Phase 2: wizard + client + entry card (2026-07-12)

Built + verified (routing: **Opus** core, **Sonnet** routine + tests, **Opus** fresh review):
- **`src/lib/garden/sketchToShapes.ts`** (Opus): `computeCanvasSize`, `normalizedWidthOf`, `gardenWidthFromShapeWidth`, `detectionToShapes`, `KIND_TO_PRESET_ID`. Metre conventions verified against `commitDraw` (rect top-left / circle+ellipse centre / polygon origin+points). **Typecheck caught a real bug** — the combined `{type:"rect"|"ellipse"}` union member blocked TS narrowing to the polygon branch → split into distinct discriminated members.
- **`src/services/sketchToLayoutService.ts`** (Opus): `detectSketch` via `supabase.functions.invoke`.
- **`src/components/SketchToLayoutWizard.tsx`** (Opus): 4-step portal modal (upload → scale → classify → review), tier-gated via `useEntitlements` (server backstops), focus-trapped, client-side image resize, writes `garden_layouts` + `garden_shapes` through the editor's insert contract, navigates into the editor. Blank-layout escape hatch on unreadable sketches.
- **Entry card** (Sonnet): 4th "Convert a sketch" card (`create-sketch-layout`) in the `GardenLayoutList` create modal → opens the wizard.
- **Tests** (Sonnet `test-writer`): 30 Vitest cases for the mapping lib + Playwright `SKL-001` (non-failing tier-gate branch + mocked happy path). Unit suite **1,443 green**.
- **Docs**: new app-reference surface `03-garden-hub/13-sketch-to-layout.md` + INDEX row (renumbered from 09 — collided with light-sensor); TESTING.md + `e2e-test-plan/22-garden-layout-builder.md` updated by the test-writer.
- **Checks**: `typecheck` clean, `build` clean, Deno **975** + Vitest **1,443** green, `deno check` clean. `check:schema --local` hit a local PostgREST 401 (tooling auth, not code) — column usage verified against the applied migration; the deploy's schema gate (post-migration-push) is authoritative.

**Still to run:** fresh `code-reviewer` (Opus) pass → then deploy on the user's go-ahead (migration push + Vercel + maintenance flip), then release-notes + `git push`.
