# Plan — Comprehensive App Reference Documentation

## Goal

Produce master documentation for every UI screen / modal / cross-cutting concern in Rhozly, with two voices:

- **Role 1 — Senior developer**: full technical breakdown. Components touched, edge functions, data shapes (in + out), DB tables read/written, cron jobs, caching, RLS, all field meanings, tier gating, beta gating, error paths.
- **Role 2 — Expert gardener mentor**: every flow on the screen, why a user would do it, what insight it gives them, beginner-vs-expert framing, common pitfalls.

End state: a folder of standalone reference files plus a master index. Each file should be deep enough that a new developer or product person could pick it up cold and understand exactly how that surface works.

## Structure

```
docs/app-reference/
├── 00-INDEX.md            ← master list of every area, status tracker
├── _template.md           ← canonical file format
├── 01-onboarding/
├── 02-dashboard/
├── 03-garden-hub/
├── 04-planner/
├── 05-tools/
├── 06-account/
├── 07-management/
├── 08-modals-and-overlays/
└── 99-cross-cutting/        ← data model, edge functions, cron, caching, notifications
```

Each file follows the same template:

1. **Quick summary** (2–3 sentences, beginner-friendly)
2. **Role 1 — Technical** (components, props, DB tables, edge fns, cron, data formats, RLS, tier/beta gating, error paths, performance / caching)
3. **Role 2 — Expert gardener** (every flow on the page, why it matters, who it's for, common mistakes, tiered guidance)
4. **Related files** (cross-links to other reference docs)

## Approach (this commit)

This commit ships:

1. The folder structure (`docs/app-reference/`).
2. `00-INDEX.md` — master tracker listing every UI area I could identify from the codebase. Each line has a status checkbox (`[ ]` / `[x]`).
3. `_template.md` — canonical format every reference file should follow.
4. `02-dashboard/01-dashboard-tab.md` — the first complete file, at full depth, as the gold-standard sample to validate the format against.

After you've reviewed the sample:

- If the format is right, I'll batch through the remaining areas in priority order (you set the order).
- If the depth/structure needs changing, we revise the template once and then batch.

## Why this approach

Producing 60+ files of unknown depth blindly is wasteful — if the format isn't what you want, every file gets reworked. Validating one full-depth example first is the cheapest way to find that out.

## Process for the full job (after format approval)

1. Pick a folder (e.g. `02-dashboard/`) and batch produce every file inside it.
2. Type-check / verify no doc references broken paths.
3. Commit each folder as its own commit so progress is visible in git history.
4. After all UI areas are done, write the cross-cutting docs (data model, edge fns, cron, caching, notifications) since those benefit from having the individual screens documented first.

Expect this to take many sessions. Each folder is a meaningful chunk.
