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
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  )
);

-- Write pattern (permission-aware)
CREATE POLICY "permitted members can insert/update"
ON <table> FOR INSERT WITH CHECK (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
      AND (
        role IN ('owner','editor')
        OR (permissions ->> '<permission_key>')::bool IS TRUE
      )
  )
);
```

---

## Role 1 — Technical Reference

### `home_members` join (the workhorse)

Every home-scoped table includes `home_id`. Policies join via subquery on `home_members` to verify the current user belongs.

### Permission-sensitive policies

For writes that require specific permissions (e.g. `shed.delete`), the policy uses:

```sql
WHERE user_id = auth.uid()
  AND (
    role = 'owner'                                    -- owners always
    OR (permissions ->> 'shed.delete')::bool IS TRUE
  )
```

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
