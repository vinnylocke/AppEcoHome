# Photo Annotation Overlay

> A canvas-based annotation overlay where the user can circle or draw on a photo before sending it to AI (Plant Doctor) — highlighting the specific leaf, spot, or area the AI should focus on.

**Source file:** `src/components/PhotoAnnotationOverlay.tsx`

---

## Quick Summary

Renders the source photo as a canvas; user drags to draw circles / freehand annotations. Returns an annotated image (or the annotations as a separate data structure for the AI prompt) when the user confirms.

---

## Role 1 — Technical Reference

### Component graph

```
PhotoAnnotationOverlay
├── Canvas (photo + annotation layer)
├── Tool palette
│   ├── Circle tool
│   ├── Freehand tool
│   ├── Eraser
│   └── Clear
├── Annotation list
└── Confirm / Cancel
```

### `PhotoAnnotation` shape

```ts
{
  id, type: "circle" | "freehand",
  // circle: { cx, cy, r }
  // freehand: { points: [{x,y}] }
}
```

### Props (typical)

| Prop | Type | Purpose |
|------|------|---------|
| `imageUrl` | `string` | Source |
| `annotations` | `PhotoAnnotation[]` | Existing |
| `onChange` | `(anns) => void` | Lift |
| `onClose` | `() => void` | Hide |

### Data flow

- Annotations live in component state; serialised back to parent.
- Final image (with annotations baked in) generated via Canvas API.

### Edge functions invoked

None directly; consumed by Plant Doctor's AI calls.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None at this surface (used by AI tools — those gate).

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Image fails to load | Fallback message |

### Performance

- Canvas drawing; lightweight.

### Linked storage buckets

None directly.

---

## Role 2 — Expert Gardener's Guide

### Why use this overlay

When you snap a photo for Plant Doctor diagnosis, sometimes the leaf you're worried about is one among many. Annotating tells the AI "this specific spot" — sharpens the analysis.

### Every flow on this overlay

#### 1. Draw

- Pick a tool (circle / freehand).
- Drag on the photo to draw.

#### 2. Erase

- Tap eraser to remove individual annotations.

#### 3. Confirm

- Annotations bake into the payload sent to AI.

### Tier-by-tier experience

Same for every tier that has the AI.

### Common mistakes / pitfalls

- **Annotating the whole photo.** AI can't tell what's important. One circle on the affected leaf > 5 random scribbles.
- **Drawing on top of leaves you mean to highlight.** Use circle around them instead.

### Recommended workflows

- **Diagnosis:** circle the affected leaf area.
- **Pest scan:** circle visible bugs.

### What to do if something looks wrong

- **Drawing not registering:** canvas didn't initialise. Re-open.
- **Erase doesn't work:** tap exactly on the annotation; tolerance is tight.

---

## Related reference files

- [Plant Doctor](../05-tools/02-plant-doctor.md)

## Code references for ongoing maintenance

- `src/components/PhotoAnnotationOverlay.tsx`
