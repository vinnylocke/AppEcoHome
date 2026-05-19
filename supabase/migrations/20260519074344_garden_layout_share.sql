-- Garden Layout — public share link
-- Adds a random share_token column to garden_layouts and RLS policies that
-- allow anonymous SELECT on layouts (and their shapes) whose token is set.

ALTER TABLE public.garden_layouts
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_garden_layouts_share_token
  ON public.garden_layouts(share_token)
  WHERE share_token IS NOT NULL;

-- Anonymous (public) read of layouts that have a share token.
DROP POLICY IF EXISTS "anon_read_shared_layouts" ON public.garden_layouts;
CREATE POLICY "anon_read_shared_layouts"
  ON public.garden_layouts FOR SELECT TO anon
  USING (share_token IS NOT NULL);

-- Anonymous read of shapes belonging to a shared layout.
DROP POLICY IF EXISTS "anon_read_shared_shapes" ON public.garden_shapes;
CREATE POLICY "anon_read_shared_shapes"
  ON public.garden_shapes FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.garden_layouts gl
      WHERE gl.id = garden_shapes.layout_id
        AND gl.share_token IS NOT NULL
    )
  );
