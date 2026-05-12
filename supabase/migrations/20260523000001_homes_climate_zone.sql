-- Add climate zone and approximate frost dates to homes.
-- Values are derived from lat/lng at home-creation time by the edge function
-- using _shared/climateZones.ts.  This migration backfills existing rows via
-- a simplified latitude-band calculation so nothing is left NULL.

ALTER TABLE public.homes
  ADD COLUMN IF NOT EXISTS climate_zone    text,
  ADD COLUMN IF NOT EXISTS frost_first_date date,
  ADD COLUMN IF NOT EXISTS frost_last_date  date;

-- Backfill existing homes that have a lat value.
-- Uses the same band thresholds as _shared/climateZones.ts.
UPDATE public.homes
SET
  climate_zone = CASE
    WHEN ABS(lat) <= 23.5 THEN 'tropical'
    WHEN ABS(lat) <= 30   THEN 'subtropical'
    WHEN ABS(lat) <= 37   THEN 'mediterranean'
    WHEN ABS(lat) <= 44   THEN 'warm_temperate'
    WHEN ABS(lat) <= 52   THEN 'cool_temperate'
    WHEN ABS(lat) <= 60   THEN 'continental'
    WHEN ABS(lat) <= 67   THEN 'subarctic'
    ELSE                       'arctic'
  END,
  frost_first_date = CASE
    -- Tropical / subtropical: no frost
    WHEN ABS(lat) <= 30   THEN NULL
    -- Southern hemisphere: 6-month offset
    WHEN lat < 0 THEN (
      MAKE_DATE(EXTRACT(YEAR FROM now())::int,
        CASE
          WHEN ABS(lat) <= 37 THEN 6
          WHEN ABS(lat) <= 44 THEN 5
          WHEN ABS(lat) <= 52 THEN 4  -- shifted Nov→May
          WHEN ABS(lat) <= 60 THEN 3
          WHEN ABS(lat) <= 67 THEN 3
          ELSE                    2
        END,
        1
      )
    )
    -- Northern hemisphere
    ELSE (
      MAKE_DATE(EXTRACT(YEAR FROM now())::int,
        CASE
          WHEN ABS(lat) <= 37 THEN 12
          WHEN ABS(lat) <= 44 THEN 11
          WHEN ABS(lat) <= 52 THEN 10
          WHEN ABS(lat) <= 60 THEN 9
          WHEN ABS(lat) <= 67 THEN 9
          ELSE                    8
        END,
        1
      )
    )
  END,
  frost_last_date = CASE
    WHEN ABS(lat) <= 30   THEN NULL
    WHEN lat < 0 THEN (
      MAKE_DATE(EXTRACT(YEAR FROM now())::int,
        CASE
          WHEN ABS(lat) <= 37 THEN 8
          WHEN ABS(lat) <= 44 THEN 10
          WHEN ABS(lat) <= 52 THEN 11
          WHEN ABS(lat) <= 60 THEN 11
          WHEN ABS(lat) <= 67 THEN 12
          ELSE                    1
        END,
        28
      )
    )
    ELSE (
      MAKE_DATE(EXTRACT(YEAR FROM now())::int,
        CASE
          WHEN ABS(lat) <= 37 THEN 2
          WHEN ABS(lat) <= 44 THEN 4
          WHEN ABS(lat) <= 52 THEN 4
          WHEN ABS(lat) <= 60 THEN 5
          WHEN ABS(lat) <= 67 THEN 6
          ELSE                    7
        END,
        28
      )
    )
  END
WHERE lat IS NOT NULL;
