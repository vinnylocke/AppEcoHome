# Phase 2 — Deferred Items Tracker

Running log of everything explicitly deferred from each Phase 2 wave, so nothing slips when we mop up at the end. Items are removed from this file as they ship.

Last updated after **Wave 7** deploy.

---

## Wave 1 — Accessibility

### 1A. Blanket low-opacity text audit
- **Skipped intentionally** — 256 occurrences of `text-rhozly-on-surface/20|/30|/40`. Bumping all would create visual regression across the app. The **High Contrast toggle (1B)** is the escape hatch for users who need readable secondary text.
- **Revisit if:** users actually report contrast complaints in the wild, or we onboard a low-vision tester. At that point do a targeted sweep per-component, not a global bump.

### 1C. Focus traps on remaining modals
- Wave 1 shipped focus traps on **13 high-traffic modals** (+ 5 that already had hand-rolled traps). That leaves ~40 modals without traps.
- Pattern is documented: `useFocusTrap<HTMLDivElement>(isOpen)` + `ref={trapRef}` on the inner modal container + `role="dialog" aria-modal="true"`.
- **Revisit:** apply incrementally as those modals are touched for other reasons, or do a sweep at the end.

---

## Wave 2 — Photos Everywhere

### 2E. AI "best photo" selector
- **Replaced** by Pass 3's pragmatic *"Set as plant cover"* feature — a star button on each Photo Timeline image promotes it to `inventory_items.cover_image_url`. Solves the same practical use case without an edge function.
- **True AI version deferred:** Gemini Vision endpoint that auto-ranks photos by clarity / framing / plant area coverage. Likely not worth the bundle / quota cost unless users specifically ask.

---

## Wave 3 — Task & Calendar Polish

### 3F. Weekly Optimise Digest — actual delivery
- The **toggle** exists in Gardener Profile → Notifications, labelled "Coming soon".
- **What's missing:** the cron edge function that aggregates each user's week and sends an email.
- **Revisit:** when we have a transactional-email integration story (currently no SendGrid/Resend wiring). Could ship in Wave 7 if we're already adding infra there.

---

## Wave 5 — Planning & Insights Polish

### 5A. Plan Staging autosave + Quick vs Full mode
- Autosave is **already happening** via `saveStagingState` on each action — no debounced 2s save needed.
- **Quick vs Full mode** (just-a-name-and-plants vs the full phase-by-phase form) deferred — would need plan creation flow rework. Revisit if new users report the full form is intimidating.

### 5B. Light Sensor multi-sample mode
- Shipped: band visual + expected-vs-measured comparison.
- **Deferred:** taking 3–5 readings spaced apart, averaging, saving the spread alongside the mean. Needs a new "sample" sub-flow + a `light_samples` table.

### 5C. Microclimate Report surfaced in more places
- Shipped: print-to-PDF on the existing modal.
- **Deferred:** report links on Dashboard climate strip, plant-detail, area-detail. Tricky because the report needs `shapes` + `sunAnalysisResults` + `recentLuxByArea` — currently only available inside GardenLayoutEditor. Revisit when there's a shared garden-state context.

### 5E. Visualiser snapshots + Layout integration
- **Fully deferred.** Needs: `visualiser_snapshots` table (camera pose + plant arrangement JSON), save/load UI, "Open in Layout" → convert visualiser scene to GardenLayoutEditor shapes.
- Substantial feature on its own — best shipped as its own wave / pass with care, not bolted onto Wave 5.

---

## Wave 6 — Account, Home & Admin

### 6B. Home Management — QR invite + member activity log
- **Fully deferred.** Needs:
  - A `home_invite_tokens` table with short-lived signed tokens (security review).
  - A QR generator on the client (we'd need to add `qrcode` lib — ~10KB).
  - An "accept invite" route that swaps a token for membership.
  - An `home_activity_log` table for the activity tab + writes from every member-affecting action.
- **Revisit when:** there's actual demand for multi-member homes — currently most users are single-member.

### 6C. Integrations — cross-link + simplified wizard + demo mode
- **Fully deferred.** Substantial UI work on top of existing integrations flow:
  - Surfacing device readings inline on Area metrics chips (touches LocationManager + IntegrationsPage).
  - Stripped-down "Quick setup" wizard for ewelink / ecowitt — needs UX research.
  - Demo mode with mock device data, gated by `profile.is_beta`.
- **Revisit when:** beta users explicitly ask for hardware integration improvements, or when we onboard new integrations partners.

### 6D. Shopping Lists — sharing
- Shipped: quantity field.
- **Deferred:** "Share list" → public read-only link or per-member edit grant. Needs short-lived signed tokens (similar to 6B) and a share-target UI.

### 6E. Admin Guide Generator — bulk + approvals
- Shipped: preview pane (was already in place).
- **Deferred:**
  - Bulk-generate: paste a list of topics → queue one guide per topic. Needs a queue table + cron worker.
  - Approvals workflow: draft → admin review → published. Needs `guide_drafts` table + status column on `guides`.

### 6F. Beta Feedback — user self-history
- Shipped: release-notes try-it-now links.
- **Deferred:** "My Feedback" list — every feedback the user has submitted with admin status (open / acknowledged / resolved). Needs an `admin_status` column on `beta_feedback` + a view.

---

## Wave 7 — Reliability & Realtime

### 7A. Optimistic UI sweep
- Shipped: optimistic UI on **task completion** + an offline write queue that captures task-status writes when the network fails.
- **Deferred:** the same pattern across every other Supabase mutation (~100 sites). Each surface needs its own undo-on-failure shape, so this is closer to a multi-wave campaign than a one-shot. Revisit only when individual surfaces show user-visible lag.

### 7A. Realtime conflict resolution + presence
- **Fully deferred.**
  - **Conflict resolution:** depends on optimistic UI being everywhere first.
  - **Presence avatars** on Plan / Area / Plant detail pages — cosmetic; needs Supabase Presence channel + member metadata join. Revisit when multi-member homes get real usage.

### 7B. Service-worker page caching for offline read
- **Fully deferred.** Currently the PWA service worker (`registerSW` in main.tsx) handles installability, not data caching. Caching plants / plans / tasks for offline read needs:
  - A cache-first fetch handler keyed on Supabase REST URLs.
  - Schema validation to drop stale cached responses across migrations.
- Best handled as its own pass, paired with a clear cache-bust signal during deploys.

### 7B. Write queue — expand beyond task completion
- Shipped: queue applies to `tasks.status` updates only.
- **Deferred:** add queue kinds for other common offline actions (plant edits, journal entries, ailment linking). Pattern is in place — each new kind needs a discriminated entry in `QueuedWrite["kind"]` + an executor in `applyOne()`.

### 7C. Pull-to-refresh per-route
- **Already shipped** — `PullToRefresh` wraps the global `<Routes>` block in App.tsx. The handler is dashboard-centric but acceptable across routes for now. Per-route handlers can come later if specific pages need them.

---

## Out-of-wave items worth tracking

- **High-contrast mode (Wave 1)** could ship a high-contrast cover photo border / chip variants — currently only solid text colours are overridden. Low priority.
- **PhotoUploader (Wave 2)** could grow image-compression on the client side before upload to keep storage costs down. Currently uploads raw image (capped at 5MB).
- **InstanceEditModal hero (Wave 2 Pass 3)** could display `inventory_items.cover_image_url` as a hero banner at the top of the modal. Cover image is stored but only visible in the Photo Timeline. Quick follow-up when convenient.

---

## Process

When deferring an item:
1. Add it here with a one-liner on **why** and a **revisit if** trigger.
2. Mention it in the wave's commit message (already doing this).
3. When it ships, remove the entry.
