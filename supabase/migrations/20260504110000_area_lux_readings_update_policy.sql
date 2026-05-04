-- Add UPDATE policy and grant for area_lux_readings so home members
-- can edit their own readings (introduced for inline edit UI).

CREATE POLICY "home_members_can_update_area_lux_readings"
  ON public.area_lux_readings FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

GRANT UPDATE ON public.area_lux_readings TO authenticated;
