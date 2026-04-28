-- ============================================================
-- AILMENT WATCHLIST: invasive plants, pests, and diseases
-- ============================================================

-- 1. Core ailments table (home-scoped)
CREATE TABLE IF NOT EXISTS public.ailments (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id           uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  scientific_name   text,
  type              text        NOT NULL CHECK (type IN ('invasive_plant', 'pest', 'disease')),
  description       text        NOT NULL DEFAULT '',
  symptoms          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  affected_plants   text[]      NOT NULL DEFAULT '{}',
  prevention_steps  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  remedy_steps      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  source            text        NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('manual', 'perenual', 'ai')),
  perenual_id       integer,
  thumbnail_url     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ailments ENABLE ROW LEVEL SECURITY;

-- Members of the home can read ailments
DROP POLICY IF EXISTS "home_members_can_read_ailments" ON public.ailments;
CREATE POLICY "home_members_can_read_ailments"
  ON public.ailments FOR SELECT TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Members of the home can insert ailments
DROP POLICY IF EXISTS "home_members_can_insert_ailments" ON public.ailments;
CREATE POLICY "home_members_can_insert_ailments"
  ON public.ailments FOR INSERT TO authenticated
  WITH CHECK (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Members of the home can update ailments
DROP POLICY IF EXISTS "home_members_can_update_ailments" ON public.ailments;
CREATE POLICY "home_members_can_update_ailments"
  ON public.ailments FOR UPDATE TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Members of the home can delete ailments
DROP POLICY IF EXISTS "home_members_can_delete_ailments" ON public.ailments;
CREATE POLICY "home_members_can_delete_ailments"
  ON public.ailments FOR DELETE TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ailments_home_id ON public.ailments (home_id);
CREATE INDEX IF NOT EXISTS idx_ailments_type    ON public.ailments (home_id, type);


-- 2. Junction: plant instances linked to ailments
CREATE TABLE IF NOT EXISTS public.plant_instance_ailments (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_instance_id   uuid        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  ailment_id          uuid        NOT NULL REFERENCES public.ailments(id) ON DELETE CASCADE,
  home_id             uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  linked_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'resolved')),
  linked_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plant_instance_id, ailment_id)
);

ALTER TABLE public.plant_instance_ailments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_members_can_read_plant_instance_ailments"   ON public.plant_instance_ailments;
DROP POLICY IF EXISTS "home_members_can_insert_plant_instance_ailments" ON public.plant_instance_ailments;
DROP POLICY IF EXISTS "home_members_can_update_plant_instance_ailments" ON public.plant_instance_ailments;
DROP POLICY IF EXISTS "home_members_can_delete_plant_instance_ailments" ON public.plant_instance_ailments;

CREATE POLICY "home_members_can_read_plant_instance_ailments"
  ON public.plant_instance_ailments FOR SELECT TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "home_members_can_insert_plant_instance_ailments"
  ON public.plant_instance_ailments FOR INSERT TO authenticated
  WITH CHECK (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "home_members_can_update_plant_instance_ailments"
  ON public.plant_instance_ailments FOR UPDATE TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "home_members_can_delete_plant_instance_ailments"
  ON public.plant_instance_ailments FOR DELETE TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_pia_plant_instance  ON public.plant_instance_ailments (plant_instance_id);
CREATE INDEX IF NOT EXISTS idx_pia_ailment_id      ON public.plant_instance_ailments (ailment_id);
CREATE INDEX IF NOT EXISTS idx_pia_home_status     ON public.plant_instance_ailments (home_id, status);


-- 3. Extend task_blueprints with ailment tracking
ALTER TABLE public.task_blueprints
  ADD COLUMN IF NOT EXISTS ailment_id     uuid REFERENCES public.ailments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blueprint_type text NOT NULL DEFAULT 'plant'
    CHECK (blueprint_type IN ('plant', 'ailment'));

CREATE INDEX IF NOT EXISTS idx_task_blueprints_ailment_id ON public.task_blueprints (ailment_id)
  WHERE ailment_id IS NOT NULL;
