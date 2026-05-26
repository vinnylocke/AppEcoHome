# Overhaul — let the user draw on their photo to highlight change areas

## Goal

Add an optional **"highlight" step** to the Garden Overhaul flow where the user can draw on their photo to mark areas they want the AI to focus changes on. The annotated image (with red brush strokes baked in) is what the AI sees; the prompt is updated to tell Gemini that marked regions are where to focus changes and unmarked regions should be preserved.

The original (unmarked) photo is still stored so the result view can show both "before" (clean) and the user's highlights when relevant.

## App-reference files consulted

- [`docs/app-reference/04-planner/`](docs/app-reference/04-planner/) — planner surface organisation.
- [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](docs/app-reference/99-cross-cutting/13-ai-gemini.md) — confirms `gemini-2.5-flash-image` is the multimodal model used for transformation. It accepts a reference photo + text prompt; baked-in annotations are the standard pattern for "focus changes here" guidance because Gemini Flash Image doesn't expose a strict mask/inpainting API.

---

## UX

### New Step 2 — "Highlight (optional)"

The wizard expands from 3 → 4 steps:

| # | Title | Existing? |
|---|---|---|
| 1 | The Photo | yes |
| **2** | **Highlight (optional)** | **NEW** |
| 3 | The Vision | renumbered (was 2) |
| 4 | Review | renumbered (was 3) |

Step 2 shows the photo with a canvas overlay. The user can paint with a brush over areas they want changed. Footer offers two CTAs:
- **Next Step** — continues (with or without highlights).
- **Skip — change the whole garden** — primary action when the user just wants a full redesign without bothering to mark anything. (Same as Next Step when nothing has been drawn — present as a distinct affordance for clarity.)

### Drawing tool

Inside the canvas: a small floating toolbar with:
- **Brush size** — small / medium / large (defaults to medium).
- **Undo** — pops the last stroke.
- **Clear** — wipes all strokes (with a tiny confirm to prevent fat-fingering).

Brush colour is fixed bright red with ~60% opacity so the underlying garden is still visible — important because the AI uses the visible structure when computing the redesign.

Touch + mouse + stylus all supported via `pointer` events.

### Result view

- "Your garden (before)" continues to show the **clean** original photo.
- When the user added highlights, a small chip beside the photo says "Highlighted regions used" with a tap-to-view that pops the annotated version.

---

## Technical breakdown

### Storage

New nullable column on `plan_overhaul_inputs`:

```sql
ALTER TABLE plan_overhaul_inputs
  ADD COLUMN annotated_photo_url text;
```

`annotated_photo_url` holds the signed URL of the user-marked image. Null when the user skipped highlighting.

### Client form changes

In [`src/components/planner/OverhaulPlanForm.tsx`](src/components/planner/OverhaulPlanForm.tsx):

- Add `highlightedPhotoBase64: string | null` state. Initially null; set when the user paints anything.
- Add `Step2Highlight` step inside the wizard. Renumber existing Step 2/3 to 3/4.
- On submit, if `highlightedPhotoBase64` is set, send BOTH `photoBase64` (original) AND `annotatedPhotoBase64` to the edge fn.

New component `src/components/planner/PhotoHighlighter.tsx`:

- HTML5 canvas overlaid on an `<img>` of the photo at natural aspect ratio.
- Stroke list kept in state so undo is trivial.
- Pointer events; brush radius scales with the canvas's CSS-to-natural-pixel ratio so the strokes look the same regardless of viewport.
- Exposes an imperative `getAnnotatedBase64()` via `useImperativeHandle` — composites the original `<img>` + drawn strokes onto an offscreen canvas at natural resolution, returns base64 PNG.

### Edge function changes

In [`supabase/functions/generate-garden-overhaul/index.ts`](supabase/functions/generate-garden-overhaul/index.ts):

- Accept optional `annotatedPhotoBase64: string` in the request body alongside the existing `photoBase64`.
- When present:
  - Upload it to `garden-overhaul-photos` bucket alongside the original; save its signed URL on `plan_overhaul_inputs.annotated_photo_url`.
  - Use it (not the original) as the reference image fed to Gemini for concept generation.
  - Prepend prompt guidance: "Bright red brush strokes on the photo mark areas the user specifically wants redesigned. Concentrate visual changes in those regions. Preserve everything else as faithfully as possible — same pathways, same fencing, same camera angle. The strokes themselves are user annotations, not part of the garden — do not render them in the output."
- When absent: existing behaviour (full transformation, no localisation).

### Prompt updates

In `buildOverhaulPrompt` ([`supabase/functions/generate-garden-overhaul/index.ts`](supabase/functions/generate-garden-overhaul/index.ts)):

- Accept a `hasHighlights: boolean`.
- When true, the "concept_prompts" section gains: "Each prompt MUST explicitly tell the model to focus changes on the regions marked in red and to preserve unmarked regions verbatim."

### Result view

In [`src/components/planner/OverhaulConceptPicker.tsx`](src/components/planner/OverhaulConceptPicker.tsx):

- Add a "Highlighted regions used" chip + tap-to-view modal when `input.annotated_photo_url` is populated.

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/20260527230100_plan_overhaul_inputs_annotated_photo.sql` | NEW — add nullable column. |
| `src/components/planner/PhotoHighlighter.tsx` | NEW — canvas drawing component. |
| `src/components/planner/OverhaulPlanForm.tsx` | Insert Step2Highlight, thread annotated base64 through submit. |
| `src/services/gardenOverhaulService.ts` | Add `annotatedPhotoBase64?: string` to `OverhaulSubmitInput` + `annotated_photo_url?: string \| null` to `OverhaulInput`. |
| `supabase/functions/generate-garden-overhaul/index.ts` | Accept + upload annotated photo, switch reference image, update prompt. |
| `src/components/planner/OverhaulConceptPicker.tsx` | Show the annotated photo chip in the result view. |
| `tests/unit/components/PhotoHighlighter.test.tsx` | NEW — small smoke test that draw → getAnnotatedBase64() returns a non-empty data URL. |

---

## Risks & edge cases

- **Gemini Flash Image isn't true inpainting.** It treats baked-in annotations as visual guidance, not a hard mask, so the model MAY adjust non-highlighted areas anyway. Acceptable for v1; the prompt is explicit and the model honours guidance well in practice. Documented in the UI as "guidance" not "exact mask".
- **Annotation strokes might bleed through into output.** Mitigated by the prompt instruction "the strokes themselves are user annotations, not part of the garden — do not render them in the output". If we see them appearing in concepts, we can tighten the prompt or experiment with sending TWO reference images (original + annotated).
- **Mobile pointer + scroll interaction.** Canvas needs `touch-action: none` to prevent scrolling while drawing. Outside the canvas the page scrolls normally.
- **Cost** unchanged — same one vision call + 3 image generations.
- **Backward compat** — existing overhaul plans have `annotated_photo_url = null` and continue to work exactly as today.

---

## Steps

1. Migration: add `annotated_photo_url` column. Apply locally.
2. Build `PhotoHighlighter.tsx` with pointer-events drawing + composited base64 export.
3. Insert Step2Highlight into `OverhaulPlanForm`. Renumber existing steps.
4. Thread `annotatedPhotoBase64` through `generateGardenOverhaul` service + edge fn.
5. Upload + persist annotated photo in the edge fn; switch which image is sent to Gemini.
6. Update `buildOverhaulPrompt` for the highlighted case.
7. Surface the annotated photo in the concept picker via chip + modal.
8. Typecheck + unit tests.
9. Push migration to remote (with confirmation).
10. Deploy via `npm run deploy --bump 1`.
