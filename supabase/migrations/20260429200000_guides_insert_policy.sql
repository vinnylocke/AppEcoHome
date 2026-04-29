-- Allow admin users to insert and update guides
DROP POLICY IF EXISTS "Admins can manage guides" ON public.guides;
CREATE POLICY "Admins can manage guides"
  ON public.guides
  AS permissive
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE uid = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE uid = auth.uid() AND is_admin = true
    )
  );
