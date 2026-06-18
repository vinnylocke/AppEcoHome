-- Stable plant care-range metadata (2026-06-18)
--
-- Store ideal soil moisture / EC / temperature ranges per species so the AI
-- Area Coach reasons from fixed ground-truth values instead of re-deriving them
-- each run (which made the numbers drift). Populated by the plant-library AI
-- seeder (plantSeedPrompt). Additive + nullable — degrades to the model's
-- estimate where a species has no stored range yet.

ALTER TABLE public.plant_library
  ADD COLUMN IF NOT EXISTS soil_moisture_min numeric,
  ADD COLUMN IF NOT EXISTS soil_moisture_max numeric,
  ADD COLUMN IF NOT EXISTS soil_ec_min       numeric,
  ADD COLUMN IF NOT EXISTS soil_ec_max       numeric,
  ADD COLUMN IF NOT EXISTS soil_temp_min     numeric,
  ADD COLUMN IF NOT EXISTS soil_temp_max     numeric;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS soil_moisture_min numeric,
  ADD COLUMN IF NOT EXISTS soil_moisture_max numeric,
  ADD COLUMN IF NOT EXISTS soil_ec_min       numeric,
  ADD COLUMN IF NOT EXISTS soil_ec_max       numeric,
  ADD COLUMN IF NOT EXISTS soil_temp_min     numeric,
  ADD COLUMN IF NOT EXISTS soil_temp_max     numeric;
