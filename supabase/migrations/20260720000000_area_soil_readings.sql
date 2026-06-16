-- ============================================================
-- AREA SOIL READINGS — Phase 2 (2026-06-16)
--
-- Goal: per-area time-series for moisture / temp / EC, mirroring the
-- proven `area_lux_readings` (Wave 11) pattern.
--
-- Why three tables instead of one polymorphic table?
--   - Mirrors area_lux_readings exactly so the codebase has a single
--     pattern repeated, not two. Polymorphic would force a `metric`
--     column + a CHECK on units that would have grown weirdly as we
--     add new metrics.
--   - Per-metric indexes stay tight (each query is "this area, this
--     metric, recent N readings").
--
-- Sources:
--   `sensor` — fanned out from device_readings via the trigger below.
--   `manual` — user typed in via the Log Reading modal.
--   `plant`  — reserved for future "plant told us" inputs (AI infers
--               an area's moisture from how a plant is wilting, etc.).
--
-- Denormalised "latest" columns on `areas`:
--   The trigger keeps `areas.latest_soil_*` in sync with the most
--   recent reading across all sources. AI prompts + Care guides read
--   the column directly — no join against the time-series tables on
--   hot read paths. The time-series tables drive history charts only.
--
-- Data API grants on every new table per the 30-Oct-2026 deadline.
-- ============================================================

-- ── 1. AREA MOISTURE READINGS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.area_moisture_readings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id      uuid        NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  -- Soil volumetric water content as a percentage 0-100.
  value_pct    numeric     NOT NULL CHECK (value_pct >= 0 AND value_pct <= 100),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL DEFAULT 'sensor'
                           CHECK (source IN ('sensor', 'manual', 'plant')),
  -- Nullable FK back to the source device so we can group history by
  -- sensor when multiple sensors share an area.
  source_device_id uuid    REFERENCES public.devices(id) ON DELETE SET NULL
);

ALTER TABLE public.area_moisture_readings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_area_moisture_area
  ON public.area_moisture_readings (area_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_area_moisture_home
  ON public.area_moisture_readings (home_id);

DROP POLICY IF EXISTS "home_members_select_moisture" ON public.area_moisture_readings;
CREATE POLICY "home_members_select_moisture"
  ON public.area_moisture_readings FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "home_members_insert_moisture" ON public.area_moisture_readings;
CREATE POLICY "home_members_insert_moisture"
  ON public.area_moisture_readings FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "home_members_delete_moisture" ON public.area_moisture_readings;
CREATE POLICY "home_members_delete_moisture"
  ON public.area_moisture_readings FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

GRANT SELECT, INSERT, DELETE ON public.area_moisture_readings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_moisture_readings TO service_role;

-- ── 2. AREA TEMP READINGS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.area_temp_readings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id      uuid        NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  -- Soil temperature in Celsius. Display unit is per-device on the
  -- client; storage is always Celsius (same convention as the sensor
  -- pipeline).
  value_c      numeric     NOT NULL CHECK (value_c >= -50 AND value_c <= 80),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL DEFAULT 'sensor'
                           CHECK (source IN ('sensor', 'manual', 'plant')),
  source_device_id uuid    REFERENCES public.devices(id) ON DELETE SET NULL
);

ALTER TABLE public.area_temp_readings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_area_temp_area
  ON public.area_temp_readings (area_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_area_temp_home
  ON public.area_temp_readings (home_id);

DROP POLICY IF EXISTS "home_members_select_temp" ON public.area_temp_readings;
CREATE POLICY "home_members_select_temp"
  ON public.area_temp_readings FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "home_members_insert_temp" ON public.area_temp_readings;
CREATE POLICY "home_members_insert_temp"
  ON public.area_temp_readings FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "home_members_delete_temp" ON public.area_temp_readings;
CREATE POLICY "home_members_delete_temp"
  ON public.area_temp_readings FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

GRANT SELECT, INSERT, DELETE ON public.area_temp_readings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_temp_readings TO service_role;

-- ── 3. AREA EC READINGS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.area_ec_readings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id      uuid        NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  -- EC value. Unit depends on `source_kind`: calibrated_us_cm = µS/cm,
  -- raw_adc = uncalibrated ADC integer. Mirrors the device_readings
  -- ec_source discriminator so the UI can render the right unit.
  value        numeric     NOT NULL CHECK (value >= 0 AND value <= 100000),
  ec_source    text        NOT NULL DEFAULT 'calibrated_us_cm'
                           CHECK (ec_source IN ('calibrated_us_cm', 'raw_adc')),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL DEFAULT 'sensor'
                           CHECK (source IN ('sensor', 'manual', 'plant')),
  source_device_id uuid    REFERENCES public.devices(id) ON DELETE SET NULL
);

ALTER TABLE public.area_ec_readings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_area_ec_area
  ON public.area_ec_readings (area_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_area_ec_home
  ON public.area_ec_readings (home_id);

DROP POLICY IF EXISTS "home_members_select_ec" ON public.area_ec_readings;
CREATE POLICY "home_members_select_ec"
  ON public.area_ec_readings FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "home_members_insert_ec" ON public.area_ec_readings;
CREATE POLICY "home_members_insert_ec"
  ON public.area_ec_readings FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "home_members_delete_ec" ON public.area_ec_readings;
CREATE POLICY "home_members_delete_ec"
  ON public.area_ec_readings FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
  ));

GRANT SELECT, INSERT, DELETE ON public.area_ec_readings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_ec_readings TO service_role;

-- ── 4. DENORMALISED "LATEST" COLUMNS ON areas ────────────────────────────────

ALTER TABLE public.areas
  ADD COLUMN IF NOT EXISTS latest_soil_moisture_pct numeric,
  ADD COLUMN IF NOT EXISTS latest_soil_moisture_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_soil_temp_c numeric,
  ADD COLUMN IF NOT EXISTS latest_soil_temp_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_soil_ec numeric,
  ADD COLUMN IF NOT EXISTS latest_soil_ec_source text
    CHECK (latest_soil_ec_source IS NULL OR latest_soil_ec_source IN ('calibrated_us_cm', 'raw_adc')),
  ADD COLUMN IF NOT EXISTS latest_soil_ec_recorded_at timestamptz;

-- ── 5. FAN-OUT TRIGGER: device_readings → area_*_readings ────────────────────
--
-- On every soil-sensor device_readings insert, if the source device has
-- `area_id` set, mirror the relevant fields into the per-metric area
-- readings tables. We don't need to do this for older readings or for
-- valve events.
--
-- Wrapped as SECURITY DEFINER so it can write through RLS regardless
-- of which authenticated user / service-role inserted the original
-- device_reading row.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fanout_device_reading_to_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  dev_area_id    uuid;
  dev_type       text;
  v_moisture     numeric;
  v_temp         numeric;
  v_ec           numeric;
  v_ec_source    text;
BEGIN
  -- Pull the source device's area + type in one shot.
  SELECT area_id, device_type
    INTO dev_area_id, dev_type
    FROM public.devices
   WHERE id = NEW.device_id;

  IF dev_area_id IS NULL THEN
    -- Device not linked to an area — nothing to mirror.
    RETURN NEW;
  END IF;

  IF dev_type <> 'soil_sensor' THEN
    -- Valves don't have soil metrics.
    RETURN NEW;
  END IF;

  -- Pull each metric out of the jsonb. NULL when the key is missing
  -- (some firmware variants may not emit every field).
  v_moisture  := NULLIF(NEW.data->>'soil_moisture', '')::numeric;
  v_temp      := NULLIF(NEW.data->>'soil_temp', '')::numeric;
  v_ec        := NULLIF(NEW.data->>'soil_ec', '')::numeric;
  v_ec_source := COALESCE(NEW.data->>'ec_source', 'raw_adc');

  IF v_moisture IS NOT NULL AND v_moisture BETWEEN 0 AND 100 THEN
    INSERT INTO public.area_moisture_readings
      (home_id, area_id, value_pct, recorded_at, source, source_device_id)
    VALUES (NEW.home_id, dev_area_id, v_moisture, NEW.recorded_at, 'sensor', NEW.device_id);

    UPDATE public.areas
       SET latest_soil_moisture_pct         = v_moisture,
           latest_soil_moisture_recorded_at = NEW.recorded_at
     WHERE id = dev_area_id
       AND (latest_soil_moisture_recorded_at IS NULL
            OR latest_soil_moisture_recorded_at < NEW.recorded_at);
  END IF;

  IF v_temp IS NOT NULL AND v_temp BETWEEN -50 AND 80 THEN
    INSERT INTO public.area_temp_readings
      (home_id, area_id, value_c, recorded_at, source, source_device_id)
    VALUES (NEW.home_id, dev_area_id, v_temp, NEW.recorded_at, 'sensor', NEW.device_id);

    UPDATE public.areas
       SET latest_soil_temp_c           = v_temp,
           latest_soil_temp_recorded_at = NEW.recorded_at
     WHERE id = dev_area_id
       AND (latest_soil_temp_recorded_at IS NULL
            OR latest_soil_temp_recorded_at < NEW.recorded_at);
  END IF;

  IF v_ec IS NOT NULL AND v_ec BETWEEN 0 AND 100000 THEN
    INSERT INTO public.area_ec_readings
      (home_id, area_id, value, ec_source, recorded_at, source, source_device_id)
    VALUES (NEW.home_id, dev_area_id, v_ec, v_ec_source, NEW.recorded_at, 'sensor', NEW.device_id);

    UPDATE public.areas
       SET latest_soil_ec             = v_ec,
           latest_soil_ec_source      = v_ec_source,
           latest_soil_ec_recorded_at = NEW.recorded_at
     WHERE id = dev_area_id
       AND (latest_soil_ec_recorded_at IS NULL
            OR latest_soil_ec_recorded_at < NEW.recorded_at);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_device_reading_to_area ON public.device_readings;
CREATE TRIGGER trg_fanout_device_reading_to_area
  AFTER INSERT ON public.device_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.fanout_device_reading_to_area();

-- ── 6. MANUAL-ENTRY TRIGGERS: sync latest_ columns ──────────────────────────
--
-- When a user types a manual reading, the device-readings fan-out
-- doesn't fire. Add tiny triggers on each area_*_readings table so the
-- denormalised "latest" columns stay in sync for AI/Care-guide queries.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bump_area_latest_moisture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.areas
     SET latest_soil_moisture_pct         = NEW.value_pct,
         latest_soil_moisture_recorded_at = NEW.recorded_at
   WHERE id = NEW.area_id
     AND (latest_soil_moisture_recorded_at IS NULL
          OR latest_soil_moisture_recorded_at <= NEW.recorded_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_area_latest_moisture ON public.area_moisture_readings;
CREATE TRIGGER trg_bump_area_latest_moisture
  AFTER INSERT ON public.area_moisture_readings
  FOR EACH ROW EXECUTE FUNCTION public.bump_area_latest_moisture();

CREATE OR REPLACE FUNCTION public.bump_area_latest_temp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.areas
     SET latest_soil_temp_c           = NEW.value_c,
         latest_soil_temp_recorded_at = NEW.recorded_at
   WHERE id = NEW.area_id
     AND (latest_soil_temp_recorded_at IS NULL
          OR latest_soil_temp_recorded_at <= NEW.recorded_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_area_latest_temp ON public.area_temp_readings;
CREATE TRIGGER trg_bump_area_latest_temp
  AFTER INSERT ON public.area_temp_readings
  FOR EACH ROW EXECUTE FUNCTION public.bump_area_latest_temp();

CREATE OR REPLACE FUNCTION public.bump_area_latest_ec()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.areas
     SET latest_soil_ec             = NEW.value,
         latest_soil_ec_source      = NEW.ec_source,
         latest_soil_ec_recorded_at = NEW.recorded_at
   WHERE id = NEW.area_id
     AND (latest_soil_ec_recorded_at IS NULL
          OR latest_soil_ec_recorded_at <= NEW.recorded_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_area_latest_ec ON public.area_ec_readings;
CREATE TRIGGER trg_bump_area_latest_ec
  AFTER INSERT ON public.area_ec_readings
  FOR EACH ROW EXECUTE FUNCTION public.bump_area_latest_ec();

-- ── 7. COMMENTS ─────────────────────────────────────────────────────────────

COMMENT ON TABLE public.area_moisture_readings IS
  'Time-series soil moisture readings per area (Phase 2, 2026-06-16). Mirrors area_lux_readings. Populated from sensor (via fan-out trigger on device_readings) or manual (via Log Reading modal).';
COMMENT ON TABLE public.area_temp_readings IS
  'Time-series soil temperature readings per area (Phase 2, 2026-06-16). Always Celsius.';
COMMENT ON TABLE public.area_ec_readings IS
  'Time-series soil EC readings per area (Phase 2, 2026-06-16). ec_source discriminator distinguishes calibrated µS/cm (WH52) from raw ADC (WH51).';
COMMENT ON COLUMN public.areas.latest_soil_moisture_pct IS
  'Denormalised latest soil moisture %. Kept in sync by triggers on area_moisture_readings + the device_readings fan-out. Hot-read by AI prompts + Care guide eligibility queries (no join needed).';
