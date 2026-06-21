# Help Center / App Help

> The App Help tab inside the Guides screen. Search-as-you-type over a bundled JSON of help articles about *using Rhozly*. Distinct from gardening guides — answers "how do I add a plant?", "where do I export data?", etc.

> ⚠️ **Drift note (partial):** the Role 1/Role 2 detail below documents `AppHelpSearch`. The
> **Help Center drawer** (`src/onboarding/HelpCenterDrawer.tsx`), opened from the left-nav **Help
> Center** item, is a *separate* surface with two tabs — **Guides** (onboarding flows) and
> **Documentation** (the bundled `documentation/*.md` reference). It has no full reference file yet;
> the doc-viewer behaviour is summarised under "Documentation drawer" immediately below. A full
> rewrite of this file to cover both surfaces is outstanding.

## Documentation drawer (`HelpCenterDrawer.tsx`)

The **Documentation** tab renders each `documentation/NN-*.md` file via `react-markdown` (custom
component map for headings, tables, links between docs, and **images**). Docs are imported as raw
strings (`?raw`) through `src/onboarding/docs.ts`.

- **Embedded screenshots:** docs may embed images as standard markdown (`![alt](/doc-images/x.webp)`).
  The `img` renderer wraps them in a rounded/bordered `<figure data-testid="doc-image">` with the alt
  text shown as a caption. Images are **WebP** served statically from `public/doc-images/` (referenced
  by absolute `/doc-images/...` URLs because `?raw` markdown bypasses Vite's asset pipeline). Naming:
  `{docNumber}-{docSlug}-{NN}-{shortdesc}.webp`. Captured with `node scripts/docshots-to-webp.mjs`
  (PNG → WebP via bundled Playwright Chromium; no extra dependency).
- **Click-to-expand lightbox:** each image is wrapped in a `doc-image-trigger` button; clicking opens
  a full-screen overlay (`doc-image-lightbox`) **portaled to `document.body`** — required because the
  drawer's animated ancestor has a `transform`, which would otherwise trap a `position: fixed`
  overlay inside the 420 px drawer. Closes via backdrop click, the close button, or **Esc**.
- **Screenshot placeholders:** lines of the form `> 📸 Screenshot: <description>` mark slots not yet
  illustrated. They are **stripped at render time** so they never reach the reader. As a doc is
  illustrated, each callout is replaced with its `![alt](/doc-images/…webp)` image.
- **Tab/row selectors:** `help-tab-guides`, `help-tab-docs`, `help-doc-row-<docId>`.
- **Content Feedback control:** the documentation reading view renders `<ContentFeedback>` ("Was this doc helpful?", surface `documentation`, target = doc id + title); the Guides/tours footer renders a second control ("Are these guides helpful?", surface `onboarding-flow`). Both write to `content_feedback` (distinct from the AI `ai_feedback` learning signal); 👎 reveals an optional "what's wrong / inaccurate" box.
- E2E coverage: `tests/e2e/specs/help-center-docs.spec.ts` (HCD-001–003).

**Source files:**
- `src/components/AppHelpSearch.tsx` — App Help search UI (this file's Role 1/2 below)
- `src/onboarding/HelpCenterDrawer.tsx` — the Guides + Documentation drawer (markdown doc viewer)
- `src/onboarding/docs.ts` — registry of the bundled `documentation/*.md` files
- Bundled help articles JSON (likely `src/constants/helpArticles.ts` or similar)

---

## Quick Summary

Type a query → fuzzy filter against the bundled help articles → inline answer card. Each article has a title, body (markdown), and tag list. No network fetch — bundled with the client. Each answer also renders the reusable `<ContentFeedback>` 👍/👎 ("Did this answer your question?", surface `app-help`, target = the question) → writes to `content_feedback`; 👎 reveals an optional "what's wrong / inaccurate" box.

---

## Role 1 — Technical Reference

### Component graph

```
AppHelpSearch
├── Search input
├── Filtered article list
│   └── Article card → expandable answer
└── Empty state ("No matches — try Contact Support")
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| Inherited from parent | | |

### Data flow

- Static JSON loaded at build time.
- Fuzzy filter client-side (simple includes / substring match).

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| No matches | "No matches — Contact Support" link |

### Performance

- Pure render.
- Search runs on every keystroke (string array).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

For questions about *using Rhozly* — not about gardening. "How do I share my home with my partner?" "Where do I see release notes?" — these belong here.

### Every flow on this tab

#### 1. Type a question

- Live results as you type.

#### 2. Expand an article

- Tap card → inline expand.

#### 3. Still stuck

- Bottom CTA → Contact Support modal.

#### 4. Rate the answer

- Each answer ends with a 👍/👎 ("Did this answer your question?"). Tap 👎 to add a one-line note about what's wrong or inaccurate — the same control appears on documentation pages and the guided-tour list.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Confusing App Help with Guides.** Guides = gardening; App Help = using Rhozly.

### Recommended workflows

- **First port of call when stuck:** check here before emailing.

### What to do if something looks wrong

- **Out-of-date answer:** the bundled JSON didn't update. File a bug.

---

## Related reference files

- [Guides List](../05-tools/07-guides-list.md)
- [Contact Support Modal](./18-contact-support.md)

## Code references for ongoing maintenance

- `src/components/AppHelpSearch.tsx` — App Help answers (surface `app-help`)
- `src/onboarding/HelpCenterDrawer.tsx` — documentation view (surface `documentation`) + tours footer (surface `onboarding-flow`)
- `src/components/feedback/ContentFeedback.tsx` — reusable 👍/👎 + comment control (writes `content_feedback`)
- `supabase/migrations/20260817000000_content_feedback.sql` — `content_feedback` table + RLS
- Bundled help JSON constant
