-- Add structured metadata column to plants for storing provider-specific care data
-- Used by Verdantly plants to drive harvest-check blueprint auto-creation and AI planting schedule enrichment.
ALTER TABLE public.plants ADD COLUMN IF NOT EXISTS plant_metadata jsonb;
