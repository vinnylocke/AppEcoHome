# Plan — click-to-enlarge the Plan Staging cover image

## Goal

When you accept an Overhaul concept the chosen render is promoted to `plan.cover_image_url` and shown as a 256px-tall banner at the top of the Plan Staging view ([PlanStaging.tsx:983-992](src/components/PlanStaging.tsx#L983-L992)). Right now that image is just decorative — tapping it does nothing. You want a tap to open it full-screen so you can actually see the detail in the AI render.

## What I found

- The image renders at [PlanStaging.tsx:984-989](src/components/PlanStaging.tsx#L984-L989) inside a non-interactive `<img>`.
- A reusable lightbox already exists: `Lightbox` exported from [DiagnosisImageGallery.tsx:263](src/components/DiagnosisImageGallery.tsx#L263) — keyboard-navigable (Esc / ←/→), focus-trapped, accepts `images: GalleryImage[]` + `startIndex` + `onClose`. It's already used by `MultiImageGallery` and `PhotoTimelineTab`, so the visual language is consistent.
- The Plan Staging header has a "Back" button at top-left and the title overlaid on a black gradient. Wrapping the `<img>` in a `<button>` is straightforward without affecting that layout.
- The image at the banner uses an optimisation URL (`?width=800&quality=80&format=webp`). For the lightbox we want the original `localCoverImage` (not the 800px-downsized one) so users see the full render.

## Files I'll change

| File | Change |
|---|---|
| [`src/components/PlanStaging.tsx`](src/components/PlanStaging.tsx) | Wrap the cover `<img>` in a button-style element, add `lightboxOpen` state, render `<Lightbox>` when open. Use the original (non-optimised) `localCoverImage` for the lightbox source. |

That's it — one file. The lightbox component is reusable as-is.

## The fix, concretely

1. Add state: `const [lightboxOpen, setLightboxOpen] = useState(false);`
2. Wrap the existing `<img>` with a `<button>` (clean tab order + Enter/Space handling, keeps the cursor pointer + zoom-in icon overlay on hover so the affordance is visible).
3. The button calls `setLightboxOpen(true)`; rendering only fires when `localCoverImage` is non-null (otherwise the placeholder coloured div stays non-interactive, since there's nothing to enlarge).
4. Render `<Lightbox images={[{ src: localCoverImage, alt: "Plan cover" }]} startIndex={0} onClose={() => setLightboxOpen(false)} />` outside the header DOM so it portals over everything.
5. Add a subtle "tap to enlarge" hint icon (`Maximize2` or `ZoomIn` from lucide-react) in the top-right corner of the banner, visible on hover/focus, so the affordance is discoverable without cluttering the design.

## What this does NOT do

- Doesn't change the plan-card preview in the Planner list ([PlannerDashboard.tsx:494](src/components/PlannerDashboard.tsx#L494)) — that's already clickable to open Plan Staging, which is where this fix lives.
- Doesn't add a separate "edit cover image" flow.
- Doesn't change the optimised banner src — we keep the 800px-webp for the page banner (fast initial paint); the lightbox loads the original.

## Risks

- **`GalleryImage` shape check**: the Lightbox expects `{ src, alt, credit? }`. I'll confirm the exact interface and feed only the fields it needs.
- **Banner click on the Back button**: the Back button at top-left sits ON TOP of the image. Wrapping the image in a button could intercept its click. I'll keep the Back button outside the image-button (it's already absolutely positioned with `z-10`, so this is just a matter of stopping the click bubbling on the back-button or having both as siblings with the back-button winning via z-index).

## Acceptance

- Clicking the cover image opens a fullscreen lightbox.
- Esc / clicking outside closes it.
- No regression on the Back button.
- `tsc --noEmit` clean.

---

Reply "go ahead" and I'll implement. Small one — should take one round of edits + a build check.
