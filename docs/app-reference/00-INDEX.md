# Rhozly App Reference — Master Index

The single source of truth for every documented screen, modal, and cross-cutting concern. Every line is a separate reference file at the same depth (Role 1 technical + Role 2 expert-gardener).

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete

---

## ⚠ Two mandatory rules — read both before editing code

### 1. Read app-reference BEFORE writing any plan or code

These files are the canonical "how is this wired up + how is it used" map. Read them first, every time:

- Identify every reference file that overlaps with the task (UI surface + cross-cutting concerns).
- Read them end-to-end (both Role 1 technical + Role 2 gardener) and follow `Related reference files` cross-links one hop out.
- Your plan in `docs/plans/<task>.md` must **list the references consulted** so the next reader can verify your mental model.

The "Read app-reference before touching code" rule in [CLAUDE.md](../../CLAUDE.md#read-app-reference-before-touching-code) has a per-concern lookup table — use it to know which cross-cutting files apply to your change. Skipping this step is how new code conflicts with existing wiring (duplicate logic, missed tier gates, broken RLS, orphaned cron dependencies).

### 2. Update app-reference WITH the code change in the same PR

When the change is shipped, update the matching reference file(s) so the docs never drift:

- The format is **non-negotiable**: every file has BOTH Role 1 (senior dev technical) AND Role 2 (expert gardener UX). Use [`_template.md`](./_template.md) for any new file.
- The full mandate, drift-handling rules, and per-change-type checklist live in [CLAUDE.md § App-reference documentation is mandatory](../../CLAUDE.md#app-reference-documentation-is-mandatory-for-all-code-changes).
- The plan must also **list which references will be updated** by this task.
- When in doubt: if a user could open the screen, it has a Role 2. If the code is non-trivial, it has a Role 1.

**Read → Plan → Implement → Test → Update docs → Ship.** The docs are both an input and an output of every task.

---

## 01 — Onboarding & Auth

- [x] [Auth Screen](./01-onboarding/01-auth-screen.md) — sign in / sign up, OAuth providers, password reset
- [x] [Welcome Modal](./01-onboarding/02-welcome-modal.md) — first-run 4-slide carousel
- [x] [Home Setup](./01-onboarding/03-home-setup.md) — name / country / postcode / hemisphere flow
- [x] [Tier Selection](./01-onboarding/04-tier-selection.md) — Sprout / Botanist / Sage / Evergreen picker
- [x] [Garden Quiz (Habit Quiz)](./01-onboarding/05-garden-quiz.md) — preferences capture for personalisation
- [x] [Getting Started Checklist](./01-onboarding/06-getting-started-checklist.md) — dashboard onboarding card
- [x] [Notification Opt-In Card](./01-onboarding/07-notification-opt-in.md) — one-time browser permission ask
- [x] [PWA Install Prompt](./01-onboarding/08-pwa-install.md) — `beforeinstallprompt` hook

## 02 — Dashboard

- [x] [Dashboard Tab](./02-dashboard/01-dashboard-tab.md) — main feed: Daily Brief, AI Insights, today's tasks, plant counts
- [x] [Locations Tab](./02-dashboard/02-locations-tab.md) — grid of location tiles with task counts
- [x] [Calendar Tab](./02-dashboard/03-calendar-tab.md) — Month / Week views, drag-reschedule, ICS export
- [x] [Weather Tab](./02-dashboard/04-weather-tab.md) — 7-day forecast, alerts, sunrise/sunset
- [x] [Daily Brief Card](./02-dashboard/05-daily-brief-card.md) — top hero card on the dashboard
- [x] [AI Assistant Card](./02-dashboard/06-assistant-card.md) — user_insights surface
- [x] [Location Page (Drill-In)](./02-dashboard/07-location-page.md) — `?locationId=` view
- [x] [Weather Alert Banner](./02-dashboard/08-weather-alert-banner.md) — frost / heat / wind / rain alerts
- [x] [Quick Access Home](./02-dashboard/09-quick-access-home.md) — mobile shortcut home (`/quick`) with Visual Lens + Calendar / Quick Capture placeholder tiles
- [x] [Localized Task Calendar](./02-dashboard/10-localized-task-calendar.md) — mobile `/quick/calendar` with frost-aware planting helper, rain-vs-watering advice, and today's pending tasks
- [x] [Quick Capture Journal](./02-dashboard/11-quick-capture-journal.md) — mobile `/quick/journal` capture-first journal mode; entries land unassigned and get filed to plants later
- [x] [The Library](./02-dashboard/12-the-library.md) — `/library/*` plant database — search any species, preview care / grow guide / companions / light, save to Shed

## 03 — Garden Hub

- [x] [The Shed](./03-garden-hub/01-the-shed.md) — plant inventory, search, multi-select, contextual chips
- [x] [Ailment Watchlist](./03-garden-hub/02-watchlist.md) — pests, diseases, invasives tracking
- [x] [Location Manager](./03-garden-hub/03-location-manager.md) — locations + areas CRUD, metric editing
- [x] [Area Details](./03-garden-hub/04-area-details.md) — drill-in for a single area
- [x] [Garden Layout List](./03-garden-hub/05-garden-layout-list.md) — list of garden layouts
- [x] [Garden Layout Editor](./03-garden-hub/06-garden-layout-editor.md) — shape-based map editor
- [x] [Microclimate Report](./03-garden-hub/07-microclimate-report.md) — sun / wind / frost per area modal
- [x] [Sun Tracker AR](./03-garden-hub/08-sun-tracker-ar.md) — AR sun path overlay
- [x] [Light Sensor](./03-garden-hub/09-light-sensor.md) — lux meter + band + plant comparison

## 04 — Planner & Shopping

- [x] [Planner Dashboard](./04-planner/01-planner-dashboard.md) — list of plans, status tabs
- [x] [Plan Staging](./04-planner/02-plan-staging.md) — Phase 1 / 2 / 3 stage-by-stage execution
- [x] [Plan Reference Photos](./04-planner/03-plan-reference-photos.md) — per-plan photo collection
- [x] [New Plan Form](./04-planner/04-new-plan-form.md) — create plan wizard
- [x] [Shopping Lists](./04-planner/05-shopping-lists.md) — list overview + completed lists
- [x] [Shopping List Items](./04-planner/06-shopping-list-items.md) — per-list item rows
- [x] [Blueprint Manager (Task Schedules)](./04-planner/07-blueprint-manager.md) — recurring task templates
- [x] [Optimise Tab](./04-planner/08-optimise-tab.md) — schedule consolidator + AI ideas

## 05 — Tools

- [x] [Tools Hub](./05-tools/01-tools-hub.md) — grouped tile launcher
- [x] [Plant Doctor](./05-tools/02-plant-doctor.md) — identify / diagnose / pest scan
- [x] [Plant Doctor Chat](./05-tools/03-plant-doctor-chat.md) — sticky AI chat overlay
- [x] [Plant Doctor History](./05-tools/04-plant-doctor-history.md) — past sessions with filters
- [x] [Plant Visualiser](./05-tools/05-plant-visualiser.md) — AR / 2D plant view
- [x] [Sprite Wizard](./05-tools/06-sprite-wizard.md) — assign plant icons for visualiser
- [x] [Guides List](./05-tools/07-guides-list.md) — Rhozly + Community guides with bookmarks
- [x] [Community Guide Reader](./05-tools/08-community-guide-reader.md) — single-guide view
- [x] [Community Guide Editor](./05-tools/09-community-guide-editor.md) — user authoring
- [x] [Garden Profile / Habit Quiz](./05-tools/10-garden-profile.md) — preferences editor

## 06 — Account & Settings

- [x] [Account Tab](./06-account/01-account-tab.md) — name, email, password, tier, AI usage, accessibility, data export, danger zone
- [x] [Notifications (Alerts) Tab](./06-account/02-notifications-tab.md) — push permission + per-category toggles
- [x] [Awards (Achievements) Tab](./06-account/03-awards-tab.md) — unlocked badges
- [x] [Stats Tab](./06-account/04-stats-tab.md) — gardener stats summary
- [x] [My Beta Feedback Section](./06-account/05-my-feedback.md) — submission history with admin status
- [x] [Accessibility Section](./06-account/06-accessibility-section.md) — high contrast toggle
- [x] [Data Export Section](./06-account/07-data-export.md) — GDPR archive download
- [x] [Delete Account Modal](./06-account/08-delete-account.md) — destructive flow
- [x] [User Profile Dropdown](./06-account/09-user-profile-dropdown.md) — top-right menu

## 07 — Management & Admin

- [x] [Home Management — Overview](./07-management/01-home-management-overview.md)
- [x] [Members & Permissions Tab](./07-management/02-members-permissions.md)
- [x] [Multiple Homes Tab](./07-management/03-multiple-homes.md)
- [x] [Home Climate Settings Tab](./07-management/04-climate-settings.md)
- [x] [Integrations — Devices Tab](./07-management/05-integrations-devices.md)
- [x] [Integrations — Automations Tab](./07-management/06-integrations-automations.md)
- [x] [Integrations — Soil Readings](./07-management/07-integrations-readings.md)
- [x] [Audit Log](./07-management/08-audit-log.md) — admin-only AI usage + activity
- [x] [Admin Guide Generator](./07-management/09-admin-guide-generator.md) — AI-authored guide drafting

## 08 — Modals & Overlays

- [x] [Add Task / Edit Schedule Modal](./08-modals-and-overlays/01-add-task-modal.md)
- [x] [Task Detail Modal](./08-modals-and-overlays/02-task-modal.md)
- [x] [Add Plant — Source Picker](./08-modals-and-overlays/03-plant-source-picker.md)
- [x] [Add Plant — Bulk Search](./08-modals-and-overlays/04-bulk-search-modal.md)
- [x] [Plant Search Modal](./08-modals-and-overlays/05-plant-search-modal.md)
- [x] [Plant Edit Modal](./08-modals-and-overlays/06-plant-edit-modal.md)
- [x] [Plant Assignment Modal](./08-modals-and-overlays/07-plant-assignment-modal.md)
- [x] [Instance Edit Modal](./08-modals-and-overlays/08-instance-edit-modal.md) — per-plant tabs (Details, Routines, Journal, Photos, Care Guide, Guides, Yield, Light, Stats, Companions)
- [x] [Photo Timeline Tab](./08-modals-and-overlays/09-photo-timeline-tab.md)
- [x] [Plant Journal Tab](./08-modals-and-overlays/10-plant-journal-tab.md)
- [x] [Companion Plants Tab](./08-modals-and-overlays/11-companion-plants-tab.md)
- [x] [Yield Tab](./08-modals-and-overlays/12-yield-tab.md)
- [x] [Plant Guides Tab](./08-modals-and-overlays/13-plant-guides-tab.md)
- [x] [Link Ailment Modal](./08-modals-and-overlays/14-link-ailment-modal.md)
- [x] [Area Scan Modal](./08-modals-and-overlays/15-area-scan-modal.md)
- [x] [Bulk Config Modal](./08-modals-and-overlays/16-bulk-config-modal.md)
- [x] [Confirm Modal](./08-modals-and-overlays/17-confirm-modal.md)
- [x] [Contact Support Modal](./08-modals-and-overlays/18-contact-support.md)
- [x] [Release Notes Modal](./08-modals-and-overlays/19-release-notes.md)
- [x] [Privacy Policy Modal](./08-modals-and-overlays/20-privacy-policy.md)
- [x] [Cookie Policy Modal](./08-modals-and-overlays/21-cookie-policy.md)
- [x] [Global Search](./08-modals-and-overlays/22-global-search.md)
- [x] [Global Quick Add](./08-modals-and-overlays/23-global-quick-add.md)
- [x] [Help Center Drawer](./08-modals-and-overlays/24-help-center.md)
- [x] [Beta Feedback Banner + Modal](./08-modals-and-overlays/25-beta-feedback-banner.md)
- [x] [Beta Feedback Sheet](./08-modals-and-overlays/26-beta-feedback-sheet.md)
- [x] [Photo Uploader](./08-modals-and-overlays/27-photo-uploader.md)
- [x] [Photo Annotation Overlay](./08-modals-and-overlays/28-photo-annotation.md)
- [x] [Multi Image Gallery](./08-modals-and-overlays/29-multi-image-gallery.md)
- [x] [Diagnosis Image Gallery](./08-modals-and-overlays/30-diagnosis-gallery.md)
- [x] [Capture Gallery](./08-modals-and-overlays/31-capture-gallery.md)
- [x] [Plant Camera View](./08-modals-and-overlays/32-plant-camera-view.md)
- [x] [Manual Plant Creation](./08-modals-and-overlays/33-manual-plant-creation.md)
- [x] [Wiki Image Picker](./08-modals-and-overlays/34-wiki-image-picker.md)
- [x] [Quick Add Task Modal](./08-modals-and-overlays/35-quick-add-task-modal.md) — slim 4-field sibling of Add Task Modal mounted from the mobile Today's tasks card
- [x] [Grow Guide Tab](./08-modals-and-overlays/36-grow-guide-tab.md) — 9-section AI-generated comprehensive grow guide on Plant + Instance Edit modals

## 09 — Persistent UI

- [x] [Header / Top Bar](./09-persistent-ui/01-header.md) — logo, nav toggle, home dropdown, search, quick-add, profile
- [x] [Sidebar Navigation](./09-persistent-ui/02-sidebar.md) — primary nav with badges
- [x] [Offline Badge](./09-persistent-ui/03-offline-badge.md)
- [x] [Queued Actions Badge](./09-persistent-ui/04-queued-actions-badge.md)
- [x] [Sync Indicator](./09-persistent-ui/05-sync-indicator.md)
- [x] [Update Banner](./09-persistent-ui/06-update-banner.md) — new SW version prompt
- [x] [Pull To Refresh](./09-persistent-ui/07-pull-to-refresh.md)
- [x] [Error Page](./09-persistent-ui/08-error-page.md) — top-level Sentry boundary
- [x] [Maintenance Screen](./09-persistent-ui/09-maintenance-screen.md)
- [x] [Toast / Toaster](./09-persistent-ui/10-toaster.md)

## 99 — Cross-Cutting Concerns

- [x] [Data Model — Homes, Members, Permissions](./99-cross-cutting/01-data-model-home.md)
- [x] [Data Model — Locations, Areas, Layouts, Shapes](./99-cross-cutting/02-data-model-spatial.md)
- [x] [Data Model — Plants, Inventory Items, Sources](./99-cross-cutting/03-data-model-plants.md)
- [x] [Data Model — Tasks, Blueprints, Dependencies, Ghosts](./99-cross-cutting/04-data-model-tasks.md)
- [x] [Data Model — Plans, Staging State, Phases](./99-cross-cutting/05-data-model-plans.md)
- [x] [Data Model — Ailments, Plant Instance Ailments](./99-cross-cutting/06-data-model-ailments.md)
- [x] [Data Model — Photos, Journals, Storage Buckets](./99-cross-cutting/07-data-model-media.md)
- [x] [Data Model — Guides, Bookmarks, Drafts](./99-cross-cutting/08-data-model-guides.md)
- [x] [Data Model — Integrations, Devices, Readings, Automations](./99-cross-cutting/09-data-model-integrations.md)
- [x] [Edge Functions — Catalogue](./99-cross-cutting/10-edge-functions-catalogue.md) — every fn, what it does, who calls it
- [x] [Cron Jobs — Schedules](./99-cross-cutting/11-cron-jobs.md) — every scheduled job + cadence
- [x] [Notifications — Browser, Push, In-App](./99-cross-cutting/12-notifications.md)
- [x] [AI — Gemini Calls, Rate Limits, Caching](./99-cross-cutting/13-ai-gemini.md)
- [x] [Caching — sessionStorage, localStorage, Supabase, Image Proxy](./99-cross-cutting/14-caching.md)
- [x] [Realtime — Supabase Channels, Presence](./99-cross-cutting/15-realtime.md)
- [x] [Offline Queue — Mechanics, Kinds, Replay](./99-cross-cutting/16-offline-queue.md)
- [x] [Tier Gating — Sprout / Botanist / Sage / Evergreen](./99-cross-cutting/17-tier-gating.md)
- [x] [Beta Gating — `is_beta` Flag](./99-cross-cutting/18-beta-gating.md)
- [x] [RLS — Policy Patterns](./99-cross-cutting/19-rls-patterns.md)
- [x] [Error Handling — Sentry, report-error, ErrorPage](./99-cross-cutting/20-error-handling.md)
- [x] [Routing — React Router v6, Deep Links, URL State](./99-cross-cutting/21-routing.md)
- [x] [PWA — Service Worker, Update Flow, Install](./99-cross-cutting/22-pwa.md)
- [x] [Capacitor — Native Wrapper, Native APIs](./99-cross-cutting/23-capacitor.md)
- [x] [Image Sources — Perenual, Verdantly, Wikipedia, Pixabay, Unsplash](./99-cross-cutting/24-image-sources.md)
- [x] [Plant Providers — Perenual, Verdantly, AI](./99-cross-cutting/25-plant-providers.md)
- [x] [Pattern Engine — Detectors, Insights, Behaviour Summary](./99-cross-cutting/26-pattern-engine.md)
- [x] [Weather — Open-Meteo, Snapshots, Rules](./99-cross-cutting/27-weather.md)
- [x] [Sun Analysis — Shapes, Sunlight Bands, Microclimate](./99-cross-cutting/28-sun-analysis.md)
- [x] [Hemisphere & Seasonality](./99-cross-cutting/29-seasonality.md)
- [x] [Onboarding State — `user_profiles.onboarding_state` jsonb](./99-cross-cutting/30-onboarding-state.md)
- [x] [Deployment Pipeline — `npm run deploy`, Vercel, Maintenance Mode](./99-cross-cutting/31-deployment.md)
- [x] [Release Notes Pipeline](./99-cross-cutting/32-release-notes.md)

---

## How to use this document

- Tick items as their reference file lands.
- Cross-link liberally — UI files link into cross-cutting where relevant, and cross-cutting files link back to every UI surface that touches them.
- When the codebase changes, the relevant reference file is the source of truth and **must be updated in the same PR**. The status here goes back to `[~]` (in progress) if a file's coverage has drifted enough to need a rewrite.

## Per-change-type checklist

Use this whenever you write a `docs/plans/<task>.md` plan — list the affected files in the plan and tick them off as you ship.

| Change | What to update |
|--------|---------------|
| New UI screen / route | Create new file from [`_template.md`](./_template.md), add `- [ ]` row to the right folder section above, update [Routing](./99-cross-cutting/21-routing.md) |
| New modal / sheet / drawer | New file in `08-modals-and-overlays/`, update parent screen's reference, add row above |
| New tab inside an existing surface | Update the parent's Component graph + the relevant existing reference (don't create a separate file unless the tab has its own substantial logic) |
| Renamed route / heading / button label | Update the surface's reference + grep `docs/app-reference/` for the old name + replace in cross-links |
| New edge function | Add row to [`10-edge-functions-catalogue.md`](./99-cross-cutting/10-edge-functions-catalogue.md); update every consuming UI surface's "Edge functions invoked" table |
| New cron job | Add row to [`11-cron-jobs.md`](./99-cross-cutting/11-cron-jobs.md); update every surface's "Cron / scheduled jobs that affect this surface" table |
| New table / column | Update the matching `01-data-model-*.md` cross-cutting reference; update affected surfaces' "Data flow" sections |
| New storage bucket | Update [`07-data-model-media.md`](./99-cross-cutting/07-data-model-media.md); update consuming surfaces' "Linked storage buckets" sections |
| New tier-gated feature | Update [`17-tier-gating.md`](./99-cross-cutting/17-tier-gating.md) gated-surfaces table; update the surface's Role 1 "Tier gating" section + Role 2 "Tier-by-tier experience" |
| New beta-gated feature | Update [`18-beta-gating.md`](./99-cross-cutting/18-beta-gating.md); update the surface's Beta gating section |
| New permission key | Update [`19-rls-patterns.md`](./99-cross-cutting/19-rls-patterns.md) AND [Members & Permissions](./07-management/02-members-permissions.md); update consuming surfaces' "Permissions" sections |
| New AI call (Gemini) | Update [`13-ai-gemini.md`](./99-cross-cutting/13-ai-gemini.md) consuming-functions list + [`10-edge-functions-catalogue.md`](./99-cross-cutting/10-edge-functions-catalogue.md) |
| New event in `events/registry.ts` | If user-facing-action, update [`08-audit-log.md`](./07-management/08-audit-log.md) `EVENT_LABELS` table; mention in any surface that fires it |
| New realtime channel | Update [`15-realtime.md`](./99-cross-cutting/15-realtime.md) Channels-in-active-use table; update consuming surfaces' "Realtime channels" sections |
| New offline-queue kind | Update [`16-offline-queue.md`](./99-cross-cutting/16-offline-queue.md) Kinds table |
| Deleted surface / function / table | Remove file or mark archived in index; grep cross-cutting + UI files for the name + remove stale references |

## Contributors — format rules

When updating a reference file, keep both voices intact:

- **Role 1 (Senior dev)** — every fact verifiable in the codebase. Component graph (tree), Props (table), State (table), Data flow read paths (with table/edge-fn/RLS), Data flow write paths, Edge functions invoked (table), Cron / scheduled jobs that affect this surface (table), Realtime channels, Tier gating, Beta gating, Permissions, Error states (table), Performance, Linked storage buckets.
- **Role 2 (Expert gardener)** — every claim verifiable by actually doing it as a user. Why open this, Every flow on this surface, Information on display — what every field means (table), Tier-by-tier experience (table), New / returning / power-user framing if relevant, Common mistakes / pitfalls (bullets), Recommended workflows (numbered), What to do if something looks wrong (bullets).

**Tone discipline:**
- Role 1 = precise + factual. Use code blocks, table headers, type signatures.
- Role 2 = warm + opinionated. Use full sentences. Frame for both a beginner and an expert.
- Never blur them. Don't put gardener prose in Role 1; don't put TypeScript types in Role 2.

**Code references** live in the final `Code references for ongoing maintenance` section. List the actual file paths and any relevant edge-function / migration / hook files so a future maintainer knows where to look.

**Cross-links** go in `Related reference files` near the bottom. Link to every doc that materially overlaps — these docs work as a graph.
