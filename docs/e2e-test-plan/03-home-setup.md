# 3. Home Setup Wizard

**Spec files:** `tests/e2e/specs/home-setup-create.spec.ts` · `tests/e2e/specs/home-setup-join.spec.ts`
**Page Object:** `tests/e2e/pages/HomeSetupPage.ts`
**Fixture:** `tests/e2e/fixtures/no-home-yet.ts` — mocks `user_profiles` (home_id null) + `home_members` (empty) so the wizard renders.
**Seed dependencies:** `00_bootstrap.sql` (auth user only — wizard data fully mocked)
**App-reference:** [01-onboarding/06-home-setup.md](../app-reference/01-onboarding/06-home-setup.md)

## Create New Home

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| R1-001 | ✅ | Create tile routes to create step → form visible, name field auto-focused | profile reads | ✅ Passing |
| R1-002 | ✅ | Back arrow returns to selection | profile reads | ✅ Passing |
| R1-003 | ❌ | Required fields block submit — no RPC fires | RPC capture | ✅ Passing |
| R1-004 | ✅ | Hemisphere chip flips on country change — select AU → "Southern" | profile reads | ✅ Passing |
| R1-005 | ✅ | Postcode is uppercased before RPC (`cr3 5ed` → `CR3 5ED`) | `create_new_home` RPC | ✅ Passing |
| R1-006 | ✅ | Successful create fires `sync-weather` with the new home_id | RPC + `sync-weather` | ✅ Passing |
| R1-007 | ❌ | RPC failure surfaces banner, stays on create step | RPC error | ✅ Passing |
| R1-008 | ✅ | Submit disabled in flight (delayed RPC) | delayed RPC | ✅ Passing |
| R1-009 | ❌ | `sync-weather` failure does not block onHomeCreated | RPC + weather error | ✅ Passing |

## Join Existing Home

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| R2-001 | ✅ | Join tile routes to join step → Home ID input visible | profile reads | ✅ Passing |
| R2-002 | ✅ | Back arrow returns to selection | profile reads | ✅ Passing |
| R2-003 | ❌ | Empty input blocks submit — no profile PATCH | PATCH capture | ✅ Passing |
| R2-004 | ❌ | Whitespace-only input rejected | PATCH capture | ✅ Passing |
| R2-005 | ❌ | Invalid UUID format → generic banner (POST `home_members` 400 / 22P02) | POST error | ✅ Passing |
| R2-006 | ❌ | Unknown UUID / no RLS → generic banner (no existence leak) | POST error 403 | ✅ Passing |
| R2-007 | ❌ | Already-a-member duplicate → generic banner | POST error 409 | ✅ Passing |
| R2-008 | ✅ | Successful join PATCHes `user_profiles.home_id` with target | POST 201 + PATCH | ✅ Passing |
| R2-009 | ✅ | Whitespace in pasted ID is trimmed | POST + PATCH | ✅ Passing |
| R2-010 | ✅ | `sync-weather` NOT fired on join | track `sync-weather` | ✅ Passing |
| R2-011 | ✅ | Error clears after retry (failed → success POST → resubmit → no banner) | POST error → success | ✅ Passing |
| R2-012 | ✅ | Tab order is input → submit | — | ✅ Passing |
| R2-013 | ✅ | Submit disabled in flight | delayed POST | ✅ Passing |
| R2-014 | ✅ | Input state persists when returning to join step | — | ✅ Passing |
