-- Allow authenticated users to read profiles of people in the same home
CREATE POLICY "home_members_can_view_co_member_profiles"
ON public.user_profiles FOR SELECT TO authenticated
USING (
  uid IN (
    SELECT hm.user_id FROM public.home_members hm
    WHERE hm.home_id IN (
      SELECT hm2.home_id FROM public.home_members hm2
      WHERE hm2.user_id = auth.uid()
    )
  )
);

-- Allow home owners to remove other members (never themselves)
CREATE POLICY "owners_can_remove_members"
ON public.home_members FOR DELETE TO authenticated
USING (
  user_id != auth.uid()
  AND home_id IN (
    SELECT hm.home_id FROM public.home_members hm
    WHERE hm.user_id = auth.uid() AND hm.role = 'owner'
  )
);
