# E2E test plan doc — structural rewrite

## What's wrong with the current doc

`docs/e2e-test-plan.md` has grown to **1547 lines in a single file** since PR 1. Reading anything specific now means scrolling past unrelated sections. Specific rot:

### 1. Broken section numbering — the same number appears twice

| Number | First use | Second use |
|---|---|---|
| Section 14 | Plant Visualiser (line 883) | Community Guides (line 1280) |
| Section 15 | Light Sensor (line 906) | Realtime (line 981) |
| Section 16 | Global Layout & Navigation (line 930) | Yield Recorder & Predictor (line 1009) |

Each later PR added new sections by appending at the bottom without renumbering, so anyone navigating "Section 15" doesn't know which one they're going to land on.

### 2. UUID table at the top has factually wrong values

Lines 32-109 list "Worker 0 (test1@rhozly.com)" fixture UUIDs and claim `PLANT_TOMATO_ID = 1000011`. The actual seed substitution (in `scripts/seed-test-db.mjs`) gives **worker 1 (test1) → plant_id 2000001**. The same table also shows `INV_TOMATO_ID` at prefix `0003-` — but `02_plants_shed.sql` uses `0004-`. PR 8 surfaced this when the Nursery spec needed correct IDs.

### 3. Mixed test-ID conventions, no master index

The doc has at least 4 different ID schemes — AUTH-001, R1-001, HRV-001, SHED-DSC-001, GLB-001, NURSERY-001 — with no top-level alphabetical index. Finding a single test by ID means Ctrl-F'ing through 1547 lines.

### 4. Three subdivision styles for "sub-section"

Some sections use **Stage 1 / Stage 2** subheadings; others use **Section 04b / Section 04c**; some use **### Browse + add packets** descriptive headings. No pattern.

### 5. Appendices are dead weight

`Appendix A — Mock Payloads to Add` is a 33-line TODO list that nobody has touched since PR 2 and is now mostly stale (the mocks landed in different forms).

`Appendix B — Page Objects` is one paragraph listing 4 of the 27 Page Objects that now exist. Worthless.

### 6. No cross-link into `docs/app-reference/`

Per CLAUDE.md the app-reference docs are the canonical "what does this screen do" map. The test plan was written before app-reference existed and never gained cross-links into it. Future readers can't go from "this test row" to "what the surface is supposed to do" without re-deriving.

### 7. No quick "what's the state of the suite" answer

Today's count of `✅ Passing` rows is **547**, but reaching that number means counting manually. There's no header banner with "X passing, Y planned, Z failing — last updated DATE."

---

## Proposed shape — hybrid: thin top-level index + per-section files

Best balance between "single source of truth" and "I can find what I need":

```
docs/e2e-test-plan.md                  ← ~120 lines: status banner + section table + how-to
docs/e2e-test-plan/
  00-status.md                          ← spec-by-spec count, last verified, latest failing
  01-seeded-fixtures.md                 ← THE canonical UUID + plant-id table. Cross-linked from CLAUDE.md
  02-auth.md                            ← Section 01: AUTH-001..050
  03-home-setup.md                      ← Section 01b: R1-* + R2-*
  04-welcome-modal.md                   ← Section 01c
  05-dashboard.md                       ← Sections 02, 03, 04 (the dashboard family — consolidate)
  06-shed.md                            ← Section 05 + nursery view toggle
  07-nursery.md                         ← Section 25
  08-schedule.md                        ← Section 06 + Optimise (06c) + edge cases (06b)
  09-task-lifecycle.md                  ← Section 07 + Harvest contract (07b)
  10-plant-doctor.md                    ← Section 08 + Garden AI chat (08b)
  11-planner.md                         ← Section 09 + restore (09b)
  12-watchlist.md                       ← Section 10
  13-profile.md                         ← Sections 11, 11b
  14-management.md                      ← Section 12 + members (12b) + RLS sweep (12c)
  15-guides.md                          ← Section 13 + Community guides (14-as-CGU)
  16-visualiser.md                      ← Section 14 (plant visualiser)
  17-light-sensor.md                    ← Section 15 (light sensor) + Light Tab (17) + Lux history (19)
  18-stats-tab.md                       ← Section 18
  19-realtime.md                        ← Section 15-as-RT
  20-yield.md                           ← Section 16 (yield) — stages 1+2
  21-shopping.md                        ← Section 21 + refill banner
  22-companion-plants.md                ← Section 22
  23-ai-plant-overhaul.md               ← Sections 23 + 24 — freshness chip + override flow
  24-garden-layout-builder.md           ← Section 20 (all 16 stages)
  25-global-layout-nav.md               ← Section 16-as-LAY
  26-security.md                        ← cross-cutting — security-auth + security-xss + security-storage
  99-archive.md                         ← deprecated rows; "Appendix A" old mocks; historical notes
```

**One file per UI domain.** A file maps roughly 1-1 to a Page Object + a spec file (with sub-tests bundled).

### Per-section file format (template)

Every per-section file follows the same shape:

```markdown
# {N}. {Section name}

**Spec file:** `tests/e2e/specs/{spec}.spec.ts`
**Page Object:** `tests/e2e/pages/{POClass}.ts`
**App-reference:** [link to docs/app-reference/.../<file>.md]
**Seed dependencies:** {list of `XX_*.sql` files}
**Last verified:** YYYY-MM-DD
**Status:** ✅ X passing · 🔲 Y planned · ❌ Z failing

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|

(table here — no extra subsection nesting unless there's a real reason)

## Notes

(any nuance — e.g. "this spec wipes seed_packets in beforeEach")

## Related

- [Cross-link to neighbouring sections]
- [App-reference: 99-cross-cutting/<X>.md]
```

### Top-level `docs/e2e-test-plan.md` format (template)

```markdown
# Rhozly — E2E test plan

**Status:** {X} passing · {Y} planned · {Z} failing across {N} spec files. Last verified: YYYY-MM-DD.

## Sections

| # | Surface | Spec | Tests | Status |
|---|---|---|---|---|
| 1 | Authentication | auth.spec.ts | 17 | ✅ |
| 2 | Home Setup | home-setup-*.spec.ts | 23 | ✅ |
| 3 | Welcome Modal | welcome-modal.spec.ts | 9 | ✅ |
| 4 | Dashboard | dashboard.spec.ts | 43 | ✅ |
... etc.

## Quick links

- [Seeded fixtures (UUIDs + plant IDs)](e2e-test-plan/01-seeded-fixtures.md) — single source of truth
- [Test-ID master index](e2e-test-plan/99-index.md) — alphabetical, Ctrl-F friendly
- [TESTING.md](../TESTING.md) — framework setup + how to run

## Workflow

(50-ish lines on status legend, when to update, etc.)
```

---

## Migration scope

Lines moved out of `docs/e2e-test-plan.md`: ~1400 of the 1547.
Lines remaining in `docs/e2e-test-plan.md`: ~120 (banner + section table + workflow).
New per-section files: ~25, averaging 40-80 lines each.

**No test row content is dropped.** Every existing AUTH-001, R1-002, etc. lands in its new home unchanged.

## Files I'll change

| File | Change |
|---|---|
| `docs/e2e-test-plan.md` | Replaced with the thin top-level index |
| `docs/e2e-test-plan/` | New directory, ~25 new files inside |
| `CLAUDE.md` | Updated reference from "see `docs/e2e-test-plan.md`" to "see `docs/e2e-test-plan/`" where the path matters; keep the top-level reference where it's the index |
| `TESTING.md` | Same — repoint any "see test plan section X" references to the new file paths |

## Bug fixes folded into the restructure (free wins)

While moving content:

1. **Correct the seed UUID table** — fix the wrong PLANT_TOMATO_ID + INV prefix in the fixtures file.
2. **Drop "Appendix A — Mock Payloads to Add"** — stale TODO; the actual mocks live in the specs.
3. **Drop "Appendix B — Page Objects"** — replace with each per-section file's Page Object reference at the top.
4. **Renumber sections so no number appears twice.** Use 1-based monotonic numbering. Old IDs (AUTH-001 etc.) stay unchanged — only the *section number* in the doc changes.

## Risks

- **Stale links in commit messages / PR descriptions.** A few of my own PR commits (PR 7/8/9) reference "Section 25" or "Section 06c" by number. I'll grep the codebase for `e2e-test-plan.md#` deep links and rewrite any that point at moved anchors.
- **Editor breakage** — moving content within a single file is `git mv`-shaped; this is a split. Git will track per-file additions cleanly because the new files are net-new paths.

## Not in scope

- Adding new tests. (This is reorganisation only.)
- Changing the status of any existing row. If a row says ✅ Passing today, it says the same after the rewrite.
- Renaming test IDs (AUTH-001 stays AUTH-001).
- Editing `CLAUDE.md`'s test plan rules beyond updating path references.

## Acceptance

- `docs/e2e-test-plan.md` is ≤ 150 lines.
- `docs/e2e-test-plan/` contains ~25 per-section files, each ≤ 100 lines (give or take for sprawling sections like Garden Layout Builder).
- Single seeded-fixtures file is the only place UUIDs live.
- Every section file links to its Page Object + spec + app-reference + relevant seed files.
- Grep for `e2e-test-plan.md#` across the repo returns either valid anchors (in the new top-level file) or no results.
- `grep -c "⏳\|🔲" docs/e2e-test-plan.md docs/e2e-test-plan/*.md` returns the same number as today's monolith.

## Estimated size

~25 new files, ~1400 lines redistributed, ~80 lines added (per-section frontmatter + app-reference links). One commit ("docs: restructure e2e-test-plan into per-section files") — atomic so reviewers can diff a single landing.
