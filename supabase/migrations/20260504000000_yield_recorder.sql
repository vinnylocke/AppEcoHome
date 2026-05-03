-- ============================================================
-- YIELD RECORDER
-- Adds yield_records table and expected_harvest_date column.
-- ============================================================

-- 1. yield_records table
CREATE TABLE IF NOT EXISTS public.yield_records (
  id            uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id       uuid          NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  instance_id   uuid          NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  value         numeric(10,3) NOT NULL CHECK (value > 0),
  unit          text          NOT NULL,
  notes         text,
  harvested_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.yield_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_yield_records"
  ON public.yield_records FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_yield_records"
  ON public.yield_records FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_update_yield_records"
  ON public.yield_records FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_yield_records"
  ON public.yield_records FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_yield_records_instance_id
  ON public.yield_records (instance_id, harvested_at DESC);

CREATE INDEX IF NOT EXISTS idx_yield_records_home_id
  ON public.yield_records (home_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yield_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yield_records TO service_role;

-- 2. Expected harvest date on inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS expected_harvest_date date;
