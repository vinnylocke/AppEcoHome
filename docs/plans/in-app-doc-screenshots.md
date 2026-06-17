# In-App Documentation Screenshots

## Problem / Goal

The 21 in-app help docs in `documentation/01..21-*.md` contain **128 placeholder lines** of the
form:

```
> 📸 Screenshot: <description of what the shot should show>
```

These are surfaced through the Help Center drawer (`src/onboarding/HelpCenterDrawer.tsx`, which
loads the markdown via `src/onboarding/docs.ts` using Vite `?raw` imports). Right now the drawer
**strips** every `> 📸 Screenshot:` line at render time (`HelpCenterDrawer.tsx:335`), so users never
see an image — the slots are empty.

Goal: capture the appropriate screenshot for each slot by driving the real app, store the images so
they're served statically, replace each placeholder line with a markdown image reference, and update
the drawer to render images.

**Scope decision (confirmed with user):** start with a **pilot of one doc — `02-dashboard.md`
(10 shots)** — end-to-end (capture → store → render) so the look + storage approach can be reviewed
before grinding through the other 20 docs. This plan covers the full mechanism but only the Dashboard
doc will be executed before the next checkpoint.

**Other confirmed decisions:**
- **Account:** seeded test account `test1@rhozly.com` / `TestPassword123!` (verified working against
  the local dev server on `http://localhost:5173`; dashboard renders with full seed data).
- **Viewport:** follow each placeholder's hint — desktop width (1280×900) for shots that describe
  desktop-only panels/sidebars, mobile width (390×844) for the rest.

## App-reference files consulted

- `docs/app-reference/08-modals-and-overlays/24-help-center.md` — **drift found:** this file documents
  a *different* component (`AppHelpSearch.tsx`, the App Help search tab), not the markdown
  `HelpCenterDrawer.tsx` that actually renders the `documentation/*.md` docs. The doc-viewer drawer
  has no accurate reference. This plan will add an image-rendering note and flag the drift (see
  "App-reference updates" below).
- `docs/app-reference/02-dashboard/01-dashboard-tab.md` — the surface most of the pilot screenshots
  depict (weather widget, location cards, Today Focus / Week Ahead / Seasonal Picks, calendar,
  weather view, Garden Intelligence). Used to confirm component names + states match the captions.

## Source files that will change and why

| File | Change |
|------|--------|
| `documentation/02-dashboard.md` | Replace each of the 10 `> 📸 Screenshot:` lines with a markdown image `![<caption>](/doc-images/02-dashboard-NN-slug.png)`. Caption text is preserved as the alt text. |
| `src/onboarding/HelpCenterDrawer.tsx` | (a) Add an `img` renderer to the `ReactMarkdown` `components` map with consistent styling (rounded, bordered, full-width, subtle shadow, `my-4`, lazy-loaded, with the alt text shown as a small caption beneath). (b) Keep the existing `> 📸 Screenshot:` strip so *uncaptured* placeholders in the other 20 docs stay hidden until they're done. |
| `public/doc-images/` (new dir) | Store the captured PNGs. Vite serves `public/` at web root, so `/doc-images/x.png` resolves at runtime — required because `?raw` markdown is a static string and is **not** processed by Vite's asset pipeline (relative/imported paths would not resolve). |

## Image format & naming convention

**Format: WebP** (confirmed with user) — smaller than PNG for the same UI fidelity, used from the
start. Playwright captures PNG/JPEG only and no `sharp`/`cwebp`/ImageMagick is available, so —
**without adding any dependency** — conversion is done in the Chromium instance Playwright already
drives: capture a PNG buffer → draw it to an in-page `<canvas>` → `canvas.toDataURL('image/webp', 0.9)`
→ write the decoded bytes to `public/doc-images/*.webp`. All in one `browser_run_code_unsafe` call per
shot.

`/doc-images/{docNumber}-{docSlug}-{NN}-{shortdesc}.webp`
e.g. `02-dashboard-01-locations-overview.webp`, `02-dashboard-08-calendar-filter-panel.webp`.
NN is the placeholder's order within the file.

## Capture approach

1. Log in once with the seeded account; dismiss any onboarding coach-mark overlays before capturing.
2. For each placeholder:
   - Navigate to the right route / open the right modal / set the right state (the seed data already
     includes weather alerts, plans, tasks of every type, etc.).
   - Set the viewport per the caption's hint.
   - Capture either a **full-viewport** shot (for "the full Dashboard…" style captions) or an
     **element-targeted** shot (for "a single location card", "the weather alert banner", "the filter
     panel open" — tighter, cleaner crops).
   - Save to `public/doc-images/` with the convention above.
3. Replace the placeholder line in the markdown with the image reference.

### Pilot shot list — `02-dashboard.md` (10)

| # | Line | Caption (abbreviated) | Viewport | Capture |
|---|------|----------------------|----------|---------|
| 1 | 5 | Full Dashboard, Locations view, desktop | desktop | full viewport |
| 2 | 27 | Locations view: weather widget + cards | desktop | full/region |
| 3 | 43 | Weather alert banner | desktop | element |
| 4 | 49 | Single location card | mobile | element |
| 5 | 72 | Today Focus / Week Ahead / Seasonal Picks | mobile | region |
| 6 | 78 | Desktop right sidebar (AI card + task list) | desktop | element |
| 7 | 99 | Calendar view (month grid + agenda) | desktop | full viewport |
| 8 | 118 | Filter panel open | desktop | element |
| 9 | 145 | Weather view 7-day forecast | desktop | full/region |
| 10 | 162 | Garden Intelligence panel | desktop | region |

(Pull-to-refresh at line 177 has no `📸` placeholder — nothing to capture.)

## Tests (mandatory per CLAUDE.md)

- The only code change is the `img` renderer in `HelpCenterDrawer.tsx`. Add/extend a Playwright E2E
  spec that opens the Help Center → Docs → Dashboard article and asserts at least one `<img>` from
  `/doc-images/` renders (and that no raw `> 📸 Screenshot:` text leaks into the rendered output).
  Page object: whichever drives the Help Center drawer (or a new one if none exists).
- No `src/lib` or `_shared` logic changes, so no Vitest/Deno additions needed.

## Test documentation (mandatory per CLAUDE.md)

- Update the relevant `docs/e2e-test-plan/<NN>-*.md` surface file for the Help Center / docs drawer
  with the new image-render test row.

## App-reference updates (mandatory per CLAUDE.md)

- `docs/app-reference/08-modals-and-overlays/24-help-center.md`: correct the drift — note that the
  markdown doc viewer (`HelpCenterDrawer.tsx`) renders embedded images from `/doc-images/`, and that
  `> 📸 Screenshot:` callouts are stripped when no image is present yet. (Full rewrite of this file to
  cover the doc-viewer drawer vs the App Help search tab is out of scope for the pilot; flagged for a
  follow-up.)

## Risks / edge cases

- **Volume:** 128 shots total is heavy and several need specific states. Pilot-first de-risks this.
- **`?raw` static paths:** images must be referenced as absolute `/doc-images/...` URLs — confirmed
  above. Relative paths or Vite imports won't work from a raw string.
- **Repo size:** 128 images will add weight. Mitigated by using WebP from the start.
- **Onboarding overlays / transient toasts** must be dismissed before each capture to avoid polluting
  shots.
- **Mobile-only behaviours** (pull-to-refresh) can't be meaningfully screenshotted — skip (no slot).
- **Element-ref churn:** Playwright refs change between snapshots; re-snapshot immediately before each
  element capture.

## Pilot outcome (Dashboard doc)

- **Doc drift found & fixed (user approved "fix prose + screenshot"):** the live Dashboard has 4
  sub-tabs (Dashboard/Locations/Calendar/Weather), no standalone weather widget, and no desktop right
  sidebar — all of which the old doc described. `documentation/02-dashboard.md` was rewritten to match
  the live app before illustrating. Calendar dot colours were verified against
  `TaskCalendar.tsx` (`bg-blue/emerald/amber/purple/lime-400`).
- **11 WebP screenshots** captured from `test1@rhozly.com` and stored in `public/doc-images/`
  (`02-dashboard-01…11-*.webp`, ~360 KB total). Conversion used the project's bundled Playwright
  Chromium (canvas → `toDataURL('image/webp')`) — no new dependency.
- **Rendering:** `HelpCenterDrawer.tsx` gained an `img` renderer (rounded/bordered figure + caption);
  the `> 📸 Screenshot:` strip stays so un-illustrated docs are unaffected. Verified end-to-end in the
  running app (11/11 images load, 0 broken, no placeholder leakage).
- **Tests:** `tests/e2e/specs/help-center-docs.spec.ts` (HCD-001–003) — all passing.
- **Docs synced:** TESTING.md inventory, `docs/e2e-test-plan.md` + new `27-help-center-docs.md`,
  app-reference `24-help-center.md` drift note, `docs.ts` description.
- **Capture gotchas (for the remaining 20 docs):** the app scrolls in an inner container (not
  `window`) — use `element.scrollIntoView`/`scrollMarginTop`; the top nav is a fixed overlay — hide
  `header` before element/clip captures; sticky panels (`lg:sticky`) confuse element screenshots —
  disable with a temporary `position:static` style; AI-dependent cards (Seasonal Picks) error in the
  seed env, so caption around what actually renders.

## What happens after the pilot

Once you approve the Dashboard result, I repeat the same mechanism for the remaining 20 docs
(`01`, `03`–`21`), capturing the other ~118 shots and updating each markdown file + any per-surface
app-reference notes, in batches.
