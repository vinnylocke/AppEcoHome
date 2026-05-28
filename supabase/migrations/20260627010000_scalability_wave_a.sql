-- Scalability Wave A — Database fundamentals
--
-- Findings addressed (per docs/scalability-audit.md):
--   1.1  Wrap bare auth.uid() → (SELECT auth.uid()) across all RLS policies
--   1.2  Rewrite plant_journals RLS to use is_member_of() (drops UNION subquery)
--   1.3  Add missing plant_journals.inventory_item_id index
--   1.4  Revoke over-permissive plant_journals grants from anon (TRUNCATE etc.)
--   1.8  Add missing home_id indexes on visualiser_captures, garden_zones
--        (chat_feedback / release_notes / home_climate were in the audit but
--        don't have a home_id column or already have it as PK — corrected here)
--
-- Safety: all changes are additive or semantically equivalent. The RLS
-- wrap is a pure performance optimisation (Supabase-documented best
-- practice). The plant_journals policy rewrite uses the existing
-- is_member_of() function which already performs the union check
-- server-side via SECURITY DEFINER.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Missing indexes (additive — zero risk)
-- ─────────────────────────────────────────────────────────────────────────

-- plant_journals: per-instance journal lookups hit a seq scan today
CREATE INDEX IF NOT EXISTS plant_journals_inventory_item_id_idx
  ON public.plant_journals (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

-- home-scoped indexes for tables that have home_id but no index on it
CREATE INDEX IF NOT EXISTS idx_visualiser_captures_home_id
  ON public.visualiser_captures (home_id);

CREATE INDEX IF NOT EXISTS idx_garden_zones_home_id
  ON public.garden_zones (home_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. plant_journals: tighten anon grants (defense-in-depth)
-- ─────────────────────────────────────────────────────────────────────────
-- RLS already gates row access, but TRUNCATE / REFERENCES / TRIGGER to anon
-- are over-broad. SELECT/INSERT/UPDATE/DELETE remain because the app
-- relies on them via the authenticated role (RLS gates the rows).

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.plant_journals FROM anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. plant_journals: replace UNION-subquery RLS with is_member_of()
-- ─────────────────────────────────────────────────────────────────────────
-- The original policy ran a UNION of user_profiles.home_id + home_members.home_id
-- per row, with bare auth.uid(). is_member_of() does the same check inside a
-- SECURITY DEFINER function — Postgres can inline + optimise it more
-- aggressively, and the policy text is simpler to audit.

DROP POLICY IF EXISTS "Users can manage journals for their home"
  ON public.plant_journals;

CREATE POLICY "Users can manage journals for their home"
  ON public.plant_journals
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (is_member_of(home_id));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Wrap all bare auth.uid() → (SELECT auth.uid()) in remaining policies
-- ─────────────────────────────────────────────────────────────────────────
-- Programmatic rewrite: walk pg_policies for the public schema, detect
-- policies containing bare auth.uid() in either qual or with_check, drop
-- and recreate with every occurrence wrapped as (SELECT auth.uid()).
--
-- Why programmatic: 40+ policies across 21 migrations. Manual enumeration
-- is error-prone and brittle to future drift. This DO block can be
-- re-run safely (idempotent) and any new policy created with bare
-- auth.uid() in the future can be normalised by re-applying.

DO $migration$
DECLARE
  pol         RECORD;
  new_qual    text;
  new_check   text;
  role_list   text;
  policy_def  text;
  rewrote     int := 0;
BEGIN
  FOR pol IN
    SELECT
      schemaname, tablename, policyname,
      permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~ 'auth\.uid\(\)'
        OR coalesce(with_check, '') ~ 'auth\.uid\(\)'
      )
  LOOP
    new_qual  := coalesce(pol.qual, '');
    new_check := coalesce(pol.with_check, '');

    -- 3-pass rewrite: marker → unwrap-existing → wrap-uniformly.
    -- Avoids double-wrapping when a policy already partially uses (SELECT auth.uid()).
    new_qual  := regexp_replace(new_qual,  'auth\.uid\(\)', '__AUID__', 'g');
    new_check := regexp_replace(new_check, 'auth\.uid\(\)', '__AUID__', 'g');

    new_qual  := regexp_replace(new_qual,  '\(\s*SELECT\s+__AUID__\s*\)', '__AUID__', 'g');
    new_check := regexp_replace(new_check, '\(\s*SELECT\s+__AUID__\s*\)', '__AUID__', 'g');

    new_qual  := regexp_replace(new_qual,  '__AUID__', '(SELECT auth.uid())', 'g');
    new_check := regexp_replace(new_check, '__AUID__', '(SELECT auth.uid())', 'g');

    -- Skip if nothing changed (already wrapped everywhere)
    IF new_qual  = coalesce(pol.qual, '')
       AND new_check = coalesce(pol.with_check, '') THEN
      CONTINUE;
    END IF;

    role_list := array_to_string(pol.roles, ', ');

    EXECUTE format('DROP POLICY %I ON %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);

    policy_def := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      pol.policyname, pol.schemaname, pol.tablename,
      pol.permissive, pol.cmd, role_list
    );

    IF nullif(new_qual, '') IS NOT NULL THEN
      policy_def := policy_def || ' USING (' || new_qual || ')';
    END IF;

    IF nullif(new_check, '') IS NOT NULL THEN
      policy_def := policy_def || ' WITH CHECK (' || new_check || ')';
    END IF;

    EXECUTE policy_def;

    rewrote := rewrote + 1;
    RAISE NOTICE 'Rewrote %.% (cmd=%, roles=%)',
                 pol.tablename, pol.policyname, pol.cmd, role_list;
  END LOOP;

  RAISE NOTICE 'Wave A: rewrote % RLS policies with wrapped auth.uid()', rewrote;
END
$migration$;
