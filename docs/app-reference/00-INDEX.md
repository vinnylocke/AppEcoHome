# Rhozly App Reference — Master Index

The single source of truth for every documented screen, modal, and cross-cutting concern. Every line is a separate reference file at the same depth (Role 1 technical + Role 2 expert-gardener).

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete

---

## 01 — Onboarding & Auth

- [ ] [Auth Screen](./01-onboarding/01-auth-screen.md) — sign in / sign up, OAuth providers, password reset
- [ ] [Welcome Modal](./01-onboarding/02-welcome-modal.md) — first-run 4-slide carousel
- [ ] [Home Setup](./01-onboarding/03-home-setup.md) — name / country / postcode / hemisphere flow
- [ ] [Tier Selection](./01-onboarding/04-tier-selection.md) — Sprout / Botanist / Sage / Evergreen picker
- [ ] [Garden Quiz (Habit Quiz)](./01-onboarding/05-garden-quiz.md) — preferences capture for personalisation
- [ ] [Getting Started Checklist](./01-onboarding/06-getting-started-checklist.md) — dashboard onboarding card
- [ ] [Notification Opt-In Card](./01-onboarding/07-notification-opt-in.md) — one-time browser permission ask
- [ ] [PWA Install Prompt](./01-onboarding/08-pwa-install.md) — `beforeinstallprompt` hook

## 02 — Dashboard

- [x] [Dashboard Tab](./02-dashboard/01-dashboard-tab.md) — main feed: Daily Brief, AI Insights, today's tasks, plant counts
- [x] [Locations Tab](./02-dashboard/02-locations-tab.md) — grid of location tiles with task counts
- [x] [Calendar Tab](./02-dashboard/03-calendar-tab.md) — Month / Week views, drag-reschedule, ICS export
- [x] [Weather Tab](./02-dashboard/04-weather-tab.md) — 7-day forecast, alerts, sunrise/sunset
- [x] [Daily Brief Card](./02-dashboard/05-daily-brief-card.md) — top hero card on the dashboard
- [x] [AI Assistant Card](./02-dashboard/06-assistant-card.md) — user_insights surface
- [x] [Location Page (Drill-In)](./02-dashboard/07-location-page.md) — `?locationId=` view
- [x] [Weather Alert Banner](./02-dashboard/08-weather-alert-banner.md) — frost / heat / wind / rain alerts

## 03 — Garden Hub

- [ ] [The Shed](./03-garden-hub/01-the-shed.md) — plant inventory, search, multi-select, contextual chips
- [ ] [Ailment Watchlist](./03-garden-hub/02-watchlist.md) — pests, diseases, invasives tracking
- [ ] [Location Manager](./03-garden-hub/03-location-manager.md) — locations + areas CRUD, metric editing
- [ ] [Area Details](./03-garden-hub/04-area-details.md) — drill-in for a single area
- [ ] [Garden Layout List](./03-garden-hub/05-garden-layout-list.md) — list of garden layouts
- [ ] [Garden Layout Editor](./03-garden-hub/06-garden-layout-editor.md) — shape-based map editor
- [ ] [Microclimate Report](./03-garden-hub/07-microclimate-report.md) — sun / wind / frost per area modal
- [ ] [Sun Tracker AR](./03-garden-hub/08-sun-tracker-ar.md) — AR sun path overlay
- [ ] [Light Sensor](./03-garden-hub/09-light-sensor.md) — lux meter + band + plant comparison

## 04 — Planner & Shopping

- [ ] [Planner Dashboard](./04-planner/01-planner-dashboard.md) — list of plans, status tabs
- [ ] [Plan Staging](./04-planner/02-plan-staging.md) — Phase 1 / 2 / 3 stage-by-stage execution
- [ ] [Plan Reference Photos](./04-planner/03-plan-reference-photos.md) — per-plan photo collection
- [ ] [New Plan Form](./04-planner/04-new-plan-form.md) — create plan wizard
- [ ] [Shopping Lists](./04-planner/05-shopping-lists.md) — list overview + completed lists
- [ ] [Shopping List Items](./04-planner/06-shopping-list-items.md) — per-list item rows
- [ ] [Blueprint Manager (Task Schedules)](./04-planner/07-blueprint-manager.md) — recurring task templates
- [ ] [Optimise Tab](./04-planner/08-optimise-tab.md) — schedule consolidator + AI ideas

## 05 — Tools

- [ ] [Tools Hub](./05-tools/01-tools-hub.md) — grouped tile launcher
- [ ] [Plant Doctor](./05-tools/02-plant-doctor.md) — identify / diagnose / pest scan
- [ ] [Plant Doctor Chat](./05-tools/03-plant-doctor-chat.md) — sticky AI chat overlay
- [ ] [Plant Doctor History](./05-tools/04-plant-doctor-history.md) — past sessions with filters
- [ ] [Plant Visualiser](./05-tools/05-plant-visualiser.md) — AR / 2D plant view
- [ ] [Sprite Wizard](./05-tools/06-sprite-wizard.md) — assign plant icons for visualiser
- [ ] [Guides List](./05-tools/07-guides-list.md) — Rhozly + Community guides with bookmarks
- [ ] [Community Guide Reader](./05-tools/08-community-guide-reader.md) — single-guide view
- [ ] [Community Guide Editor](./05-tools/09-community-guide-editor.md) — user authoring
- [ ] [Garden Profile / Habit Quiz](./05-tools/10-garden-profile.md) — preferences editor

## 06 — Account & Settings

- [ ] [Account Tab](./06-account/01-account-tab.md) — name, email, password, tier, AI usage, accessibility, data export, danger zone
- [ ] [Notifications (Alerts) Tab](./06-account/02-notifications-tab.md) — push permission + per-category toggles
- [ ] [Awards (Achievements) Tab](./06-account/03-awards-tab.md) — unlocked badges
- [ ] [Stats Tab](./06-account/04-stats-tab.md) — gardener stats summary
- [ ] [My Beta Feedback Section](./06-account/05-my-feedback.md) — submission history with admin status
- [ ] [Accessibility Section](./06-account/06-accessibility-section.md) — high contrast toggle
- [ ] [Data Export Section](./06-account/07-data-export.md) — GDPR archive download
- [ ] [Delete Account Modal](./06-account/08-delete-account.md) — destructive flow
- [ ] [User Profile Dropdown](./06-account/09-user-profile-dropdown.md) — top-right menu

## 07 — Management & Admin

- [ ] [Home Management — Overview](./07-management/01-home-management-overview.md)
- [ ] [Members & Permissions Tab](./07-management/02-members-permissions.md)
- [ ] [Multiple Homes Tab](./07-management/03-multiple-homes.md)
- [ ] [Home Climate Settings Tab](./07-management/04-climate-settings.md)
- [ ] [Integrations — Devices Tab](./07-management/05-integrations-devices.md)
- [ ] [Integrations — Automations Tab](./07-management/06-integrations-automations.md)
- [ ] [Integrations — Soil Readings](./07-management/07-integrations-readings.md)
- [ ] [Audit Log](./07-management/08-audit-log.md) — admin-only AI usage + activity
- [ ] [Admin Guide Generator](./07-management/09-admin-guide-generator.md) — AI-authored guide drafting

## 08 — Modals & Overlays

- [ ] [Add Task / Edit Schedule Modal](./08-modals-and-overlays/01-add-task-modal.md)
- [ ] [Task Detail Modal](./08-modals-and-overlays/02-task-modal.md)
- [ ] [Add Plant — Source Picker](./08-modals-and-overlays/03-plant-source-picker.md)
- [ ] [Add Plant — Bulk Search](./08-modals-and-overlays/04-bulk-search-modal.md)
- [ ] [Plant Search Modal](./08-modals-and-overlays/05-plant-search-modal.md)
- [ ] [Plant Edit Modal](./08-modals-and-overlays/06-plant-edit-modal.md)
- [ ] [Plant Assignment Modal](./08-modals-and-overlays/07-plant-assignment-modal.md)
- [ ] [Instance Edit Modal](./08-modals-and-overlays/08-instance-edit-modal.md) — per-plant tabs (Details, Routines, Journal, Photos, Care Guide, Guides, Yield, Light, Stats, Companions)
- [ ] [Photo Timeline Tab](./08-modals-and-overlays/09-photo-timeline-tab.md)
- [ ] [Plant Journal Tab](./08-modals-and-overlays/10-plant-journal-tab.md)
- [ ] [Companion Plants Tab](./08-modals-and-overlays/11-companion-plants-tab.md)
- [ ] [Yield Tab](./08-modals-and-overlays/12-yield-tab.md)
- [ ] [Plant Guides Tab](./08-modals-and-overlays/13-plant-guides-tab.md)
- [ ] [Link Ailment Modal](./08-modals-and-overlays/14-link-ailment-modal.md)
- [ ] [Area Scan Modal](./08-modals-and-overlays/15-area-scan-modal.md)
- [ ] [Bulk Config Modal](./08-modals-and-overlays/16-bulk-config-modal.md)
- [ ] [Confirm Modal](./08-modals-and-overlays/17-confirm-modal.md)
- [ ] [Contact Support Modal](./08-modals-and-overlays/18-contact-support.md)
- [ ] [Release Notes Modal](./08-modals-and-overlays/19-release-notes.md)
- [ ] [Privacy Policy Modal](./08-modals-and-overlays/20-privacy-policy.md)
- [ ] [Cookie Policy Modal](./08-modals-and-overlays/21-cookie-policy.md)
- [ ] [Global Search](./08-modals-and-overlays/22-global-search.md)
- [ ] [Global Quick Add](./08-modals-and-overlays/23-global-quick-add.md)
- [ ] [Help Center Drawer](./08-modals-and-overlays/24-help-center.md)
- [ ] [Beta Feedback Banner + Modal](./08-modals-and-overlays/25-beta-feedback-banner.md)
- [ ] [Beta Feedback Sheet](./08-modals-and-overlays/26-beta-feedback-sheet.md)
- [ ] [Photo Uploader](./08-modals-and-overlays/27-photo-uploader.md)
- [ ] [Photo Annotation Overlay](./08-modals-and-overlays/28-photo-annotation.md)
- [ ] [Multi Image Gallery](./08-modals-and-overlays/29-multi-image-gallery.md)
- [ ] [Diagnosis Image Gallery](./08-modals-and-overlays/30-diagnosis-gallery.md)
- [ ] [Capture Gallery](./08-modals-and-overlays/31-capture-gallery.md)
- [ ] [Plant Camera View](./08-modals-and-overlays/32-plant-camera-view.md)
- [ ] [Manual Plant Creation](./08-modals-and-overlays/33-manual-plant-creation.md)
- [ ] [Wiki Image Picker](./08-modals-and-overlays/34-wiki-image-picker.md)

## 09 — Persistent UI

- [ ] [Header / Top Bar](./09-persistent-ui/01-header.md) — logo, nav toggle, home dropdown, search, quick-add, profile
- [ ] [Sidebar Navigation](./09-persistent-ui/02-sidebar.md) — primary nav with badges
- [ ] [Offline Badge](./09-persistent-ui/03-offline-badge.md)
- [ ] [Queued Actions Badge](./09-persistent-ui/04-queued-actions-badge.md)
- [ ] [Sync Indicator](./09-persistent-ui/05-sync-indicator.md)
- [ ] [Update Banner](./09-persistent-ui/06-update-banner.md) — new SW version prompt
- [ ] [Pull To Refresh](./09-persistent-ui/07-pull-to-refresh.md)
- [ ] [Error Page](./09-persistent-ui/08-error-page.md) — top-level Sentry boundary
- [ ] [Maintenance Screen](./09-persistent-ui/09-maintenance-screen.md)
- [ ] [Toast / Toaster](./09-persistent-ui/10-toaster.md)

## 99 — Cross-Cutting Concerns

- [ ] [Data Model — Homes, Members, Permissions](./99-cross-cutting/01-data-model-home.md)
- [ ] [Data Model — Locations, Areas, Layouts, Shapes](./99-cross-cutting/02-data-model-spatial.md)
- [ ] [Data Model — Plants, Inventory Items, Sources](./99-cross-cutting/03-data-model-plants.md)
- [ ] [Data Model — Tasks, Blueprints, Dependencies, Ghosts](./99-cross-cutting/04-data-model-tasks.md)
- [ ] [Data Model — Plans, Staging State, Phases](./99-cross-cutting/05-data-model-plans.md)
- [ ] [Data Model — Ailments, Plant Instance Ailments](./99-cross-cutting/06-data-model-ailments.md)
- [ ] [Data Model — Photos, Journals, Storage Buckets](./99-cross-cutting/07-data-model-media.md)
- [ ] [Data Model — Guides, Bookmarks, Drafts](./99-cross-cutting/08-data-model-guides.md)
- [ ] [Data Model — Integrations, Devices, Readings, Automations](./99-cross-cutting/09-data-model-integrations.md)
- [ ] [Edge Functions — Catalogue](./99-cross-cutting/10-edge-functions-catalogue.md) — every fn, what it does, who calls it
- [ ] [Cron Jobs — Schedules](./99-cross-cutting/11-cron-jobs.md) — every scheduled job + cadence
- [ ] [Notifications — Browser, Push, In-App](./99-cross-cutting/12-notifications.md)
- [ ] [AI — Gemini Calls, Rate Limits, Caching](./99-cross-cutting/13-ai-gemini.md)
- [ ] [Caching — sessionStorage, localStorage, Supabase, Image Proxy](./99-cross-cutting/14-caching.md)
- [ ] [Realtime — Supabase Channels, Presence](./99-cross-cutting/15-realtime.md)
- [ ] [Offline Queue — Mechanics, Kinds, Replay](./99-cross-cutting/16-offline-queue.md)
- [ ] [Tier Gating — Sprout / Botanist / Sage / Evergreen](./99-cross-cutting/17-tier-gating.md)
- [ ] [Beta Gating — `is_beta` Flag](./99-cross-cutting/18-beta-gating.md)
- [ ] [RLS — Policy Patterns](./99-cross-cutting/19-rls-patterns.md)
- [ ] [Error Handling — Sentry, report-error, ErrorPage](./99-cross-cutting/20-error-handling.md)
- [ ] [Routing — React Router v6, Deep Links, URL State](./99-cross-cutting/21-routing.md)
- [ ] [PWA — Service Worker, Update Flow, Install](./99-cross-cutting/22-pwa.md)
- [ ] [Capacitor — Native Wrapper, Native APIs](./99-cross-cutting/23-capacitor.md)
- [ ] [Image Sources — Perenual, Verdantly, Wikipedia, Pixabay, Unsplash](./99-cross-cutting/24-image-sources.md)
- [ ] [Plant Providers — Perenual, Verdantly, AI](./99-cross-cutting/25-plant-providers.md)
- [ ] [Pattern Engine — Detectors, Insights, Behaviour Summary](./99-cross-cutting/26-pattern-engine.md)
- [ ] [Weather — Open-Meteo, Snapshots, Rules](./99-cross-cutting/27-weather.md)
- [ ] [Sun Analysis — Shapes, Sunlight Bands, Microclimate](./99-cross-cutting/28-sun-analysis.md)
- [ ] [Hemisphere & Seasonality](./99-cross-cutting/29-seasonality.md)
- [ ] [Onboarding State — `user_profiles.onboarding_state` jsonb](./99-cross-cutting/30-onboarding-state.md)
- [ ] [Deployment Pipeline — `npm run deploy`, Vercel, Maintenance Mode](./99-cross-cutting/31-deployment.md)
- [ ] [Release Notes Pipeline](./99-cross-cutting/32-release-notes.md)

---

## How to use this document

- Tick items as their reference file lands.
- Cross-link liberally — UI files link into cross-cutting where relevant, and cross-cutting files link back to every UI surface that touches them.
- When the codebase changes, the relevant reference file is the source of truth and **must be updated in the same PR**. The status here goes back to `[ ]` if a file's coverage has drifted.

## Contributors

When updating a reference file, keep both voices intact:
- **Role 1 (Senior dev)** — every fact verifiable in the codebase.
- **Role 2 (Expert gardener)** — every claim verifiable by actually doing it as a user.
