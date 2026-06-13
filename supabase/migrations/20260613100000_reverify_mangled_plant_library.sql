-- One-shot backfill: requeue rows mangled by the pre-fix `verify-plant-library`.
--
-- Context: the old verifier had two bugs (now fixed in
-- `verify-plant-library/index.ts` + `helpers.ts`):
--   1. amended `flowering_season` / `harvest_season` with month names
--      ("June", "July") instead of season words ("summer")
--   2. shrank multi-value array fields (`propagation`, `attracts`,
--      `pest_susceptibility`, `sunlight`, `soil`) down to whatever a single
--      source happened to mention
--
-- This migration finds rows showing either symptom and clears their
-- verification state so the next cron tick re-processes them under the new
-- contracts. The actual data columns are LEFT IN PLACE — the new
-- `pickAllowedUpdates` non-shrink guard compares incoming amendments to the
-- current row, so leaving the existing values helps it reject sparse re-shrinks.
--
-- Plan: docs/plans/reverify-mangled-plant-library-rows.md
--
-- Safety:
--   • Guarded on `plant_library` existing (this migration was authored after
--     the table was created; the guard is defensive against fresh-DB ordering
--     surprises).
--   • Idempotent — re-running matches zero rows because the reset takes the
--     matched rows out of every detection criterion.
--   • On a fresh DB, both criteria match zero rows because no verifier has
--     ever amended anything. No-op until the cron has produced amendments.
--   • A single RAISE NOTICE reports the reset count so the migration log
--     makes the impact visible.

DO $$
DECLARE
  v_reset_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'plant_library'
  ) THEN
    RAISE NOTICE 'plant_library not yet created — backfill deferred (no rows to reset).';
    RETURN;
  END IF;

  WITH targets AS (
    SELECT id
    FROM public.plant_library
    WHERE
      -- Skip rows already queued — they don't need resetting.
      verified_at IS NOT NULL
      AND (
        -- ── Criterion A: any non-season value in a season field ──────────
        -- The seeder writes only {spring, summer, autumn, winter}; anything
        -- else came from the buggy verifier. We tolerate empty arrays + null.
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(flowering_season, '[]'::jsonb)) AS s
          WHERE lower(trim(s)) NOT IN ('spring', 'summer', 'autumn', 'winter')
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(harvest_season, '[]'::jsonb)) AS s
          WHERE lower(trim(s)) NOT IN ('spring', 'summer', 'autumn', 'winter')
        )
        -- ── Criterion B: amended row where ≥2 multi-value arrays shrank
        -- to exactly one element. Single-element on its own is plausible
        -- (a fern's `propagation` = ["spore"], a houseplant's `sunlight`
        -- = ["part shade"]) — the conjunction across multiple fields is
        -- not, and matches the shrinking-amendment fingerprint. ────────
        OR (
          valid = false
          AND (
            CASE WHEN jsonb_array_length(coalesce(propagation,         '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
            CASE WHEN jsonb_array_length(coalesce(attracts,            '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
            CASE WHEN jsonb_array_length(coalesce(pest_susceptibility, '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
            CASE WHEN jsonb_array_length(coalesce(sunlight,            '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
            CASE WHEN jsonb_array_length(coalesce(soil,                '[]'::jsonb)) = 1 THEN 1 ELSE 0 END
          ) >= 2
        )
      )
  ),
  reset AS (
    UPDATE public.plant_library AS pl
    SET
      verified_at           = NULL,
      valid                 = NULL,
      verification_attempts = 0,
      verification_error    = NULL,
      sources               = NULL,
      verified_by_run_id    = NULL
    FROM targets t
    WHERE pl.id = t.id
    RETURNING pl.id
  )
  SELECT count(*) INTO v_reset_count FROM reset;

  RAISE NOTICE 'reverify-mangled-plant-library: reset % rows for re-verification', v_reset_count;
END $$;
