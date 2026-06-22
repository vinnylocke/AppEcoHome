# 28. Head Gardener

**Spec file:** `tests/e2e/specs/head-gardener.spec.ts`
**Page Object:** `tests/e2e/pages/HeadGardenerPage.ts`
**Seed dependencies:** `14_head_gardener.sql` (confirmed Garden Brief + cached Estate Report + 2 continuity-log entries). Test account is `evergreen` (set in `00_bootstrap.sql`), so the `head_gardener` gate passes.
**App-reference:** [02-dashboard/16-head-gardener.md](../app-reference/02-dashboard/16-head-gardener.md)

**Mocks required** (AI runs server-side; Playwright can't intercept Gemini — so the edge functions are stubbed):
- `**/functions/v1/garden-manager-report` → canned `{ locked, cached, report }`
- `**/functions/v1/head-gardener-chat` → canned `{ reply }`
- `**/functions/v1/insights-feed` → canned `{ summary, insights: [] }`

The Year Plan tab and the continuity log read the seeded DB rows directly (no mock).

## Page structure & tabs

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| HG-001 | ✅ | `/manager` renders "Head Gardener" heading + tab bar | report/chat/insights | ✅ Passing |
| HG-002 | ✅ | Overview renders the report — headline, section, gap | garden-manager-report | ✅ Passing |
| HG-003 | ✅ | Overview continuity log shows seeded open item "Fill the winter colour gap" | — (seeded) | ✅ Passing |
| HG-004 | ✅ | Brief tab shows the seeded confirmed brief ("Grow my own food") | — (seeded) | ✅ Passing |
| HG-005 | ✅ | Year Plan tab shows seeded plan item "Succession-sow lettuce and rocket" | — (seeded) | ✅ Passing |
| HG-006 | ✅ | Insights tab embeds the unified feed (summary visible) | insights-feed | ✅ Passing |
| HG-007 | ✅ | Ask tab — sending a message returns a grounded reply | head-gardener-chat | ✅ Passing |

## Notes / future coverage

- **Tier gate (negative):** a non-Evergreen account should see the upgrade nudge on `/manager`. Not yet automated (would require a second seeded account at a lower tier).
- **Brief AI draft:** the "Draft my brief for me" path (empty-brief state → `synthesize-garden-brief`) isn't covered because the seed account already has a confirmed brief. Add a dedicated empty-brief fixture/account to cover it.
- **Log reconciliation:** the deterministic "gap closed → acted" flow is unit-tested at the logic level (`supabase/tests/managerLog.test.ts`); an end-to-end reconcile is not E2E-covered.
