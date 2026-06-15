# 17. Global Layout & Navigation

**Spec file:** `tests/e2e/specs/layout.spec.ts`
**Seed dependencies:** `00_bootstrap.sql`
**App-reference:** [09-persistent-ui/](../app-reference/09-persistent-ui/)

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NAV-001 | ✅ | Sidebar collapse — hamburger hides nav labels | — | ✅ Passing |
| NAV-002 | ✅ | Sidebar expand — labels reappear | — | ✅ Passing |
| NAV-003 | ✅ | HomeDropdown shows "Test Garden Home" (not "Select Home") | — | ✅ Passing |
| NAV-004 | ✅ | HomeDropdown — "Create New Home" button visible | — | ✅ Passing |
| NAV-005 | ✅ | Mobile menu opens at 375×812 viewport (floating Menu FAB → panel) | — | ✅ Passing |
| NAV-006 | ✅ | Mobile menu link — "The Shed" → `/shed`, menu closes | — | ✅ Passing |
| NAV-007 | ✅ | All desktop sidebar links navigate to correct URL | — | ✅ Passing |
| NAV-008 | ✅ | HomeDropdown shows seeded home name as button label | — | ✅ Passing |
