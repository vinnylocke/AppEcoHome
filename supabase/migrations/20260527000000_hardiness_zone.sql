-- Add USDA Plant Hardiness Zone to homes.
-- Populated accurately by sync-weather after geocoding (Open-Meteo Climate API).
-- HomeManagement screen recalculates for existing homes that have lat/lng
-- but no zone yet (backfill on first visit).

ALTER TABLE public.homes
  ADD COLUMN IF NOT EXISTS hardiness_zone smallint;
