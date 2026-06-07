# Plan — Lightbox shows image_credit; Shed tile labels uncovered

Two paired fixes from a user report.

## Issue 1 — Lightbox doesn't surface `image_credit`

[`DiagnosisImageGallery.LightboxAttribution`](../../src/components/DiagnosisImageGallery.tsx#L43-L97) only renders legacy per-source fields:

- `image.source === "unsplash" && image.photographer_name` → photographer line
- `image.source === "wikipedia" && image.wiki_page` → Wikipedia link
- `image.source === "pixabay" && image.pixabay_page` → Pixabay link
- Otherwise returns `null`

The Wave 22.0002 `image_credit` shape carries everything the popover needs (provider, attribution, licence name + URL, source URL). We just don't read it here. Plant heroes (which only carry `image_credit`, no legacy fields) therefore show no overlay at all.

### Fix

Extend `LightboxAttribution` so the legacy branches stay (they're still used by historical gallery fetches), but when the legacy branches don't match it falls back to the unified `image_credit`. Render a compact white-on-dark line: provider label, attribution, licence link, source link.

```tsx
function LightboxAttribution({ image }: { image: GalleryImage }) {
  // Legacy per-source branches (unchanged) ...

  // Wave 22.0007 — fall back to the unified image_credit shape.
  const credit = coerceImageCredit(image.image_credit);
  if (!isKnownCredit(credit)) return null;
  return (
    <div className="text-xs text-white/75 flex flex-wrap items-center gap-x-2">
      <span className="font-bold">via {PROVIDER_LABEL[credit.provider]}</span>
      {credit.attribution && <span>· {credit.attribution}</span>}
      {credit.license_name && credit.license_url && (
        <a href={credit.license_url} target="_blank" rel="noopener noreferrer"
           className="underline hover:text-white" onClick={(e) => e.stopPropagation()}>
          {credit.license_name}
        </a>
      )}
      {credit.source_url && (
        <a href={credit.source_url} target="_blank" rel="noopener noreferrer"
           className="underline hover:text-white inline-flex items-center gap-1"
           onClick={(e) => e.stopPropagation()}>
          <ExternalLink size={10} /> View original
        </a>
      )}
    </div>
  );
}
```

When even `image_credit` is null (old data with no provenance), we render `via Unknown source — see Credits` linking to `/credits`. That keeps the "tap to learn the source" promise honest even when we genuinely don't know.

## Issue 2 — Shed photo labels collide

`MultiImageGallery` button defaults to `absolute bottom-3 right-3` ([line 161](../../src/components/MultiImageGallery.tsx#L161)). The Shed tile source label (`Perenual / Verdantly / AI / Manual`) sits at the **same coordinates** ([TheShed.tsx:1791](../../src/components/TheShed.tsx#L1791)). One covers the other.

### Fix

In [`TheShed.tsx`](../../src/components/TheShed.tsx), move the source label from `absolute bottom-3 right-3` → `absolute top-3 left-3`. Top-left is currently empty (action buttons live top-right; updated chip + photos button keep the bottom row). All four corners get unambiguous ownership:

| Corner | Owner |
|--------|-------|
| Top-left | Source label (Perenual / AI / Manual) — moved here |
| Top-right | Action buttons row (Layout / Light / Ask AI / Archive / Delete) |
| Bottom-left | UpdatedChip (conditional — only when AI freshness has a pending update) |
| Bottom-right | `MultiImageGallery` "Photos" trigger |

The source label keeps its pill styling (white frosted background, provider tint). No change to the button styling itself.

## Files modified

| File | Change |
|------|--------|
| [`src/components/DiagnosisImageGallery.tsx`](../../src/components/DiagnosisImageGallery.tsx) | Extend `LightboxAttribution` to render `image_credit`; fall back to umbrella `/credits` link for unknown |
| [`src/components/TheShed.tsx`](../../src/components/TheShed.tsx) | Move source label from `bottom-3 right-3` → `top-3 left-3` |

## Tests

Visual only — no new units required.

## Deploy

Frontend-only. Minor bump → **22.0007**.

## Risks

- **Lightbox attribution height**: the fallback line is one row of small text, fits in the existing 24px overlay area.
- **Shed top-left** position is currently empty — no other element will be displaced.
- **Backwards compatibility**: the legacy branches stay intact, so the diagnosis-flow MultiImageGallery from `plant-image-search` (which populates `photographer_name` etc.) still renders the existing rich attribution.
