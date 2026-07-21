# RLS — Policy Patterns

> Every home-scoped table is gated by Row Level Security policies. The canonical pattern uses `home_members` to verify membership; permission-sensitive writes additionally check the `permissions` jsonb.

---

## Quick Summary

```sql
-- Read pattern (most tables)
CREATE POLICY "home members can read"
ON <table> FOR SELECT
USING (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = (SELECT auth.uid())
  )
);

-- Write pattern (permission-aware)
CREATE POLICY "permitted members can insert/update"
ON <table> FOR INSERT WITH CHECK (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = (SELECT auth.uid())
      AND (
        role IN ('owner','editor')
        OR (permissions ->> '<permission_key>')::bool IS TRUE
      )
  )
);
```

### Wrap `auth.uid()` as `(SELECT auth.uid())` — mandatory

**Every new policy must wrap `auth.uid()` calls inside `(SELECT auth.uid())`.** This is the Supabase-documented best practice and is enforced across all 158 policies in this codebase (rewritten in migration `20260627010000_scalability_wave_a.sql`).

The unwrapped form re-evaluates `auth.uid()` per row checked. The wrapped form is hoisted by the optimizer and evaluated once per query, regardless of how many rows the policy scans. For tables with thousands of rows this is a 10× CPU difference.

If a future policy uses bare `auth.uid()`, the rewrite migration's DO block is idempotent and can be re-applied to normalise it — but better to write it correctly first time.

---

## Role 1 — Technical Reference

### `home_members` join (the workhorse)

Every home-scoped table includes `home_id`. Policies join via subquery on `home_members` to verify the current user belongs.

### Permission-sensitive policies

For writes that require specific permissions (e.g. `shed.delete`), the policy shape is:

```sql
WHERE user_id = auth.uid()
  AND (
    role = 'owner'                                    -- owners always
    OR (permissions ->> 'shed.delete')::bool IS TRUE
  )
```

**Caveat — current enforcement reality:** only `tasks.view_members` and `audit.view_all` are actually permission-enforced in RLS today. Every other permission key (`shed.delete` included) is enforced **client-side only** — a member with a session token could bypass those keys via direct PostgREST calls. Flagged as open item 6.1 in [docs/plans/bug-audit-2026-07-02.md](../../plans/bug-audit-2026-07-02.md); the pattern above is the template to use when a key is promoted to RLS.

**Client `can()` is the only spatial-key guard — and now three surfaces rely on it.** The `locations` / `areas` tables' RLS gates only home *membership* (the canonical `home_members` subquery), not the `locations.create` / `locations.edit` / `locations.delete` / `areas.create` / `areas.delete` keys. Those keys are enforced purely by `usePermissions().can(...)` at the call sites, and there are now **three** such surfaces:

1. **LocationManager (`/management`)** and **2. the home garden grid's inline add/manage** (`GardenOverviewGrid`'s `home-add-location-btn` + each card's `LocationManageMenu`) — added in the stats+locations redesign Stage 4b (2026-07-20). These two **share one DB path** (`src/lib/locationMutations.ts`, deliberately permission-agnostic: it returns the raw `{ error }` and the `can()` guard lives in the callers), so they can never drift.
3. **The LocationPage drill-in (`?locationId=`)** — Stage 5 (2026-07-20) made it the area **edit host**. Its writes **hand-roll** direct `supabase.from("locations").update(...)` / `supabase.from("areas").delete()` (not via `locationMutations.ts`), and Stage 5 **closed a verified permission leak**: the env-toggle (`handleToggleEnvironment`, `locations.edit`) and per-area delete (`handleConfirmDeleteArea`, `areas.delete`) were previously **ungated** and are now gated at BOTH the handler and the rendered control; it also gained an `areas.create`-gated inline Add-Area Wizard.

All three gate identically — a viewer sees no add button, no manage kebab, no environment toggle (read-only badge) and no trash; a member can create + edit but not delete — but a session token could still bypass any of the three UIs via direct PostgREST. So **any promotion of the `locations.*` / `areas.*` keys to RLS must cover all three surfaces at once.** See [Members & Permissions](../07-management/02-members-permissions.md) + [Home (Main Dashboard)](../02-dashboard/17-home-main.md) + [Location Page (Drill-In)](../02-dashboard/07-location-page.md).

### `inventory_items` — migrated to the canonical pattern

Until migration `20260827000000_inventory_items_rls_home_members.sql`, `inventory_items` was the outlier: its policy trusted `user_profiles.home_id` (the user's own "currently active home" pointer) instead of `home_members`. Two failures: (1) a removed member's profile still pointed at the home, so a kicked member kept full read/write/delete over the entire shed until they switched homes; (2) a legitimate member of a second home couldn't see that home's shed unless it was their active profile home (broke `multiple_homes`). The policy is now the canonical `home_members` membership subquery (`home_members_can_manage_inventory`, `FOR ALL` with matching `USING` / `WITH CHECK`, `(SELECT auth.uid())` wrapped).

### Source-aware global-row policy (`plants` table)

The `plants` table is special: it allows `home_id IS NULL` rows as global catalogue entries (Perenual API + AI catalogue). The UPDATE policy must permit normal write paths while preventing users from tampering with the new global AI catalogue (Wave 1 of AI Plant Overhaul, migration `20260620000100`):

```sql
CREATE POLICY "Users can update plants for their homes"
  ON plants
  FOR UPDATE
  TO authenticated
  USING (
    home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
    -- Global non-AI plants (Perenual etc.) stay user-writable.
    -- AI globals are locked down — only service_role + SECURITY DEFINER RPCs can update.
    OR (home_id IS NULL AND source <> 'ai')
  )
  WITH CHECK (
    home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
    OR (home_id IS NULL AND source <> 'ai')
  );
```

The exclusion ensures the stale-check cron's regenerations + the SECURITY DEFINER RPCs (`fork_ai_plant_for_home`, `reset_ai_plant_fork`, `revert_ai_plant_fork_in_place`) are the only paths that can modify global AI rows. RPCs use `SECURITY DEFINER` so they bypass the user's RLS context, but each verifies caller membership via `home_members` before doing anything destructive. `revert_ai_plant_fork_in_place` was added in Wave 6 as the in-place alternative to `reset_ai_plant_fork`'s "delete + repoint inventory" behaviour, suitable for today's data model where TheShed reads plants by `home_id` and so a deletion would make the plant vanish from the shed.

### Wave 1 RLS policies for new AI catalogue tables

| Table | Policy | Access |
|-------|--------|--------|
| `plant_care_revisions` | `Read care revisions` | Authenticated users can SELECT if they can read the parent plant. No client INSERT / UPDATE / DELETE — only service_role (cron) or SECURITY DEFINER RPCs. |
| `user_plant_ack` | `Own ack rows` | Per-user. `user_id = auth.uid()` on all operations. |
| `ai_plant_manual_refresh_log` | `Own refresh log rows` | Per-user. Clients only SELECT (history view). Writes go through the `manual_refresh_ai_plant` edge function with service role. |

This lets the home owner grant per-action overrides via the Members & Permissions tab.

### Optional FK columns under home-scoped RLS (`plant_journals` example)

A home-scoped table's RLS gates on `home_id` membership, not on any other FK. This means an optional FK like `plant_journals.inventory_item_id` can be `NULL` without breaking the policy — home members can SELECT / INSERT / UPDATE / DELETE rows whether the FK is set or not:

```sql
-- The existing plant_journals policy (from migration 20260415110152):
CREATE POLICY "Users can manage journals for their home"
  ON plant_journals FOR ALL
  USING (
    home_id IN (
      SELECT home_id FROM user_profiles WHERE uid = auth.uid()
      UNION
      SELECT home_id FROM home_members WHERE user_id = auth.uid()
    )
  );
```

This is the pattern that made [Quick Capture Journal](../02-dashboard/11-quick-capture-journal.md) (Mobile Quick Access Wave 4) ship without a migration — `inventory_item_id` was already nullable and the policy already supported unassigned rows. Surfaces that need to filter by FK do so in their query (`.eq("inventory_item_id", instanceId)` or `.is("inventory_item_id", null)`); RLS continues to enforce the home boundary regardless.

### User-scoped tables

Some tables are per-user, not per-home (e.g. `plant_doctor_sessions`, `chat_messages`, `user_devices`):

```sql
USING (user_id = auth.uid())
```

### Storage bucket RLS

Each bucket has its own RLS policies that mirror the table-level pattern.

### Service-role bypass

Edge functions running with the service role key bypass RLS. Used for:
- `delete-account` cascading purge.
- Cron jobs writing per-user data.
- Admin-only tools.

**Because the service role bypasses RLS, a service-role edge function MUST authorise the caller itself** — RLS won't do it. The canonical order for any function that takes a user-supplied `homeId` (bug-audit-2026-07-10 #3/#4/#10/#13/#14):

```ts
const auth = await requireAuth(req, db);                 // 401 if no/invalid JWT
if (auth instanceof Response) return auth;
const memErr = await requireHomeMembership(db, homeId, auth.user.id);  // 403 if not a member
if (memErr) return memErr;
const aiGate = await guardAiByHome(db, homeId);          // 403 if the home's tier lacks AI
if (aiGate) return aiGate;
await enforceRateLimit(db, auth.user.id, FN);            // rate-limit the CALLER
```

Key rules: **`guardAiByHome` is a TIER gate only, not an authz gate** — it checks the *owner's* tier, so it must be paired with `requireHomeMembership` (which authorises the *caller*), never used alone. It fails **closed** on an unknown home (no owner row → 403). When a function reads a specific child row by id (e.g. `predict-yield`'s `instance_id`), also verify that row's `home_id` matches the authorised home — membership alone doesn't stop a member of home A pairing A's `homeId` with B's `instance_id`. Admin-only writers (e.g. `add-plant-to-library`) add `requireAdmin` after `requireAuth`. **Cron `verify_jwt=false` fleet paths** (no user body) are a separate concern — see the cron-secret follow-up in the bug audit.

### Public tables (rare)

- `app_settings` (maintenance flag) — public read.
- `release_notes` — public read.

### Test data

E2E tests use 4 distinct accounts (`test1@rhozly.com` ... `test4@rhozly.com`) with fixed UUIDs. Seeds run via `npm run test:seed`. RLS ensures each test runs in isolation.

### Common RLS pitfalls

- **Forgetting RLS on a new table:** silent data leak. Always enable + add policy.
- **`USING` vs `WITH CHECK`:** USING gates reads + UPDATE matching; WITH CHECK gates INSERT/UPDATE new values.
- **Recursive policies:** RLS on `home_members` itself must be careful not to recurse.

---

## Role 2 — Expert Gardener's Guide

### Why RLS matters

It's the wall between you and other users' data. Even if a bug accidentally requested all rows, RLS filters to "only what you can see".

### Implications

- Multi-home users only see homes they belong to.
- Viewers see data but can't change it.
- Permissions can be tuned per member.
- Even admins can't see other accounts' data through the normal client (service role required for support cases).

---

## Related reference files

- [Members & Permissions Tab](../07-management/02-members-permissions.md)
- [Data Model — Homes](./01-data-model-home.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_rls*.sql` (multiple)
- `src/lib/permissions.ts` (client mirror)
