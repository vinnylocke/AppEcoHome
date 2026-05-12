-- Per-user rate limit overrides.
-- Rows here take precedence over subscription-tier defaults in enforceRateLimit().
-- Users can read their own overrides (for profile display).
-- Only the service role (admins via Supabase dashboard) can write rows.
CREATE TABLE IF NOT EXISTS user_rate_limit_overrides (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  function_name text        NOT NULL,
  max_per_hour  integer     NOT NULL CHECK (max_per_hour >= 0),
  note          text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, function_name)
);

ALTER TABLE user_rate_limit_overrides ENABLE ROW LEVEL SECURITY;

-- Owners can read their own overrides (needed for the profile UI).
CREATE POLICY "owner_read_own_rate_limit_overrides"
  ON user_rate_limit_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE for regular users — service role only.

CREATE INDEX IF NOT EXISTS idx_url_overrides_lookup
  ON user_rate_limit_overrides (user_id, function_name);
