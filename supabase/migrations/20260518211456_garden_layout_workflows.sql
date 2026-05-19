-- Garden Layout Workflows — Wave 9 + 10
-- 1. plan_id column on garden_shapes for Wave 9A plan filter
-- 2. garden_zones + garden_zone_shapes for Wave 9B watering/care zones
-- 3. garden_shape_notes for Wave 10A per-shape notes
-- 4. garden_shape_templates for Wave 10C user template library

-- ── 9A. Plan filter ───────────────────────────────────────────────────────────
ALTER TABLE public.garden_shapes
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_garden_shapes_plan ON public.garden_shapes(plan_id);

-- ── 9B. Care zones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.garden_zones (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  layout_id   uuid        NOT NULL REFERENCES public.garden_layouts(id) ON DELETE CASCADE,
  home_id     uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT 'Zone',
  colour      text        NOT NULL DEFAULT '#3b82f6',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garden_zones_layout ON public.garden_zones(layout_id);

CREATE TABLE IF NOT EXISTS public.garden_zone_shapes (
  zone_id   uuid NOT NULL REFERENCES public.garden_zones(id) ON DELETE CASCADE,
  shape_id  uuid NOT NULL REFERENCES public.garden_shapes(id) ON DELETE CASCADE,
  PRIMARY KEY (zone_id, shape_id)
);

ALTER TABLE public.garden_zones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_zone_shapes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_members_rw_garden_zones" ON public.garden_zones;
CREATE POLICY "home_members_rw_garden_zones"
  ON public.garden_zones FOR ALL TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "home_members_rw_garden_zone_shapes" ON public.garden_zone_shapes;
CREATE POLICY "home_members_rw_garden_zone_shapes"
  ON public.garden_zone_shapes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.garden_zones z
      WHERE z.id = zone_id
        AND z.home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.garden_zones z
      WHERE z.id = zone_id
        AND z.home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
    )
  );

-- ── 10A. Per-shape notes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.garden_shape_notes (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shape_id    uuid        NOT NULL REFERENCES public.garden_shapes(id) ON DELETE CASCADE,
  home_id     uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garden_shape_notes_shape ON public.garden_shape_notes(shape_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garden_shape_notes_home  ON public.garden_shape_notes(home_id);

ALTER TABLE public.garden_shape_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_members_rw_shape_notes" ON public.garden_shape_notes;
CREATE POLICY "home_members_rw_shape_notes"
  ON public.garden_shape_notes FOR ALL TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- ── 10C. Bed templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.garden_shape_templates (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                     text        NOT NULL,
  shape_type               text        NOT NULL,
  preset_id                text,
  colour                   text        NOT NULL DEFAULT '#4ade80',
  width_m                  numeric,
  height_m                 numeric,
  radius_m                 numeric,
  points                   jsonb,
  extrude_m                numeric,
  dashed                   boolean     NOT NULL DEFAULT false,
  suggested_plant_species  text[]      NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garden_shape_templates_user ON public.garden_shape_templates(user_id, created_at DESC);

ALTER TABLE public.garden_shape_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_rw_shape_templates" ON public.garden_shape_templates;
CREATE POLICY "owners_rw_shape_templates"
  ON public.garden_shape_templates FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
