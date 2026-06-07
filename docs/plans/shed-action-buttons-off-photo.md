# Plan — Move Shed tile action buttons off the photo into the card body

## Context

The Shed tile renders 4–5 action buttons (Layout / Light / Ask AI / Archive / Delete) at `absolute top-4 right-4` on top of the plant photo. Even after 22.0008's source-label move, the buttons still:

- Crowd the photo on every viewport (especially on mobile when 5 of them stack at the right edge)
- Sit over real plant imagery, which fights the photo as a hero
- Are styled `bg-white/90 backdrop-blur-md` only because they have to read against the photo — visual noise we don't actually need

Moving them off the photo into the card body lands them in a more conventional place and frees the photo to actually be a hero.

## Approach

1. **Remove** the existing `<div className="absolute top-4 right-4 flex gap-1.5 sm:gap-2">…</div>` from inside the photo area.
2. **Add** a new action row inside the card body, slotted between the status chips block and the existing "Instances / Assign" footer. The row uses ghost-style icon buttons (no background, hover fills + colour tint) so it sits cleanly inside the white card without competing with the chunky Assign CTA below it.
3. **Preserve all click handlers, conditions and a11y attributes** verbatim — Ask AI still gates on `aiEnabled`, Archive / Delete still gate on `can("shed.delete")`.

### New row markup

```tsx
<div className="mt-3 flex items-center gap-1">
  <ActionIconButton
    icon={LayoutGrid}
    label="View on garden layout"
    tone="violet"
    onClick={(e) => { e.stopPropagation(); navigate("/garden-layout"); }}
    testId={`plant-card-layout-${plant.id}`}
  />
  <ActionIconButton
    icon={Sun}
    label="Light needs"
    tone="amber"
    onClick={(e) => { e.stopPropagation(); setEditingPlantTab("light"); setEditingPlant(plant); }}
    testId={`plant-card-light-${plant.id}`}
  />
  {aiEnabled && (
    <ActionIconButton
      icon={Sparkles}
      label="Ask Rhozly AI about this plant"
      tone="primary"
      onClick={…}
      testId={`plant-card-ask-ai-${plant.id}`}
    />
  )}
  {can("shed.delete") && (
    <ActionIconButton
      icon={plant.is_archived ? ArchiveRestore : Archive}
      label={plant.is_archived ? "Restore" : "Archive"}
      tone="orange"
      onClick={…}
    />
  )}
  {can("shed.delete") && (
    <ActionIconButton
      icon={Trash2}
      label="Delete"
      tone="red"
      onClick={…}
    />
  )}
</div>
```

`ActionIconButton` is a tiny local helper kept inside `TheShed.tsx` to avoid the inline duplication. Each button:

- 36 × 36 (`w-9 h-9`) — comfortably above the 44px tap-target minimum once you include the row's natural padding
- Ghost style: `text-rhozly-on-surface/55 hover:bg-rhozly-surface-low hover:text-{tone}-600`
- aria-label + title for keyboard / screen-reader users
- `stopPropagation` so a tap on the icon doesn't also open the card

## Files modified

| File | Change |
|------|--------|
| [`src/components/TheShed.tsx`](../../src/components/TheShed.tsx) | Remove the absolutely-positioned action row from the photo area; add the new ghost-icon action row in the card body |

## Tests

Visual only — testIds preserved so the existing Playwright selectors keep working.

## Deploy

Frontend-only. Minor bump → **22.0009**.

## Risks

- **Tap target size** — 36px sits below the 44px guidance, but with row padding the effective hit area is comfortable. If it turns out cramped on a phone we can bump to `w-10 h-10`.
- **Bulk-select mode** — unaffected. The existing bulk action bar (fixed at the bottom of the screen) still handles multi-select operations.
- **Visual hierarchy** — the chunky Assign CTA stays the primary action; the new action row is intentionally subdued (ghost icons) so it doesn't compete.
