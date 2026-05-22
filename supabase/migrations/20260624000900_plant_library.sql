-- ─── Plant Library ──────────────────────────────────────────────────────────
--
-- A self-populating global plant knowledge base. Seeded daily by the
-- `seed-plant-library` edge fn (AI proposes plants → AI generates care
-- guide → Wikipedia thumbnail), then independently verified by
-- `verify-plant-library` (Wikipedia + GBIF cross-check).
--
-- Mirrors the existing `plants` schema with the per-home / per-provider /
-- fork fields stripped, plus a verification lifecycle:
--   valid         null  →  not verified yet
--   valid = true        →  AI's data matched the online sources
--   valid = false       →  fields were amended; sources column lists the
--                          URLs + licences used during correction
--
-- Dedup is enforced by `plants_library_sci_key_idx` over the
-- generated `scientific_name_key`. Seeding uses INSERT … ON CONFLICT
-- DO NOTHING so AI repeats are silent + cheap.

CREATE TABLE IF NOT EXISTS public.plant_library (
  id                   bigserial PRIMARY KEY,

  -- ── Identity ──
  common_name          text NOT NULL,
  scientific_name      jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_names          jsonb NOT NULL DEFAULT '[]'::jsonb,
  family               text,
  plant_type           text,

  -- ── Visual ──
  image_url            text,
  thumbnail_url        text,

  -- ── Care ──
  cycle                text,
  watering             text,
  watering_benchmark   jsonb,
  watering_min_days    integer,
  watering_max_days    integer,
  sunlight             jsonb NOT NULL DEFAULT '[]'::jsonb,
  care_level           text,
  hardiness_min        text,
  hardiness_max        text,
  growth_rate          text,
  growth_habit         text,
  maintenance          text,
  maintenance_notes    text,

  -- ── Safety / edibility ──
  is_edible            boolean DEFAULT false,
  is_toxic_pets        boolean DEFAULT false,
  is_toxic_humans      boolean DEFAULT false,
  edible_leaf          boolean DEFAULT false,
  cuisine              boolean DEFAULT false,
  medicinal            boolean DEFAULT false,
  thorny               boolean DEFAULT false,

  -- ── Botanical traits ──
  attracts             jsonb NOT NULL DEFAULT '[]'::jsonb,
  origin               jsonb NOT NULL DEFAULT '[]'::jsonb,
  description          text,
  cones                boolean DEFAULT false,
  drought_tolerant     boolean DEFAULT false,
  salt_tolerant        boolean DEFAULT false,
  flowers              boolean DEFAULT false,
  flowering_season     jsonb NOT NULL DEFAULT '[]'::jsonb,
  fruits               boolean DEFAULT false,
  harvest_season       jsonb NOT NULL DEFAULT '[]'::jsonb,
  indoor               boolean DEFAULT false,
  invasive             boolean DEFAULT false,
  leaf                 boolean DEFAULT true,
  seeds                boolean DEFAULT false,
  tropical             boolean DEFAULT false,
  pest_susceptibility  jsonb NOT NULL DEFAULT '[]'::jsonb,
  propagation          jsonb NOT NULL DEFAULT '[]'::jsonb,
  pruning_count        jsonb NOT NULL DEFAULT '{}'::jsonb,
  pruning_month        jsonb NOT NULL DEFAULT '[]'::jsonb,
  soil                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  soil_ph_min          numeric(4,2),
  soil_ph_max          numeric(4,2),
  days_to_harvest_min  integer,
  days_to_harvest_max  integer,
  dimensions           jsonb NOT NULL DEFAULT '{}'::jsonb,
  planting_instructions jsonb,

  -- ── Verification lifecycle ──
  valid                boolean,
  sources              jsonb,
  seeded_at            timestamptz NOT NULL DEFAULT now(),
  verified_at          timestamptz,
  seeded_by_run_id     uuid,
  verified_by_run_id   uuid,

  -- ── Generated dedup key ──
  scientific_name_key  text GENERATED ALWAYS AS (
    lower(trim(both from regexp_replace(
      COALESCE(NULLIF((scientific_name->>0), ''), common_name),
      '\s+', ' ', 'g'
    )))
  ) STORED
);

COMMENT ON TABLE public.plant_library IS
  'Global AI-seeded + Wikipedia/GBIF-verified plant knowledge base. Read-only for users; written only by seed/verify edge fns via service role.';
COMMENT ON COLUMN public.plant_library.valid IS
  'null = not verified yet; true = AI data matched the verification sources; false = fields were amended (see sources).';
COMMENT ON COLUMN public.plant_library.sources IS
  'Array of { url, title, source, licence, accessed_at } populated when verification amended one or more fields.';

CREATE UNIQUE INDEX IF NOT EXISTS plant_library_sci_key_idx
  ON public.plant_library (scientific_name_key);

-- Drives the "next batch to verify" query — partial index so the
-- planner picks it for the common-case `verified_at IS NULL` lookup.
CREATE INDEX IF NOT EXISTS plant_library_unverified_idx
  ON public.plant_library (seeded_at)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS plant_library_valid_idx
  ON public.plant_library (valid)
  WHERE valid IS NOT NULL;

-- RLS — every authenticated user can read; writes via service role only.
ALTER TABLE public.plant_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_library read" ON public.plant_library;
CREATE POLICY "plant_library read"
  ON public.plant_library
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── Plant Library Runs ─────────────────────────────────────────────────────
--
-- One row per seed / verify run. Drives the admin UI's running totals
-- and recent-runs table. Cron runs leave `triggered_by` null; admin
-- triggers store the user id.

CREATE TABLE IF NOT EXISTS public.plant_library_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                     text NOT NULL CHECK (kind IN ('seed', 'verify')),
  triggered_by             uuid REFERENCES auth.users(id),
  count_requested          integer NOT NULL,
  count_inserted           integer NOT NULL DEFAULT 0,
  count_skipped            integer NOT NULL DEFAULT 0,
  count_matched            integer NOT NULL DEFAULT 0,
  count_amended            integer NOT NULL DEFAULT 0,
  count_failed             integer NOT NULL DEFAULT 0,
  started_at               timestamptz NOT NULL DEFAULT now(),
  finished_at              timestamptz,
  status                   text NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  error_message            text
);

CREATE INDEX IF NOT EXISTS plant_library_runs_started_idx
  ON public.plant_library_runs (started_at DESC);

-- Only admins read run history.
ALTER TABLE public.plant_library_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_library_runs admin read" ON public.plant_library_runs;
CREATE POLICY "plant_library_runs admin read"
  ON public.plant_library_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

-- Now that the runs table exists, add the FKs from plant_library back to it.
ALTER TABLE public.plant_library
  ADD CONSTRAINT plant_library_seeded_by_run_fkey
    FOREIGN KEY (seeded_by_run_id) REFERENCES public.plant_library_runs(id) ON DELETE SET NULL,
  ADD CONSTRAINT plant_library_verified_by_run_fkey
    FOREIGN KEY (verified_by_run_id) REFERENCES public.plant_library_runs(id) ON DELETE SET NULL;
