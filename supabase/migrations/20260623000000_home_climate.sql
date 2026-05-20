-- ============================================================
-- HOME CLIMATE (Mobile Quick Access Wave 3)
--
-- Per-home climate row holding:
--   1. AI-derived frost dates (cached, 6-month TTL, refreshed by the
--      `lookup_frost_dates` action of the plant-doctor edge fn).
--   2. User-configurable rain-advice thresholds used by the
--      RainWaterAdvice tile on the Localized Task Calendar.
--
-- One row per home. Created lazily on first frost-date lookup OR on first
-- save of rain thresholds in Climate Settings. `hardiness_zone` stays on
-- the existing `homes` table (managed by Climate Settings UI).
--
-- Idempotent — safe to re-run via `supabase migration up`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.home_climate (
  home_id                 uuid PRIMARY KEY REFERENCES public.homes(id) ON DELETE CASCADE,

  -- AI-derived fields (lookup_frost_dates action writes; refreshed when
  -- last_frost_lookup_at is NULL or > 180 days old).
  last_frost_iso          date,
  first_frost_iso         date,
  growing_season_days     int,
  notes                   text,
  last_frost_lookup_at    timestamptz,

  -- User-editable rain-advice thresholds (defaults from the existing
  -- waterlog/dryness rules in _shared/weatherRules/).
  rain_skip_mm            numeric NOT NULL DEFAULT 5
    CHECK (rain_skip_mm >= 0),
  rain_water_mm           numeric NOT NULL DEFAULT 1
    CHECK (rain_water_mm >= 0),

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Skip threshold should be >= water threshold; otherwise the advice
  -- logic doesn't make sense.
  CONSTRAINT rain_thresholds_consistent CHECK (rain_skip_mm >= rain_water_mm)
);

COMMENT ON TABLE public.home_climate IS
  'Per-home climate cache + settings — frost dates (AI-fetched, 6mo TTL) and rain-advice thresholds (user-editable in Climate Settings).';

-- Keep updated_at fresh on row updates.
CREATE OR REPLACE FUNCTION public.touch_home_climate_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS home_climate_set_updated_at ON public.home_climate;
CREATE TRIGGER home_climate_set_updated_at
  BEFORE UPDATE ON public.home_climate
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_home_climate_updated_at();

-- ============================================================
-- RLS
-- Members of the home can SELECT. Members can INSERT/UPDATE the
-- user-editable threshold columns via Climate Settings. Edge functions
-- run as service role and bypass RLS for the AI-derived fields.
-- ============================================================

ALTER TABLE public.home_climate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their home climate" ON public.home_climate;
CREATE POLICY "Members can view their home climate"
  ON public.home_climate
  FOR SELECT
  TO authenticated
  USING (public.is_home_member(home_id));

DROP POLICY IF EXISTS "Members can insert their home climate" ON public.home_climate;
CREATE POLICY "Members can insert their home climate"
  ON public.home_climate
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_home_member(home_id));

DROP POLICY IF EXISTS "Members can update their home climate" ON public.home_climate;
CREATE POLICY "Members can update their home climate"
  ON public.home_climate
  FOR UPDATE
  TO authenticated
  USING (public.is_home_member(home_id))
  WITH CHECK (public.is_home_member(home_id));

-- No DELETE policy — rows are removed only by the ON DELETE CASCADE
-- from homes (when a home itself is deleted).
