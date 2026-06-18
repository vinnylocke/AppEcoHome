-- ─── Ailment Library — Phase 1 (2026-06-18) ────────────────────────────────
--
-- A self-populating global catalogue of pests / diseases / invasives /
-- disorders, mirroring `plant_library`. Seeded by the `seed-ailment-library`
-- edge fn (AI proposes ailments not already in the DB + fills full detail).
-- Read-only for users; written only by the seeder via service role.
--
-- Dedup by the generated `name_key` (unique). Seeding uses INSERT … ON CONFLICT
-- DO NOTHING so AI repeats are silent + cheap. See docs/plans/ailment-library.md.

CREATE TABLE IF NOT EXISTS public.ailment_library (
  id                   bigserial PRIMARY KEY,

  -- ── Identity ──
  name                 text NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('pest', 'disease', 'invasive', 'disorder')),
  scientific_name      text,
  aliases              jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── Knowledge ──
  description          text,
  symptoms             jsonb NOT NULL DEFAULT '[]'::jsonb,
  causes               text,
  treatment            text,
  prevention           text,
  severity             text CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  affected_plant_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_families    jsonb NOT NULL DEFAULT '[]'::jsonb,
  season               jsonb NOT NULL DEFAULT '[]'::jsonb,
  organic_friendly     boolean,

  -- ── Visual ──
  image_url            text,
  thumbnail_url        text,

  -- ── Provenance / verification lifecycle ──
  source               text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'perenual', 'manual')),
  valid                boolean,
  sources              jsonb,
  seeded_at            timestamptz NOT NULL DEFAULT now(),
  verified_at          timestamptz,
  seeded_by_run_id     uuid,
  verified_by_run_id   uuid,

  -- ── Generated dedup key ──
  name_key             text GENERATED ALWAYS AS (
    lower(trim(both from regexp_replace(name, '\s+', ' ', 'g')))
  ) STORED
);

COMMENT ON TABLE public.ailment_library IS
  'Global AI-seeded catalogue of pests/diseases/invasives/disorders. Read-only for users; written only by seed/verify edge fns via service role.';

CREATE UNIQUE INDEX IF NOT EXISTS ailment_library_name_key_idx
  ON public.ailment_library (name_key);
CREATE INDEX IF NOT EXISTS ailment_library_kind_idx ON public.ailment_library (kind);
CREATE INDEX IF NOT EXISTS ailment_library_unverified_idx
  ON public.ailment_library (seeded_at) WHERE verified_at IS NULL;

ALTER TABLE public.ailment_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ailment_library read" ON public.ailment_library;
CREATE POLICY "ailment_library read" ON public.ailment_library
  FOR SELECT TO authenticated USING (true);

-- Data-API grants (RLS still gates rows). SELECT only for clients; writes are
-- service-role.
GRANT SELECT ON TABLE public.ailment_library TO authenticated;

-- ─── Ailment Library Runs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ailment_library_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL DEFAULT 'seed' CHECK (kind IN ('seed', 'verify')),
  triggered_by      uuid REFERENCES auth.users(id),
  count_requested   integer NOT NULL,
  count_inserted    integer NOT NULL DEFAULT 0,
  count_skipped     integer NOT NULL DEFAULT 0,
  count_failed      integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  error_message     text,
  model             text,
  total_cost_usd    numeric NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);

ALTER TABLE public.ailment_library_runs ENABLE ROW LEVEL SECURITY;
-- Admin-only read (mirrors plant_library_runs visibility); writes service-role.
DROP POLICY IF EXISTS "ailment_library_runs admin read" ON public.ailment_library_runs;
CREATE POLICY "ailment_library_runs admin read" ON public.ailment_library_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE uid = auth.uid() AND is_admin = true));

GRANT SELECT ON TABLE public.ailment_library_runs TO authenticated;
