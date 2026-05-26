# Enable `security_invoker` on `seed_packets_with_germination` view

## Problem

Supabase Studio flags `seed_packets_with_germination` as "Restricted". It's a Postgres VIEW (not a table), defined in [`20260624000500_nursery.sql:123`](supabase/migrations/20260624000500_nursery.sql#L123). By default, views run with the **definer's** privileges (typically the postgres superuser), which BYPASSES RLS on the underlying `seed_packets` and `seed_sowings` tables. That's the security warning.

The underlying tables already have proper home-member RLS policies in the same migration. We just need the view to evaluate the caller's permissions, not the definer's.

## Fix

One-line migration: `ALTER VIEW public.seed_packets_with_germination SET (security_invoker = true);`

This is a Postgres 15+ feature — Supabase runs PG 15/16, so it's available. With it enabled, queries against the view enforce the calling user's RLS on the underlying tables. No change to the view's SELECT clause; no change to existing policies.

## File

- `supabase/migrations/20260527000000_seed_packets_view_security_invoker.sql` — NEW, one ALTER statement.

## Risks

- None — this tightens security, doesn't loosen it. The view already exposed `seed_packets` data without RLS enforcement; enabling `security_invoker` means home members see only their own packets (which is what the underlying table policies already enforce on direct queries).
- The Nursery UI already queries with the user's auth context, so behaviour is identical — just safer.

## Steps

1. Write the migration.
2. Apply locally.
3. Push to remote (with confirmation per CLAUDE.md).
4. No code deploy needed — it's a DB-only change.
