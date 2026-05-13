-- Remote config table for app-wide feature flags
-- Readable by all (including unauthenticated users) — needed for pre-auth maintenance screen
-- Writable only via service role key (deploy scripts, Supabase dashboard)
CREATE TABLE IF NOT EXISTS public.app_config (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default rows
INSERT INTO public.app_config (key, value) VALUES
  ('maintenance_mode', '{"enabled": false, "message": null}'::jsonb),
  ('min_app_version',  '{"ios": "1.0.0", "android": "1.0.0"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS: anyone can read; no client-side writes (service role only)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read app_config"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Enable Realtime so the maintenance flag propagates instantly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
  END IF;
END $$;
