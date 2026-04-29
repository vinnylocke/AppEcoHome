CREATE TABLE IF NOT EXISTS public.user_pattern_hits (
  id                 uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id         text NOT NULL,
  inventory_item_id  uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  raw_data           jsonb NOT NULL DEFAULT '{}',
  evaluated          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- one active hit per (user, pattern, item) — upsert replaces stale data
  CONSTRAINT user_pattern_hits_unique UNIQUE (user_id, pattern_id, inventory_item_id)
);

ALTER TABLE public.user_pattern_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_pattern_hits"
  ON public.user_pattern_hits
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_pattern_hits_user_evaluated
  ON public.user_pattern_hits (user_id, evaluated);

CREATE INDEX IF NOT EXISTS user_pattern_hits_pattern
  ON public.user_pattern_hits (pattern_id);
