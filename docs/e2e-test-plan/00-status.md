# E2E suite status

**Last verified:** 2026-06-15

Single-worker run against a freshly seeded local Supabase. `npm run test:e2e` against 4 parallel workers has not been re-run since the [stale-test cleanup](../plans/stale-test-cleanup-2026-06-15.md) — worth a manual check before treating any single-worker pass as parallel-safe.

## Overall

| Metric | Count |
|---|---|
| Spec files | **30** in `tests/e2e/specs/` |
| Page Objects | **27** in `tests/e2e/pages/` |
| ✅ Passing rows | **~547** |
| ⏭ Skipped (intentional) | **3** |
| ❌ N/A (feature does not exist) | **1** |
| 🔲 Planned | **~22** (mostly Garden Layout Builder advanced stages + multi-ID coverage) |
| 🚧 In progress | **17** (Community Guides — spec exists, not re-verified) |

## Per-section spec-pass status

| Section | File | Spec | Status |
|---|---|---|---|
| 2 | Authentication | `auth.spec.ts` | ✅ all green |
| 3 | Home Setup Wizard | `home-setup-{create,join}.spec.ts` | ✅ all green |
| 4 | Welcome Modal | `welcome-modal.spec.ts` | ✅ all green |
| 5 | Dashboard (weather + locations + tasks + calendar) | `dashboard.spec.ts` + `weather.spec.ts` + `calendar-window.spec.ts` | ✅ all green |
| 6 | The Shed (CRUD + discovery + edit + instances) | `shed-crud.spec.ts` + `plants.spec.ts` + `shed-discovery.spec.ts` + `plant-edit-assignment.spec.ts` + `instance-edit-tabs.spec.ts` | ✅ green except 3 planned (SHED-022b/c) + 2 skipped (SHED-DSC-007 + IE-002) |
| 7 | Task Schedule | `schedule.spec.ts` + `schedule-validation.spec.ts` + `schedule-optimise.spec.ts` | ✅ all green |
| 8 | Task Lifecycle + Harvest | `tasks.spec.ts` + `harvest-window.spec.ts` | ✅ all green |
| 9 | Plant Doctor + Chat | `plant-doctor.spec.ts` + `plant-doctor-chat.spec.ts` | ✅ green; 7 multi-ID rows still 🔲 Planned |
| 10 | Planner | `planner.spec.ts` + `planner-restore.spec.ts` | ✅ all green |
| 11 | Watchlist | `watchlist.spec.ts` | ✅ all green |
| 12 | Profile | `garden-profile.spec.ts` | ✅ Garden Profile green; `gardener-profile.spec.ts` not yet written (10 rows pending) |
| 13 | Management + Members + RLS | `area-setup.spec.ts` + `members-permissions.spec.ts` + `rls-isolation-db.spec.ts` | ✅ all green |
| 14 | Guides (Rhozly + Community) | `guides.spec.ts` + `community-guides.spec.ts` | ✅ Rhozly green; Community 🚧 needs re-verification |
| 15 | Plant Visualiser | `visualiser.spec.ts` | ✅ all green (AR scenarios excluded — manual) |
| 16 | Light Sensor + Tab + Stats + Lux History | `lightsensor.spec.ts` + `lighttab.spec.ts` + `statstab.spec.ts` | ✅ green; LUX-ADV-001..004 🔲 Planned |
| 17 | Global Layout + Nav | `layout.spec.ts` | ✅ all green |
| 18 | Realtime | `realtime.spec.ts` | ✅ all green (self-skips without service-role key) |
| 19 | Yield Recorder + Predictor | `yield.spec.ts` | ✅ all green |
| 20 | Shopping Lists | `shopping.spec.ts` + `shopping-edge-cases.spec.ts` | ✅ all green |
| 21 | Companion Plants | `companion-plants.spec.ts` | ✅ green; CPT-008 🔲 Planned |
| 22 | Garden Layout Builder | `garden-layout.spec.ts` | ✅ all currently-implementable rows green; ~14 rows 🔲 Pending seed extension or E2E follow-up |
| 23 | AI Plant Overhaul (freshness + override) | `ai-plant-freshness.spec.ts` + `ai-plant-override.spec.ts` | ✅ all green |
| 24 | The Nursery | `nursery-lifecycle.spec.ts` | ✅ all green |
| 25 | Security | `security-{auth,xss,storage}.spec.ts` | ✅ all green |
| 26 | Cross-home Data Isolation | `data-isolation.spec.ts` | ✅ all green (separate `isolation` Playwright project) |

## Recent history

- **2026-06-15 — Restructure:** docs/e2e-test-plan.md split into per-section files. No row content changed; section numbers re-monotonic; UUID table corrected; dead appendices archived.
- **2026-06-15 — PR 9:** AI freshness + override specs (7 tests) closed. Reverted the bad `beforeAll` cleanup in `shed-crud.spec.ts` that had been silently deleting the per-worker AI seed forks.
- **2026-06-15 — Stale test cleanup:** 3 Vitest failures (taskEngine, TodayFocusCard, QuickAccessHome) + 2 SHED failures closed.
- **2026-06-15 — User bug batch (22.0040 + 22.0043):** eWeLink refresh + Today's Tasks snooze + Plant overdue counter + Plant tile overdue chip. New shared `lib/taskFilters.ts` source of truth for snooze/window classification.
- **2026-06-14 — PR 8:** 22 Nursery tests + 2 silent product bugs fixed (`inventory_items.quantity` column missing, `PlantInstancesTab` not selecting `from_sowing_id`).
- **2026-06-13 — PR 7:** 11 Schedule Optimise tests + 32-row test-plan drift reconciled.
- **Earlier (PR 1..6):** initial buildout — auth, home setup, shed CRUD, harvest contract, AI chat, members + RLS, schedule edge cases + shopping + planner restore.
