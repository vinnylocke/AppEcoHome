# 20. Shopping Lists

**Spec files:** `tests/e2e/specs/shopping.spec.ts` · `tests/e2e/specs/shopping-edge-cases.spec.ts`
**Page Object:** `tests/e2e/pages/ShoppingPage.ts`
**Seed dependencies:** `12_shopping_lists.sql`
**App-reference:** [03-garden-hub/](../app-reference/03-garden-hub/) (shopping tab)

**Mocks required:**
- `**/en.wikipedia.org/api/rest_v1/**` → `{ extract: "A useful plant.", thumbnail: null }`
- `**/functions/v1/search-plants-ai` → canned AI results array
- `**/functions/v1/verdantly-search` → `{ results: [{ id: "v1", common_name: "Tomato", ... }] }`

## Page structure

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHP-001 | ✅ | "Shopping Lists" heading visible | — | ✅ Passing |
| SHP-002 | ✅ | Seeded "Weekly Garden Shop" appears | — | ✅ Passing |
| SHP-003 | ✅ | Completed section collapsed by default; `shopping-completed-section-toggle` visible | — | ✅ Passing |
| SHP-004 | ✅ | Expanding completed shows "Last Week's Shop" | — | ✅ Passing |
| SHP-005 | ✅ | `shopping-new-list-btn` creates a list + toast | — | ✅ Passing |

## Card interactions

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHP-006 | ✅ | Expanding card shows item rows | — | ✅ Passing |
| SHP-007 | ✅ | Checking item increments x/y count | — | ✅ Passing |
| SHP-008 | ✅ | Rename via kebab menu | — | ✅ Passing |
| SHP-009 | ✅ | Mark Complete moves to completed section | — | ✅ Passing |
| SHP-010 | ✅ | Reopen returns to active | — | ✅ Passing |
| SHP-011 | ❌ | Delete requires double-tap confirmation | — | ✅ Passing |

## Add Item — plant + shed search

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHP-012 | ✅ | `shopping-add-item-btn-{id}` opens `shopping-add-item-sheet` | — | ✅ Passing |
| SHP-013 | ✅ | Plant tab is default | — | ✅ Passing |
| SHP-014 | ✅ | Typing name shows shed search results | — | ✅ Passing |
| SHP-015 | ✅ | Shed result preview (`shopping-add-plant-confirm`) | — | ✅ Passing |
| SHP-016 | ✅ | Confirming shed result adds item | — | ✅ Passing |
| SHP-017 | ✅ | "Search All Sources" button appears | — | ✅ Passing |

## Unified search (AI + Verdantly + Perenual)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHP-018 | ✅ | Search All Sources shows AI / Verdantly / Perenual sections | Wikipedia + AI + Verdantly | ✅ Passing |
| SHP-019 | ✅ | Info button on AI result expands Wikipedia accordion | Wikipedia | ✅ Passing |
| SHP-020 | ✅ | Clicking Perenual result opens preview | Verdantly | ✅ Passing |
| SHP-021 | ✅ | Confirming Perenual result adds item | Verdantly | ✅ Passing |
| SHP-022 | ✅ | Shed offer appears after adding plant | — | ✅ Passing |
| SHP-023 | ✅ | Skipping shed offer closes sheet | — | ✅ Passing |

## Product tab

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHP-024 | ✅ | Product tab adds a product item | — | ✅ Passing |
| SHP-025 | ❌ | Product — category required | — | ✅ Passing |

## Add Purchased Plants to Shed

Seed state: "Weekly Garden Shop" has "Tomato Seedlings" (checked, `source=null`, eligible) and "Mint" (checked, `source='shed'`, excluded).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHP-026 | ✅ | `shopping-add-to-shed-btn-{id}` visible in expanded active list | — | ✅ Passing |
| SHP-027 | ❌ | Shed-sourced plant excluded from count ("Add 1 Purchased Plant" not "Add 2") | — | ✅ Passing |
| SHP-028 | ✅ | Click → toast → button hides | — | ✅ Passing |

## Edge cases (PR 6)

**Spec file:** `tests/e2e/specs/shopping-edge-cases.spec.ts`

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHOP-E-001 | ✅ | Add Item sheet renders both Plant + Product tabs | — | ✅ Passing |
| SHOP-E-002 | ✅ | Product tab — name + category + confirm controls | — | ✅ Passing |
| SHOP-E-003 | ✅ | Completed section toggle renders with seeded completed list | — | ✅ Passing |
| SHOP-E-004 | ✅ | Add-to-Shed button surfaces with seeded pre-checked plants | — | ✅ Passing |
