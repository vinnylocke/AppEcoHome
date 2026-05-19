# Phase 2 — Deferred Items Tracker

Running log of everything explicitly deferred from each Phase 2 wave. Items get removed as they ship.

Last updated after the **mop-up pass** that followed Wave 7.

---

## Mop-up pass (post Wave 7)

The mop-up sweep cleared:

- ✅ Focus traps on the high-traffic remaining modals — AddItemSheet, AddToListSheet, AutomationModal, ConnectDeviceWizard, DeviceDetailModal, DeviceSettingsModal, NewPlanForm, SpriteWizardModal. We're now at 27 modal containers with traps out of ~58.
- ✅ `PhotoUploader` client-side compression — 1600px longest-edge cap, JPEG re-encode at 0.85 quality, skipped for tiny / SVG / GIF inputs.
- ✅ Offline queue expanded — new kinds: `task-postpone`, `journal-add`, `ailment-link`. Wiring those new kinds into the relevant UI mutations is a follow-up; the queue infrastructure is ready.
- ✅ InstanceEditModal cover photo hero — when a user has pinned a cover via the Photos tab, it now appears as a top banner on the instance modal.
- ✅ Beta feedback self-history — `beta_feedback.admin_status` + `admin_response` columns, plus a "My Beta Feedback" section in Gardener Profile → Account showing status badges and any admin reply.
- ✅ Microclimate deep-link — a "Microclimate" chip on the Daily Brief footer navigates to `/garden-layout`, surfacing the existing in-editor report.
- ✅ Presence avatars on PlanStaging — Supabase Realtime Presence channel `plan:<id>`, avatar stack appears next to the plan title when other home members are viewing the same plan.

---

## Still deferred — Wave 1 (Accessibility)

### 1A. Blanket low-opacity text audit
- 256 occurrences of `text-rhozly-on-surface/20|/30|/40`. Bumping all would create visual regression.
- The **High Contrast toggle** in Gardener Profile is the escape hatch.
- **Revisit if:** specific contrast complaints come in. Then do a targeted per-component sweep.

### 1C. Focus traps on the remaining ~30 modals
- Lower-traffic surfaces: in-line confirm modals in OptimiseTab / ShoppingLists / TaskList / AilmentWatchlist, garden bottom sheets (BedTemplatesSheet, GardenZoneSheet, GardenNorthSheet), lightboxes (MultiImageGallery, DiagnosisImageGallery, PhotoTimelineTab lightbox, PlanReferencePhotos lightbox), HelpCenter drawer, CommunityGuideEditor, AreaDetails editor, LocationManager modals, CompanionPlantsTab modal, WikiImagePicker, PlantLightReader, BulkConfigModal (has hand-rolled trap), HomeDropdown (popover not modal).
- Pattern is fully documented — add `useFocusTrap` + `ref={trapRef}` + `role="dialog" aria-modal="true"` to each inner modal container. Knock these off opportunistically when touching the file for other reasons.

---

## Still deferred — Wave 3

### 3F. Weekly Optimise Digest delivery
- The toggle exists in Gardener Profile → Notifications, labelled "Coming soon".
- **What's still missing:** the cron edge function that aggregates each user's week and sends an email.
- **Blocker:** project has no transactional-email integration (no SendGrid / Resend / Postmark wiring). This needs scaffolding before the digest itself.

---

## Still deferred — Wave 5

### 5A. Plan Staging — Quick vs Full mode
- Autosave is already happening per-action.
- **Quick vs Full mode** (just-a-name-and-plants vs full phase form) deferred — would need plan creation flow rework. Revisit if new users report the full form is intimidating.

### 5B. Light Sensor multi-sample mode
- Shipped: band visual + expected-vs-measured comparison.
- **Deferred:** take 3–5 readings, average, save spread alongside the mean. Needs a new "sample" sub-flow + a `light_samples` table.

### 5C. Microclimate Report — deeper surfacing
- Shipped: print-to-PDF + a deep-link chip from the Daily Brief.
- **Deferred:** inline microclimate cards on plant-detail, area-detail, dashboard. Needs the layout-state (shapes + sun analysis + recent lux) to be lifted into a shared context so non-layout pages can read it.

### 5E. Visualiser snapshots + Layout integration
- **Fully deferred** — needs `visualiser_snapshots` table (camera pose + plant arrangement JSON), save/load UI, "Open in Layout" → convert visualiser scene to GardenLayoutEditor shapes. Substantial feature on its own.

---

## Still deferred — Wave 6

### 6B. Home Management — QR invite + member activity log
- **Fully deferred.** Needs `home_invite_tokens` (security review), a QR generator (~10KB lib), an accept-invite route, and a `home_activity_log` table with writes from every member-affecting action.
- Revisit when there's actual demand for multi-member homes.

### 6C. Integrations — cross-link + simplified wizard + demo mode
- **Fully deferred.** Surfacing device readings on Area chips, "Quick setup" wizard, mock-data demo mode. Substantial UI work.

### 6D. Shopping Lists — sharing
- Quantity field shipped; sharing deferred (depends on same invite-token infra as 6B).

### 6E. Admin Guide Generator — bulk + approvals
- Preview pane already shipped.
- **Deferred:** bulk-generate (queue table + cron worker), approvals workflow (`guide_drafts` table + status column on `guides`).

---

## Still deferred — Wave 7

### 7A. Optimistic UI sweep across remaining mutations
- Shipped: task completion + offline queue capturing `task-status` writes.
- **Deferred:** the same pattern across the other ~100 Supabase mutation sites. Closer to a multi-wave campaign than a one-shot. Revisit only when individual surfaces show user-visible lag.

### 7A. Conflict resolution toast
- **Fully deferred.** Depends on optimistic UI being everywhere first.

### 7B. Service-worker page caching for offline read
- **Fully deferred.** Caching plants / plans / tasks for offline reading needs a cache-first fetch handler keyed on Supabase REST URLs + schema-version cache busting. Best handled as its own pass paired with a clear cache-bust signal during deploys.

### 7B. Offline queue — wire new kinds into UI
- Queue infrastructure ready (`task-postpone`, `journal-add`, `ailment-link` shapes exist).
- **Deferred:** actually catching offline errors at the relevant call sites (PlantJournalTab, LinkAilmentModal, TaskModal postpone) and routing through `enqueueWrite`.

---

## Cannot honestly be done without dedicated infra/research

These all need scaffolding the project doesn't have, security review, or substantial UX work. Tagged separately so we don't keep deferring them in mop-up passes:

- **Weekly Optimise Digest** — needs transactional-email infra.
- **Visualiser snapshots** — own multi-day feature.
- **QR invite + member activity log** — needs security review of invite tokens.
- **Integrations wizard + demo mode** — needs UX research.
- **Service-worker page caching** — own wave with deploy-aware cache busting.
- **Full optimistic-UI sweep** — multi-wave campaign across ~100 sites.
- **Admin guide bulk-generate + approvals** — queue + workflow tables.
- **Shopping list sharing** — same token infra as QR invite.

---

## Process

When deferring an item:
1. Add it here with a one-liner on **why** and a **revisit if** trigger.
2. Mention it in the wave's commit message.
3. When it ships, remove the entry.
