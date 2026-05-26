-- Make the seed_packets_with_germination VIEW respect the caller's RLS.
--
-- By default, Postgres views run with the definer's privileges
-- (typically postgres superuser), which bypasses RLS on the underlying
-- tables. Supabase Studio flags such views as "Restricted" because
-- they could expose data across home boundaries.
--
-- The underlying tables (seed_packets, seed_sowings) already have
-- proper home-member RLS policies. Enabling security_invoker on the
-- view makes it evaluate those policies against the caller's user_id
-- instead of the definer's — so the view sees exactly what the user
-- could see via direct table queries.
--
-- Postgres 15+ feature (Supabase runs PG 15/16).

ALTER VIEW public.seed_packets_with_germination SET (security_invoker = true);
