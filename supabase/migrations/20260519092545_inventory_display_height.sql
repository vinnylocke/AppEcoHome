-- Per-plant-instance display height for the 3D Garden Layout.
-- Lets users drag tokens vertically and adjust how tall the foliage sits above
-- the soil. Stored in metres, nullable (null = default of 0).
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS display_height_m numeric;
