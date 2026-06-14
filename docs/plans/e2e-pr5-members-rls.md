# PR 5 — E2E suite: Members & Permissions + DB-level RLS sweep

## Why this scope (not the full catalogue PR 5)

The catalogue's PR 5 line says "Members + Multi-home + RLS sweep (~40 tests)". That's the R2.09 (17 member tests) + R2.10 (8 multi-home tests) + R3.34 (11 RLS isolation tests). Way too much for one focused session.

This PR locks down the **security-critical contracts** with a tight 12-test net:

- **Members & Permissions UI** — 6 tests covering the owner self-protection rules and the permission editor surface. These are user-visible bugs (granting unintended access, demoting self by accident) with no current coverage.
- **DB-level RLS sweep** — 6 tests querying Supabase directly to verify each home-scoped table denies cross-home access. The existing `data-isolation.spec.ts` (13 tests) covers UI-level isolation; this complements with **DB-level** which is faster and catches policy bugs that wouldn't surface through a UI hide.

The remaining surface (granular permission editor 10-group expand, multi-home dropdown switching, leave/delete home flows, more RLS tables) is deferred to a focused follow-up.

## App-reference files consulted

- [`07-management/02-members-permissions.md`](../app-reference/07-management/02-members-permissions.md) — full members tab contract (roles, ROLE_DEFAULTS, resolvePermissions, permission keys, owner protections, remove flow).
- [`99-cross-cutting/19-rls-patterns.md`](../app-reference/99-cross-cutting/19-rls-patterns.md) — canonical RLS pattern (`home_members` join, `(SELECT auth.uid())` wrap, permission-aware writes); user-scoped tables (`chat_messages`); service-role bypass.
- [`99-cross-cutting/01-data-model-home.md`](../app-reference/99-cross-cutting/01-data-model-home.md) — confirms `home_members.permissions` jsonb shape.

## What we already have

- `tests/e2e/specs/data-isolation.spec.ts` (13 tests, "isolation" Playwright project) — UI-level cross-home isolation for plants, ailments, plans, blueprints, locations, tasks, inventory items. Runs serially under `--project=isolation` with worker 1's session viewing worker 2's seed UUIDs.
- `tests/e2e/fixtures/auth.ts` — single-worker auth fixture; PR 5 reuses it for the Members UI tests.

What's missing:
- Any Members UI tests at all
- DB-level RLS isolation for notes, chat_messages, weekly_overviews, home_seasonal_picks, plant_journals, automation_runs, etc.
- Owner self-protection coverage (demote, remove, role lockout)
- Permission persistence (DB write → read-back assertion)

## Scope — 12 tests across 2 new spec files

### `members-permissions.spec.ts` (NEW — 6 tests, UI-level)

| ID | Test | What it asserts |
|---|---|---|
| MEM-001 | Members tab lists the current user with an owner chip | Open `/home-management` → expand the seeded home → Members sub-tab → row visible with "Owner" badge for test1 |
| MEM-002 | Copy join code (home_id) writes the UUID to the clipboard | Click `home-mgmt-copy-join-code-{id}` → `navigator.clipboard.readText()` returns the seeded home UUID |
| MEM-003 | Permission editor expands inline with the 10 functional groups | Tap a member → permission editor mounts → each group heading visible (Shed, Areas & Locations, Tasks, etc.) |
| MEM-004 | Toggling a permission persists to `home_members.permissions` jsonb | Toggle `shed.delete` for a member → row in `home_members` updated → re-fetch shows the new value |
| MEM-005 | Owner cannot demote themselves to editor/viewer via the role select | The role select for the current user's row is disabled, or selecting a non-owner role is rejected with a toast |
| MEM-006 | Owner's own row does NOT render a "Remove member" trash button | Self-row in members list has no `home-mgmt-remove-{userId}` button |

### `rls-isolation-db.spec.ts` (NEW — 6 tests, DB-level)

These tests sign in as worker 1 (`test1@rhozly.com`) and try direct `supabase.from(...).select/insert/update/delete` operations against worker 2's seeded data. The expected result is **silent denial** (empty `data`, or `error.code = "PGRST116"` for required-row reads).

| ID | Test | What it asserts |
|---|---|---|
| RLS-001 | SELECT tasks for another home returns zero rows | Worker 1 queries `tasks` filtered by worker 2's `home_id` → 0 rows |
| RLS-002 | SELECT plants for another home returns zero rows | Same pattern for `plants` |
| RLS-003 | SELECT chat_messages where `user_id != auth.uid()` returns zero rows | Per-user table — worker 1 can't read worker 2's chat |
| RLS-004 | INSERT a task for another home is rejected | RLS denies the insert; error code `42501` or zero rows returned |
| RLS-005 | UPDATE another home's plant is rejected (no rows affected) | Update by id → returns empty result; the row stays unchanged when re-queried as worker 2 |
| RLS-006 | DELETE another home's blueprint is rejected (no rows affected) | Same pattern for `task_blueprints` |

Total: **12 tests** across **2 new spec files**.

## Page objects + utilities

- `HomeManagementPage.ts` — NEW. Locators for the management list, expand-home button, members sub-tab, member row, role select, permission toggle by key, copy-join-code button, remove-member button, expand-permission-editor button. Uses existing testids in `HomeManagement.tsx` where they exist; new testids added otherwise.

- `tests/e2e/utils/rlsAssertions.ts` — NEW. Two small helpers: `signInAs(workerIndex)` returns a fresh supabase-js client signed in as `testN@rhozly.com`; `otherHomeId(workerIndex)` returns the conventional UUID `0000000W-0000-0000-0000-000000000002` for any other worker. Used by `rls-isolation-db.spec.ts`.

## data-testid deltas required

Will scan during implementation. Expected additions to `HomeManagement.tsx`:

- `home-mgmt-members-tab` on the Members sub-tab content root
- `home-mgmt-member-row-{userId}` on each member row
- `home-mgmt-member-role-{userId}` on the role select
- `home-mgmt-permission-toggle-{userId}-{permissionKey}` on each permission checkbox
- `home-mgmt-copy-join-code-{homeId}` on the copy button
- `home-mgmt-remove-{userId}` on the remove button (when present)
- `home-mgmt-permission-editor-{userId}` on the expanded editor container

Existing testids I'll re-use: `home-mgmt-tab-members-{homeId}`, `home-mgmt-card-{homeId}`, `home-mgmt-add-btn`.

## Seed data

- All existing per-worker seeds are sufficient. Workers 1-4 each have isolated homes with the canonical UUID `0000000W-0000-0000-0000-000000000002`.
- For MEM-004 (permission persistence), worker 1 toggles a permission on their own seeded user — no new seed data needed.
- The DB-level RLS tests reference worker 2's seeded data IDs (plants `2000001`, blueprints, etc.) — no new seed work.

## Fixture / env

- Reuse the existing `authenticatedPage` fixture for the UI tests.
- The DB-level tests do NOT use a browser — they import `@supabase/supabase-js` directly and call REST endpoints. Same pattern the existing `chatSeedReset.ts` uses.

## Risks I've thought about

- **Service-role bypass risk** — the RLS tests must NOT accidentally use the service role key. They specifically test the publishable-key + authenticated-user path. The test util will fail loudly if a service-role client slips in.
- **The 10 permission groups (MEM-003)** — the UI might lazy-render groups on expand. If true, the test will expand each in turn instead of asserting all 10 visible at once. Will adjust during implementation.
- **`canViewAudit` permission** — separate from the `audit.view_all` permission key; documented in the role 1/2 docs. If they collide, will note in the plan and pick one.
- **Owner self-demote enforcement** — UI-only check vs DB-policy check. The DB might allow the update; UI prevents it. MEM-005 will assert at the UI level (role select disabled or rejected), not at the DB.
- **HomeManagement is large** (~1,300 lines per the testid scan above) — extracting testids needs care. Minimal additive edits only.

## What this does NOT do

- Doesn't test the role-default reset behaviour (R2-116 — changing role resets permissions) — needs a follow-up because of the destructive UI confirm.
- Doesn't test the multi-home dropdown switching (R2.10) — own focused PR.
- Doesn't test member realtime revocation (R2-124) — needs a multi-tab fixture.
- Doesn't test the leave-home or delete-home flows (R2-135, R2-136, R2-137) — destructive, needs careful seed setup.
- Doesn't sweep every RLS table from R3.34 — picks the 6 most security-critical (tasks/plants/chat for read; task/plant/blueprint for write). Notes, notifications, weekly_overviews, home_seasonal_picks, automation_runs deferred.
- Doesn't test inviting a second user into the home (R2-114 covers the copy, not the join). The join flow is already covered by PR 1's `home-setup-join.spec.ts`.

## Doc updates

- `docs/e2e-test-plan.md` — append Section 13b "Members & Permissions" and Section 99 "DB-level RLS sweep" with all 12 rows.
- `TESTING.md` — bump inventory (`members-permissions.spec.ts` (6) + `rls-isolation-db.spec.ts` (6)).
- The app-reference files for Members and RLS are already accurate; no updates needed.

## Acceptance criteria

- 12 / 12 new tests green under `--workers=1`.
- `tsc --noEmit` clean.
- Existing `data-isolation.spec.ts` regression — still green.
- Source `data-testid` additions only on elements the tests target.

---

**Plan ready for approval.** Reply "go ahead" / "looks good" / "yes" to approve, or call out which tests to drop/swap.
