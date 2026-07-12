# Sketch to Layout

> A wizard that turns a hand-drawn top-down garden sketch into a real 2D layout. AI detects the shapes; the gardener sets the scale and classifies each one; the wizard writes a `garden_layouts` + `garden_shapes` record and drops into the existing editor.

**Entry point:** the "Convert a sketch" card on the [Garden Layout List](./05-garden-layout-list.md) create modal (`/garden-layout`).
**Source file:** `src/components/SketchToLayoutWizard.tsx`
**Tier:** Sage / Evergreen only (AI).

---

## Quick Summary

A four-step modal wizard:

1. **Upload** — snap or upload a top-down sketch. Sends it to the `sketch-to-layout` edge fn (one Gemini Vision pass).
2. **Scale** — a sketch is scaleless, so the user gives one real measurement (whole-garden width, or the width of one detected shape). That fixes metres-per-unit.
3. **Classify** — each detected shape gets a preset (from the standard shape catalogue), an optional label, and an optional area link. Low-confidence shapes float to the top; false positives can be removed.
4. **Review & create** — names the layout and writes it, then navigates into the existing [Garden Layout Editor](./06-garden-layout-editor.md).

It is a new *entrance* to the editor, not a parallel system — it writes shapes through the identical insert contract, so rendering, RLS, and the offline queue behave the same.

---

## Role 1 — Technical Reference

### Component graph

```
GardenLayoutList (create modal)
└── "Convert a sketch" card → showSketch
    └── SketchToLayoutWizard (createPortal → document.body, useFocusTrap)
        ├── Step 0 Upload   (camera/file → resizeImage → base64; tier gate)
        ├── Step 1 Scale    (garden-width | shape-width → computeCanvasSize)
        ├── Step 2 Classify (per shape: preset picker / label / area link / remove)
        └── Step 3 Review   (name → insert garden_layouts + garden_shapes → navigate)
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `homeId` | `string` | Scope all reads/writes + the edge fn call |
| `onClose` | `() => void` | Dismiss the wizard |

### Data flow — read paths

- `useEntitlements()` → `tier` (client tier gate; `sage`/`evergreen` unlock the capture UI, otherwise the `sketch-to-layout-ai-gate` upsell shows).
- Areas for the classify dropdown: `locations.select(id).eq(home_id)` → `areas.select(id,name).in(location_id, …)` (areas link to the home via location).

### Data flow — write paths

- **Edge fn** `sketch-to-layout` via `detectSketch()` (`src/services/sketchToLayoutService.ts`): `{ homeId, sketchBase64, mimeType }` → `{ detection, sketch_url }`.
- **Layout create** (client, on "Create layout"):
  ```ts
  supabase.from("garden_layouts").insert({ home_id, name, canvas_w_m, canvas_h_m, source_sketch_url }).select("id").single();
  supabase.from("garden_shapes").insert(rows); // rows from detectionToShapes(), + id + layout_id
  // → navigate(`/garden-layout/${id}`)
  ```
- The normalized detection → metre rows mapping is `src/lib/garden/sketchToShapes.ts` (`detectionToShapes`, `computeCanvasSize`) — pure, Vitest-tested, and mirrors the editor's `commitDraw` metre conventions (rect top-left; circle/ellipse centre; polygon origin+points).

### Edge functions invoked

- `sketch-to-layout` — `requireAuth → requireHomeMembership → guardAiByHome → Sage+ → enforceRateLimit`; one Gemini Vision pass (`VISION_DIAGNOSIS_MODELS` + `DETECTION_SCHEMA`), hardened by `_shared/sketchDetection.ts` `validateDetection`; stores the sketch in `garden-sketches`; synchronous 200. See [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md).

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

Sage / Evergreen. Enforced **server-side** (the edge fn returns 403 for lower tiers, defence-in-depth) and surfaced **client-side** as the in-wizard upsell (`sketch-to-layout-ai-gate`). See [Tier Gating](../99-cross-cutting/17-tier-gating.md).

### Beta gating

None.

### Permissions

Writes go through normal `garden_layouts`/`garden_shapes` RLS (home members). Viewers' inserts are blocked by RLS.

### Error states

| State | Result |
|-------|--------|
| Unreadable / non-garden image | Edge fn returns `detection: null` → toast "couldn't pick out shapes… try a clearer photo, or start a blank layout." AI still metered. |
| Non-Sage tier | `sketch-to-layout-ai-gate` upsell (client) / 403 (server). |
| Rate-limited | Thrown error → toast; the "start a blank layout" escape hatch remains. |
| Layout/shape insert fails | Toast "Could not create the layout."; wizard stays open. |

### Performance

- One synchronous vision call (~$0.02, Pro cascade). No background jobs.
- Image is resized client-side to ≤1600 px before upload.
- Areas fetched once on open.

### Linked storage buckets

- `garden-sketches` (private) — the original sketch; edge fn mints a signed URL stored on `garden_layouts.source_sketch_url`. See [Data Model — Media](../99-cross-cutting/07-data-model-media.md).

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

You've sketched your garden on paper (or in a notes app) and don't fancy re-drawing it shape by shape in the editor. Photograph the sketch and let the app rough it out for you — beds, paths, the shed, a pond — then tidy it up. It's the fastest way from "a drawing" to a layout that actually drives sun analysis, microclimate, and the 3D view.

### Every flow on this screen

1. **Upload** — Take a photo of your sketch (top-down works best) or upload an image. Tap **Read my sketch**. If the app can't make sense of it, it'll say so — try a clearer, flatter photo, or start a blank layout.
2. **Set the scale** — This is the important one. A drawing has no real size, so tell the app *one* measurement: either how wide your whole garden is, or pick a shape you know the size of (e.g. "that raised bed is 2 m wide"). Everything else scales from that. The canvas size updates live.
3. **Classify shapes** — For each shape the app found, choose what it is (raised bed, pond, shed, path…), give it a label if you like, and optionally link it to one of your garden areas. Shapes the app wasn't sure about are flagged **check** at the top. Delete anything it got wrong — you can always add missed shapes by hand in the editor.
4. **Review & create** — Name the layout and hit **Create layout**. You land straight in the editor with everything placed, ready to nudge.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Garden width / shape width | Your one real measurement, in metres — it sets the scale for the whole layout. |
| Canvas | The drawing surface size the app worked out from your measurement + the sketch's proportions. |
| Shape type (preset) | What each shape *is* — drives its colour and 3D height. |
| Link to area | Ties a shape to an existing garden area so overlays (pH, moisture, sun) light up on it. |
| **check** badge | The AI was unsure about this one — give it a look. |

### Tier-by-tier experience

| Tier | Experience |
|------|-----------|
| Sprout / Botanist | The card is visible, but opening it shows an upgrade prompt — this is an AI feature. |
| Sage / Evergreen | Full wizard. |

### Common mistakes / pitfalls

- **Skipping the scale step's accuracy.** A rough garden-width is fine, but if you want the layout true-to-life, use the "specific shape" option with something you've actually measured.
- **Expecting a perfect trace.** The AI roughs out shapes; it won't be pixel-perfect. Treat it as a head start, then refine in the editor.
- **A photo at an angle.** Top-down and flat reads best. A skewed photo distorts the shapes.
- **Leaving false positives in.** If the app invented a shape, delete it in the classify step rather than in the editor later.

### Recommended workflows

- **Fastest:** photo → garden-width → accept the classifications → create → tidy in the editor.
- **Most accurate:** photo → scale off a measured bed → fix each classification + link areas → create.

### What to do if something looks wrong

- **"Couldn't pick out shapes":** retake the photo flatter and better-lit, or start a blank layout and draw it.
- **Everything's the wrong size:** you likely mistyped the scale measurement — the whole layout scales off that one number. Re-run and correct it.
- **A shape is the wrong kind:** change its preset in the classify step, or fix it in the editor after.

---

## Related reference files

- [Garden Layout List](./05-garden-layout-list.md)
- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Garden Shapes (cross-cutting)](../99-cross-cutting/14-garden-shapes.md)
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md)
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md)
- [Tier Gating](../99-cross-cutting/17-tier-gating.md)
- [Data Model — Media](../99-cross-cutting/07-data-model-media.md)

## Code references for ongoing maintenance

- `src/components/SketchToLayoutWizard.tsx` — the wizard
- `src/services/sketchToLayoutService.ts` — the edge fn client
- `src/lib/garden/sketchToShapes.ts` — normalized detection → metre rows (Vitest-tested)
- `supabase/functions/sketch-to-layout/index.ts` — the edge fn
- `supabase/functions/_shared/sketchDetection.ts` — schema + `validateDetection` (Deno-tested)
- `supabase/migrations/20260914000000_garden_sketches_bucket.sql` — bucket + `source_sketch_url`
