# Duplicate weekly email

## Problem

A user received **two identical copies** of the weekly digest email.

## Root cause

`weekly-digest` (cron `weekly-digest-monday`, Mondays 08:00 UTC) dedupes recipients *within a
run* (combined = one email per address; per-home has a distinct subject), so two identical
emails mean **the function ran twice** — and it has **no idempotency guard** (no "already sent
this week" tracking). A duplicate invocation re-sends the whole digest. Causes that produce a
second invocation: a stray duplicate `cron.job` row, a pg_net retry, or a manual run alongside
the cron. (`weekly-optimise-digest` only writes in-app `notifications`, not email, so it's not
a second emailer.)

## Fix (mirror the automation-dup CAS approach)

A **per-week run claim**:

1. **Migration** `weekly_digest_runs (week_iso text PK, ran_at timestamptz)` — server-only.
2. **`weekly-digest/index.ts`** — right after computing `monday`, atomically claim the week:
   `upsert({ week_iso: monday }, { onConflict: "week_iso", ignoreDuplicates: true }).select()`.
   If 0 rows come back, the week is already claimed → **return early** (no send). A second
   invocation thus sends nothing.
3. On a **top-level error**, delete the claim so the next invocation can retry — the
   per-recipient send loops already swallow individual failures, so a total failure means
   few/no emails went out and retrying is safe.

`monday` + the supabase client move just above the `try` so the `catch` can release the claim.

## Belt-and-suspenders

The migration history shows a single cron jobname, but a stray duplicate could exist in
production `cron.job`. Worth a glance in Supabase → Database → Cron; the idempotency guard
fixes the symptom regardless.

## Verify

`deno check` + Deno suite. The claim is atomic (PK + `ignoreDuplicates`), so concurrent
invocations are race-safe.
