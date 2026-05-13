-- Verdantly dual-provider integration
-- Adds verdantly_id + extra botanical columns to plants,
-- creates verdantly_cache table, and seeds the plant_providers config flag.

-- 1. Update source constraint to include 'verdantly'
ALTER TABLE public.plants DROP CONSTRAINT IF EXISTS plants_source_check;
ALTER TABLE public.plants ADD CONSTRAINT plants_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'api'::text, 'ai'::text, 'verdantly'::text]));

-- 2. Add Verdantly-specific columns to plants
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS verdantly_id         text,
  ADD COLUMN IF NOT EXISTS growth_habit         text,
  ADD COLUMN IF NOT EXISTS days_to_harvest_min  integer,
  ADD COLUMN IF NOT EXISTS days_to_harvest_max  integer,
  ADD COLUMN IF NOT EXISTS soil_ph_min          numeric(4,2),
  ADD COLUMN IF NOT EXISTS soil_ph_max          numeric(4,2),
  ADD COLUMN IF NOT EXISTS planting_instructions jsonb;

CREATE INDEX IF NOT EXISTS idx_plants_verdantly_id ON public.plants (verdantly_id);

-- 3. Verdantly response cache (mirrors species_cache pattern)
CREATE TABLE IF NOT EXISTS public.verdantly_cache (
  id          text        PRIMARY KEY,   -- Verdantly's native UUID string
  raw_data    jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verdantly_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny direct client access"
  ON public.verdantly_cache FOR ALL TO authenticated
  USING (false);

-- 4. Seed plant_providers config flag (allows toggling Verdantly off)
INSERT INTO public.app_config (key, value)
VALUES ('plant_providers', '{"enabled": ["perenual", "verdantly"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
