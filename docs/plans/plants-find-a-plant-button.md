# Plan — Rename "Add Plant" → "Find a plant" on the Plants page

**Problem:** The button on the Plants page reads *"Add Plant"* but actually opens BulkSearchModal — a search interface over the global plant database. The user has to search-then-pick before anything is added, so the label misleads.

**App-reference consulted:** [docs/app-reference/03-garden-hub/01-the-shed.md](docs/app-reference/03-garden-hub/01-the-shed.md), [docs/app-reference/08-modals-and-overlays/04-bulk-search-modal.md](docs/app-reference/08-modals-and-overlays/04-bulk-search-modal.md).

**Changes:**

1. [src/components/TheShed.tsx:1509-1512](src/components/TheShed.tsx#L1509-L1512) — `aria-label="Add plant"` → `aria-label="Find a plant"`, visible label `Add Plant` → `Find a plant`.
2. [tests/e2e/pages/ShedPage.ts:57](tests/e2e/pages/ShedPage.ts#L57) — `page.getByLabel("Add plant")` → `page.getByLabel("Find a plant")`.

**Bonus fix:** the previous deploy renamed the search input's aria-label from *"Search your plant library"* → *"Search your saved plants"* but the Page Object at [tests/e2e/pages/ShedPage.ts:52](tests/e2e/pages/ShedPage.ts#L52) still references the old label. Update it in the same change.

**Tests:** no E2E or unit spec asserts on the visible button text; only the Page Object's label selectors need updating. No docs changes needed (the reference describes the button function, not the literal label).

**Release notes:** "Improved" — bundles cleanly with a `--bump 1` deploy.
