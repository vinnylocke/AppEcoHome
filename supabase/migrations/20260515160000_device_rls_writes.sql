-- Allow home members to insert and update devices directly from the client.
-- The exchange_code and connect flows save devices from the browser using the
-- user's auth token, so RLS must permit these operations for home members.

CREATE POLICY "home members insert devices"
  ON devices FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = devices.home_id
        AND home_members.user_id = auth.uid()
    )
  );

CREATE POLICY "home members update devices"
  ON devices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = devices.home_id
        AND home_members.user_id = auth.uid()
    )
  );
