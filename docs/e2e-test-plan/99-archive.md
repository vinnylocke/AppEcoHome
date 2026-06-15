# Archive

Things that used to live in the old monolithic `docs/e2e-test-plan.md` and don't need to clutter the per-section files anymore.

## Dropped — "Appendix A — Mock Payloads to Add"

The old doc had a section listing canonical mock JSON to add to `tests/e2e/fixtures/api-mocks.ts`. By PR 4 the mocks had all landed in different shapes (some live in spec-local files, some in `mockEdgeFunction()` helpers), and the appendix never got cleaned up. The canonical mocks live in:

- `tests/e2e/fixtures/api-mocks.ts` — `MOCK_PLANT_DOCTOR_AI_*`, `MOCK_WATCHLIST_AI_*`, etc.
- `tests/e2e/fixtures/no-home-yet.ts`, `welcome-modal-ready.ts` — page-level mocks for wizard tests
- `tests/e2e/utils/*` — reset helpers for harvest / chat / planner

If you need to look up "what does the mock for X look like" the answer is now "grep the spec for `mockEdgeFunction(`" or "open the matching `api-mocks.ts` constant", not "read the test plan."

## Dropped — "Appendix B — Page Objects"

The old doc had a 4-paragraph summary listing roughly half of the Page Objects with no useful detail. The current canonical list:

- All 27 Page Objects live in `tests/e2e/pages/`. Their roles + which specs use them are documented at the top of each per-section file.
- File-naming convention: `<Domain>Page.ts`. The spec that uses them imports the class directly.

## Marked ❌ N/A — LOC-006 "Indoor/Outdoor toggle invalid if locked"

The old doc had `LOC-006 — Indoor/Outdoor toggle — invalid if locked` marked as "feature does not exist — `toggleEnvironment()` fires unconditionally, no locked-toggle logic". The row is preserved in [05-dashboard.md](05-dashboard.md#location-detail-locationpage) as a "❌ N/A" so the ID space stays gap-free, but no test should be written for it unless the product gains a locked-toggle feature.

## Section-number history

The old monolithic doc had **three sections numbered 14, three numbered 15, and three numbered 16** — each later PR appended a "Section N" at the bottom without renumbering, so the same number meant different content depending on where you were scrolling. The restructured doc renumbers monotonically; the table below maps old → new for anyone Ctrl-F-ing from an old commit message or chat log.

| Old section heading | New file |
|---|---|
| Section 01 — Authentication | `02-auth.md` |
| Section 01b — Home Setup Wizard | `03-home-setup.md` |
| Section 01c — Welcome Modal | `04-welcome-modal.md` |
| Section 02 — Dashboard (Main View) | `05-dashboard.md` |
| Section 03 — Dashboard (LocationPage) | `05-dashboard.md` (Location detail) |
| Section 04 — Dashboard (Calendar View) + 04b | `05-dashboard.md` (Calendar + harvest visualisations) |
| Section 05 — The Shed | `06-shed.md` |
| Section 06 — Task Management + 06b + 06c | `07-schedule.md` |
| Section 07 — Task Lifecycle + 07b | `08-task-lifecycle.md` |
| Section 08 — Plant Doctor + 08b | `09-plant-doctor.md` |
| Section 09 — Planner + 09b | `10-planner.md` |
| Section 10 — Ailment Watchlist | `11-watchlist.md` |
| Section 11 — Garden Profile + 11b | `12-profile.md` |
| Section 12 — Location Management + 12b + 12c | `13-management.md` |
| Section 13 — Guides | `14-guides.md` (Rhozly half) |
| Section 14 (#1) — Plant Visualiser | `15-visualiser.md` |
| Section 14 (#2) — Community Guides | `14-guides.md` (Community half) |
| Section 15 (#1) — Light Sensor | `16-light.md` |
| Section 15 (#2) — Realtime | `18-realtime.md` |
| Section 16 (#1) — Global Layout & Navigation | `17-layout-nav.md` |
| Section 16 (#2) — Yield Recorder & Predictor | `19-yield.md` |
| Section 17 — Light Tab | `16-light.md` |
| Section 18 — Stats Tab | `16-light.md` |
| Section 19 — Area Lux Reading History | `16-light.md` |
| Section 20 — Garden Layout Builder | `22-garden-layout-builder.md` |
| Section 21 — Shopping Lists + 21b | `20-shopping.md` |
| Section 22 — Companion Plants Tab | `21-companion-plants.md` |
| Section 23 — AI Plant Freshness Chip | `23-ai-plant-overhaul.md` |
| Section 24 — AI Plant Override Flow | `23-ai-plant-overhaul.md` |
| Section 25 — The Nursery | `24-nursery.md` |
| (No previous section) Security | `25-security.md` |
| (No previous section) Data Isolation | `26-data-isolation.md` |
