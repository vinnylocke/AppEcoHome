-- user_events: append-only behavioural log for the AI assistant
-- event_type is free text (no enum) — TypeScript registry is the source of truth

CREATE TABLE IF NOT EXISTS public.user_events (
  id         uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_events"
  ON public.user_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes for the pattern detection queries
CREATE INDEX IF NOT EXISTS user_events_user_type_time
  ON public.user_events (user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS user_events_user_time
  ON public.user_events (user_id, created_at DESC);
