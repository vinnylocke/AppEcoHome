-- ============================================================
-- PLAN REFERENCE PHOTOS (Phase 2 Wave 2 Pass 3)
-- A plan can have many reference / inspiration / progress photos
-- attached to it — separate from `plans.cover_image_url`, which is
-- the single hero image used on the plan card.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_photos (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id     uuid        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  home_id     uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  photo_url   text        NOT NULL,
  caption     text,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_members_can_read_plan_photos"   ON public.plan_photos;
DROP POLICY IF EXISTS "home_members_can_insert_plan_photos" ON public.plan_photos;
DROP POLICY IF EXISTS "home_members_can_update_plan_photos" ON public.plan_photos;
DROP POLICY IF EXISTS "home_members_can_delete_plan_photos" ON public.plan_photos;

CREATE POLICY "home_members_can_read_plan_photos"
  ON public.plan_photos FOR SELECT TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "home_members_can_insert_plan_photos"
  ON public.plan_photos FOR INSERT TO authenticated
  WITH CHECK (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "home_members_can_update_plan_photos"
  ON public.plan_photos FOR UPDATE TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "home_members_can_delete_plan_photos"
  ON public.plan_photos FOR DELETE TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_plan_photos_plan_id ON public.plan_photos (plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_photos_home_id ON public.plan_photos (home_id);
