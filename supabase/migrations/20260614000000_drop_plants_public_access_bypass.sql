-- Drop the `Public Access` + `Enable delete` permissive policies on
-- `plants` and `plant_instances`. They were carried over from an early
-- demo phase (introduced in `20260403181555_update_inventory_and_tasks.sql`)
-- and granted every authenticated user full read + write + delete on
-- every other home's plants regardless of the proper home_members RLS.
--
-- Caught by the PR 5 RLS sweep (tests/e2e/specs/rls-isolation-db.spec.ts):
-- when a test1 session queried `plants` filtered by test2's home_id, RLS
-- returned 9 rows from test2's home. The `home_members`-scoped policy
-- ("Users can read global and their home plants") is correct on its own,
-- but Postgres OR-combines permissive policies, so the qual=true policy
-- silently overrode the proper one.
--
-- After this migration:
--   • `plants` keeps "Users can read global and their home plants" (SELECT),
--     "Users can insert plants for their homes" (INSERT),
--     "Users can update plants for their homes" (UPDATE), and
--     "Users can delete plants for their homes" (DELETE). All four already
--     contain the canonical `home_members` join — see
--     `99-cross-cutting/19-rls-patterns.md`.
--   • `plant_instances` is left with no surviving policy. The table is
--     currently empty (0 rows on local + production confirmation) and is
--     a legacy of the pre-`inventory_items` data model. Future writes go
--     through `inventory_items`, which has its own proper RLS. If the
--     table needs revived, add proper home-members-scoped policies — do
--     not restore the open ones.
--
-- The DROP IF EXISTS form is idempotent — if the migration was already
-- applied or the policy was already absent, it no-ops cleanly.

DROP POLICY IF EXISTS "Public Access"             ON public.plants;
DROP POLICY IF EXISTS "Enable delete for users"   ON public.plants;
DROP POLICY IF EXISTS "Public Access"             ON public.plant_instances;
DROP POLICY IF EXISTS "Enable delete for instances" ON public.plant_instances;
