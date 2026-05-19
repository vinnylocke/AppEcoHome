-- Per-plant-instance display geometry for the Garden Layout.
-- Lets users drag and resize plant tokens within a linked shape.
-- All three columns are nullable — null = auto-grid layout (current behaviour).
-- x/y are in metres, relative to the shape's local coordinates (the same
-- coordinate system as garden_shapes.{x_m, y_m}).

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS display_x_m    numeric,
  ADD COLUMN IF NOT EXISTS display_y_m    numeric,
  ADD COLUMN IF NOT EXISTS display_size_m numeric CHECK (display_size_m IS NULL OR display_size_m > 0);
