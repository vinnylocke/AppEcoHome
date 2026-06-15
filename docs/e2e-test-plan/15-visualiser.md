# 15. Plant Visualiser

**Spec file:** `tests/e2e/specs/visualiser.spec.ts`
**Page Object:** `tests/e2e/pages/VisualiserPage.ts`
**Seed dependencies:** `02_plants_shed.sql`
**App-reference:** [05-tools/](../app-reference/05-tools/)

> **Note:** Camera/AR tests (actual overlay, capture) require headed mode + camera permission. Flag with `test.skip()` in CI and treat as manual checks.

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| VIS-001 | ✅ | `/visualiser` heading | — | ✅ Passing |
| VIS-002 | ✅ | Plant list renders selectable cards | — | ✅ Passing |
| VIS-003 | ✅ | Empty state — clean account | — | ✅ Passing |
| VIS-004 | ✅ | Plant selection toggle | — | ✅ Passing |
| VIS-005 | ✅ | Deselect plant | — | ✅ Passing |
| VIS-006 | ✅ | Search filters list ("Basil") | — | ✅ Passing |
| VIS-007 | ✅ | Source filter ("Manual") | — | ✅ Passing |
| VIS-008 | ✅ | Open Visualiser enabled with selection | — | ✅ Passing |
| VIS-009 | ❌ | Open Visualiser disabled / absent without selection | — | ✅ Passing |
| VIS-010 | ✅ | Nav link → `/visualiser` | — | ✅ Passing |
