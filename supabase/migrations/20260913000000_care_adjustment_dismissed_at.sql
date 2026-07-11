-- Garden Brain — record WHEN a care adjustment was dismissed.
--
-- The 14-day dismissal cooldown (`_shared/adaptiveCare.ts` inCooldown) keyed off
-- `created_at`, but a proposal can sit open (nightly-refreshed) for weeks before
-- the user dismisses it. So a proposal created 20 days ago and dismissed today
-- was already past the 14-day window by `created_at` → re-proposed (and
-- re-notified) the very next night, ignoring the dismissal (bug-audit-2026-07-10
-- #19). `dismissed_at` lets the cooldown key off the dismissal moment instead.
--
-- Nullable; set by the client dismiss path (src/lib/careAdjustments.ts) and read
-- by the reconciler. Existing dismissed rows keep NULL and fall back to
-- created_at (their cooldowns have long since lapsed — harmless).

ALTER TABLE public.care_adjustments
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- care_adjustments already GRANTs SELECT, UPDATE to authenticated (2026-09-10
-- migration); a new column is covered by the table-level grant, no change needed.
