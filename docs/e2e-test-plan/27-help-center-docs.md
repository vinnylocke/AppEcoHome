# 27. Help Center — Documentation drawer

**Spec file:** `tests/e2e/specs/help-center-docs.spec.ts`
**Page Object:** — (driven inline via `data-testid` selectors)
**Seed dependencies:** none (docs are bundled markdown; images are static assets)
**App-reference:** [08-modals-and-overlays/24-help-center.md](../app-reference/08-modals-and-overlays/24-help-center.md)

The Help Center drawer (`src/onboarding/HelpCenterDrawer.tsx`) is opened from the **Help Center**
nav item. Its **Documentation** tab renders the bundled markdown docs from `documentation/*.md`. The
Dashboard doc (`documentation/02-dashboard.md`) embeds WebP screenshots served from
`public/doc-images/`. The `> 📸 Screenshot:` callout lines that mark un-illustrated slots are stripped
at render time, so they never reach the reader.

Key selectors: `help-tab-guides`, `help-tab-docs`, `help-doc-row-<docId>`, and each rendered image is
wrapped in `figure[data-testid="doc-image"]`.

## Documentation drawer

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| HCD-001 | ✅ | Open Help Center → Documentation tab → Dashboard doc → reader shows the `Dashboard` H1 | — | ✅ Passing |
| HCD-002 | ✅ | Dashboard doc embeds `/doc-images/02-dashboard-*.webp` screenshots that actually load (`naturalWidth > 0`, not broken) | — | ✅ Passing |
| HCD-003 | ✅ | Raw `📸 Screenshot:` placeholder callouts are stripped — never shown in the reader | — | ✅ Passing |
| HCD-004 | ✅ | Clicking a doc screenshot (`doc-image-trigger`) opens the full-screen lightbox; **Esc** closes it | — | ✅ Passing |
| HCD-005 | ✅ | Lightbox close button (`doc-image-lightbox-close`) dismisses the expanded image | — | ✅ Passing |

## Notes

- Image rendering is handled by the `img` component in `HelpCenterDrawer`'s `ReactMarkdown`
  `components` map — rounded/bordered figure with the alt text shown as a caption.
- Screenshots are captured from the seeded `test1@rhozly.com` account and stored as WebP under
  `public/doc-images/`, named `{docNumber}-{docSlug}-{NN}-{shortdesc}.webp`.
- As further docs are illustrated, add the new `/doc-images/*` assets and keep HCD-002 representative
  (it asserts on the Dashboard doc's first image).
