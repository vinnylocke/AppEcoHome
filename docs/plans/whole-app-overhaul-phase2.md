# Plan — Whole-App Overhaul, Phase 2 (Deferred Enhancements)

## Context

The original [whole-app-overhaul.md](./whole-app-overhaul.md) shipped 12 waves between sessions. To keep each wave deployable in 1–2 days, ~28 items from the original spec were deferred. This document gathers them, groups them into 7 follow-up waves ordered by impact-to-effort, and re-states acceptance criteria for each.

Same rules as the original plan:
- One wave at a time, deploy after each
- `npx tsc --noEmit` clean before deploying
- Re-rate affected areas in the original plan's score table after the wave lands
- User reviews each wave before implementation begins

---

## Tiering

| Tier | Wave | Why ship now |
|------|------|--------------|
| **A** | 1 — Accessibility completion | Cheapest. Finishes Wave 11 properly. Removes the WCAG gap that blocks public launch. |
| **A** | 2 — Photos everywhere | Single-theme. Big visible win. Several downstream features depend on the upload primitive. |
| **B** | 3 — Task & calendar polish | Daily-driver feature. Week view + drag-reschedule materially changes garden planning. |
| **B** | 4 — Plant Doctor & Watchlist depth | Doctor is the headline feature; history + save-to-journal unblocks repeat use. |
| **C** | 5 — Planning & insights polish | Quality-of-life across Plan Staging, Light Sensor, Microclimate, Visualiser, AI card. |
| **C** | 6 — Account, home & admin | Trust & retention layer — export data, QR invite, integrations polish, admin tooling. |
| **D** | 7 — Reliability & realtime | Most expensive, lowest immediate visibility. Optimistic UI + PWA cache + write queue. |

---

## Wave 1 — Accessibility Completion (~1 day)

*Finishes the work started in Wave 11. Wave 11 only shipped focus-visible + reduced-motion; the audit pass and toggles were deferred.*

### 1A. Contrast & sizing audit pass
- Sweep every `text-rhozly-on-surface/40` / `/30` / `/20` for ≥ 4.5:1 contrast against its background. Adjust opacity floors where needed.
- Minimum 12px for any badge or chip; ≥ 44×44 effective hit area for every tap target on mobile.
- Tooling: scan utility classes in `src/components/**` with grep; visit `/audit` page in browser to spot-check.

### 1B. High-contrast toggle
- Setting in Gardener Profile → Notifications panel (rename to "Preferences" if needed) — toggle "High contrast".
- LS-backed flag `rhozly_high_contrast`. Adds a `.high-contrast` class on `<html>` that overrides `--color-rhozly-on-surface/*` opacities to solid tones in `src/index.css`.

### 1C. Focus traps on all modals
- Audit every `fixed inset-0` container in `src/components/`. Wrap each in a `<FocusTrap>` (small utility — install `focus-trap-react` or write a 30-line hook).
- On open: focus the modal's first focusable element. On close: restore focus to the trigger.

### 1D. Screen-reader labels on icon-only buttons
- Sweep `src/components/` for `<button>` containing only an icon child. Add `aria-label`.
- Particular focus: GardenLayout toolbar, Shed card actions, Plant Doctor action buttons, header icon row.

**Files:** `src/index.css`, `src/components/GardenerProfile.tsx`, every modal component, new `src/hooks/useFocusTrap.ts`.

---

## Wave 2 — Photos Everywhere (~2 days)

*Currently photos are concentrated in Plant Edit Modal + Plant Doctor. The platform should treat photos as a first-class primitive everywhere.*

### 2A. Unified photo upload component
- New `src/components/PhotoUploader.tsx` — handles file input, camera capture (Capacitor), drag-and-drop, paste, Supabase Storage upload, optimistic preview.
- Replaces existing one-off uploaders in Plant Edit, Plant Doctor, Garden Layout shape photos.

### 2B. Upload-everywhere surfaces
- Tasks: attach a photo when marking complete (proof-of-work / progress log).
- Ailments: attach a photo when adding a Watchlist entry.
- Plans: attach reference photos on plans (mood-board feel).
- Notes: photo support in plan notes.

### 2C. Photo timeline per plant
- New tab in Plant Edit Modal: "Photo Timeline" — chronological grid of every photo attached to this plant (across journal entries, doctor diagnoses, shape photos, task completions).
- Each photo card shows: thumb, date, source (journal / doctor / task / shape), one-tap "open in context" link.

### 2D. Photo annotations (Plant Doctor)
- After upload, before submit: small canvas overlay lets user circle/arrow the affected area.
- Stores annotation as a sibling JSON record (`photo_annotations` table) — doesn't bake into the image.

### 2E. AI "best photo" suggestion
- When multiple photos exist for a plant, an edge function picks the most useful one (sharpest, most plant area, best lighting) for the card thumbnail.

**Files:** `src/components/PhotoUploader.tsx` (new), `src/components/PlantEditModal.tsx`, `src/components/PlantDoctor.tsx`, `src/components/AilmentWatchlist.tsx`, `src/components/TaskList.tsx`, new migration for `photo_annotations` table.

---

## Wave 3 — Task & Calendar Polish (~2 days)

### 3A. Task Calendar week view
- Toggle in `TaskCalendar.tsx` header: Month / **Week**. Week view shows 7 days × hour rows (or task chips per day).
- Persist last-used view in localStorage.

### 3B. Drag-reschedule
- Each task chip on Calendar is draggable. Drop on another day → updates `tasks.due_date`. Optimistic UI; rollback on failure.
- Uses `@dnd-kit/core` (already in bundle from PlannerHub if recall is right; otherwise add it).

### 3C. ICS export
- "Export to Calendar" button on Calendar view → generates a `.ics` blob with all upcoming tasks (next 90 days).
- Standard VEVENT format; one-shot, not subscribe-able (subscribe would need a public URL infrastructure — defer).

### 3D. Blueprint Manager: pause-for-week + conflict detection
- Per-blueprint "Pause" dropdown: 1 week / 2 weeks / until DATE / resume now.
- Conflict detector: when adding a new blueprint, warn if its cadence clashes with an existing one on the same area/plant.

### 3E. Add Task Modal: generate-from-photo
- "Take a photo" button in AddTaskModal → uploads to a new edge function `generate-task-from-photo` that uses Gemini Vision to draft a task description, type, and frequency from the photo (e.g., overgrown shrub → "Prune lavender hedge", Pruning, every 21 days).

### 3F. Optimise Tab: whole-garden mode + weekly digest
- New toggle in OptimiseTab: "Single area" / "Whole garden". Whole-garden mode aggregates all areas into a single proposal set.
- Weekly digest opt-in: email summary every Sunday of completed / overdue / proposed tasks. Lives in Gardener Profile → Notifications.

**Files:** `src/components/TaskCalendar.tsx`, `src/components/BlueprintManager.tsx`, `src/components/AddTaskModal.tsx`, `src/components/OptimiseTab.tsx`, new `supabase/functions/generate-task-from-photo/`.

---

## Wave 4 — Plant Doctor & Watchlist Depth (~1.5 days)

### 4A. Plant Doctor: diagnosis history tab
- New tab on PlantDoctor: "History" — every past diagnosis (with image, date, diagnosis, treatment outcome).
- Filter by plant.

### 4B. Save-to-journal as the default
- After a diagnosis, the "Save to My Shed" button auto-creates a journal entry on the linked plant if one is selected (currently a separate step).

### 4C. Plant Doctor Chat: more entry points
- Watchlist card → "Ask Rhozly AI" button opens chat scoped to that ailment.
- Shed plant card → "Quick chat about this plant" entry.
- Dashboard → "Got a plant question?" prompt on Daily Brief (rotating CTA).

### 4D. Add plant flow: unified search across providers
- Current PlantSourcePicker hops between Manual / Perenual / Verdantly / AI / Doctor.
- Unify into one search bar that returns mixed results grouped by source — Perenual cards, Verdantly cards, AI suggestions all in one list.
- Powered by an edge function `plant-search-unified` that fans out to all providers in parallel.

**Files:** `src/components/PlantDoctor.tsx`, `src/components/PlantDoctorChat.tsx`, `src/components/AilmentWatchlist.tsx`, `src/components/PlantSourcePicker.tsx`, new `supabase/functions/plant-search-unified/`.

---

## Wave 5 — Planning & Insights Polish (~1.5 days)

### 5A. Plan Staging: autosave + Quick vs Full mode
- Plan staging form currently requires manual save. Add 2s debounced autosave → `plans.draft_state` jsonb column.
- New mode toggle: **Quick** (just name + plants) vs **Full** (current full form with tasks, supplies, notes).

### 5B. Light Sensor depth
- Band visual: replace numeric lux with a coloured band showing "Deep shade · Shade · Part-shade · Sun · Full sun" gradient with marker.
- Multi-sample mode: take 3–5 readings spaced apart, average them, save the spread as well as the mean.
- Expected-vs-measured: when measuring an area with an assigned plant, show "Lavender prefers ≥ 50,000 lux — your reading: 18,000 ⚠".

### 5C. Microclimate Report: PDF + surface in more places
- Existing report only opens from one place. Add report links in: dashboard climate strip, plant-detail page, area-detail page.
- "Export PDF" button on the report — client-side generation via `jsPDF`.

### 5D. AI Assistant Card: contextual placement + reactive insights
- Currently shows on dashboard only. Add an AssistantCard slot to: PlannerHub, GardenHub, Shed plant detail.
- Each surface filters insights to its context ("about your plans" / "about your shed" / "about this plant").
- New: insights react to user state — overdue tasks → "You have 4 overdue — want me to suggest which to do first?"

### 5E. Visualiser: save snapshot + Layout integration
- "Save this view" button in Visualiser → stores camera pose + plant arrangement as a `visualiser_snapshots` row. Re-open later.
- "Open in Layout" button — opens current visualiser scene as a 2D layout in GardenLayoutEditor.

### 5F. Guides: bookmarks
- Star icon on every guide. Bookmarked guides pinned to the top of the user's Guides list.
- LS or Supabase row (`guide_bookmarks` table) — prefer the latter for cross-device sync.

**Files:** `src/components/PlannerHub.tsx`, `src/components/LightSensor.tsx`, `src/components/MicroclimateReport.tsx` (or existing equivalent), `src/components/AssistantCard.tsx`, `src/components/PlantVisualiser.tsx`, `src/components/GuideList.tsx`, new migrations for `visualiser_snapshots` + `guide_bookmarks`.

---

## Wave 6 — Account, Home & Admin (~2 days)

### 6A. Gardener Profile: avatar + export-data
- Avatar upload (uses Wave 2 PhotoUploader).
- "Export my data" button → edge function `export-user-data` zips up all user-owned rows as JSON + media as a downloadable archive. GDPR-aligned.

### 6B. Home Management: QR invite + member activity
- QR code on the home members page — scanning it on a new device joins the home automatically (encodes a short-lived invite token).
- "Activity" tab on Home Management: last 30 days of member actions (added plant / completed task / etc.).

### 6C. Integrations: cross-link + simplified wizard + demo mode
- Each device's data (lux, moisture, valve state) surfaces on the relevant Area's metrics chip.
- New "Quick setup" wizard — fewer steps for ewelink / ecowitt with sensible defaults.
- Demo mode: a flag that fakes a connected device with mock data, so users can preview the feature before buying hardware.

### 6D. Shopping Lists: sharing + quantity field
- "Share list" button → generates a public read-only link (or shares to another home member with edit rights).
- Quantity field on each shopping list item (currently checkbox only).

### 6E. Admin Guide Generator: preview + bulk + approvals
- Preview pane next to the generation form (markdown rendering of current draft).
- "Bulk generate" — paste a list of topics, generate one guide per topic queued.
- Approvals workflow: drafts → admin review → published.

### 6F. Beta Feedback: user self-history + Release Notes: try-it-now links
- New "My Feedback" tab in Beta Feedback area (or Gardener Profile) — list of all feedback this user has submitted, with status (open / acknowledged / resolved).
- Release Notes entries can include a `{ link: { label, path } }` field — rendered as "Try it →" CTA on each line.

### 6G. Audit Page: PDF export
- Adds a sibling button to the existing CSV export. Same data, jsPDF-rendered with table styling.

**Files:** `src/components/GardenerProfile.tsx`, `src/components/HomeManagement.tsx`, `src/components/integrations/IntegrationsPage.tsx`, `src/components/ShoppingLists.tsx`, `src/components/AdminGuideGenerator.tsx`, `src/components/BetaFeedbackBanner.tsx`, `src/components/ReleaseNotesModal.tsx`, `src/components/AuditPage.tsx`, new `supabase/functions/export-user-data/`, new migrations for `home_invite_tokens`, `home_activity_log`, `guide_drafts`.

---

## Wave 7 — Reliability & Realtime (~2 days)

### 7A. Realtime: optimistic UI + conflict resolution + presence
- Wrap every Supabase write in an optimistic update pattern (currently mostly write-then-refresh).
- Conflict resolution: when a realtime event arrives that contradicts an optimistic write, show a non-blocking toast "Someone else updated this — refresh?".
- Presence: tiny avatar stack on Plan / Area / Plant detail pages showing who else is viewing the same record right now.

### 7B. PWA: cached browsing + write queue
- Service worker caches the last-loaded version of plants, plans, tasks for offline read.
- Write queue: completing a task / editing a plant while offline → action queued in IndexedDB → flushed when online with toast confirmation.

### 7C. Refresh: pull-to-refresh on every page
- Currently only dashboard wraps in `PullToRefresh`. Apply it (or an equivalent header refresh button) to Shed, Planner, Tools, Calendar, Watchlist, Guides.

**Files:** `src/hooks/useRealtimeWrite.ts` (new), every component with Supabase mutations, `src/lib/clientCache.ts`, `public/sw.js` (if applicable), `src/components/PullToRefresh.tsx` (extend), every top-level page component.

---

## Risks & Caveats

- **Wave 2 (photos) gates Wave 6A (avatar)** — must ship Wave 2 first or do the avatar uploader inline.
- **Wave 7 is the most invasive** — touches every mutation. Could split into 7a (optimistic UI) and 7b (PWA cache + queue) if scope balloons.
- **Realtime presence (7A)** needs new RLS policies on a `presence` channel — non-trivial.
- **Microclimate PDF (5C)** and **Audit PDF (6G)** both pull in `jsPDF` — ~50 KB bundle hit. Lazy-load the export buttons.
- **Demo mode for Integrations (6C)** must not be visible to non-beta users — gate behind `profile.is_beta`.
- **QR invite (6B)** needs a short-lived signed-token table — security review before shipping.

## Process

1. Confirm wave order (user can re-prioritise).
2. Implement Wave 1 → typecheck → deploy → re-score Accessibility (target 95).
3. Continue Waves 2 → 7 in same pattern.
4. After all 7: re-rate every affected area in [whole-app-overhaul.md § Score Summary](./whole-app-overhaul.md#score-summary). Goal: every line ≥ 90.

---

## Cross-references

- Original audit: [whole-app-overhaul.md](./whole-app-overhaul.md)
- Most recent bugfix from Phase 1 finish: [dashboard-subtab-navigation-bug.md](./dashboard-subtab-navigation-bug.md)
