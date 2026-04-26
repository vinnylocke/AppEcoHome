-- ============================================================
-- PLANNER AI MEMORY & PREFERENCES
-- Idempotent: safe to run even if tables were manually created
-- in Supabase Studio before this migration was applied via CLI.
-- ============================================================

-- 1. Raw event log (initial_prompt, regen_feedback, accepted_blueprint, completed_plan)
CREATE TABLE IF NOT EXISTS public.planner_ai_memory (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id    uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id    uuid        REFERENCES public.plans(id) ON DELETE SET NULL,
  event_type text        NOT NULL,
  raw_data   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planner_ai_memory ENABLE ROW LEVEL SECURITY;

-- Drop before recreating so re-running this migration is safe
DROP POLICY IF EXISTS "home_members_can_insert_memory"  ON public.planner_ai_memory;
DROP POLICY IF EXISTS "home_members_can_read_memory"    ON public.planner_ai_memory;
DROP POLICY IF EXISTS "users_can_insert_own_memory"     ON public.planner_ai_memory;
DROP POLICY IF EXISTS "users_can_read_own_memory"       ON public.planner_ai_memory;

CREATE POLICY "users_can_insert_own_memory"
  ON public.planner_ai_memory FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_read_own_memory"
  ON public.planner_ai_memory FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Structured, date-stamped preference store.
--    One row per preference item per user. Most-recent row per
--    (user_id, entity_type, entity_name) wins at query time.
CREATE TABLE IF NOT EXISTS public.planner_preferences (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id     uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text        NOT NULL,  -- 'plant' | 'aesthetic' | 'feature' | 'maintenance' | 'wildlife' | 'difficulty'
  entity_name text        NOT NULL,  -- e.g. 'Rose', 'Tropical', 'Low (Set & Forget)', 'Bees'
  sentiment   text        NOT NULL CHECK (sentiment IN ('positive', 'negative')),
  reason      text,                  -- e.g. 'too high maintenance', 'attracts pollinators I love'
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planner_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_members_can_insert_preferences" ON public.planner_preferences;
DROP POLICY IF EXISTS "home_members_can_read_preferences"   ON public.planner_preferences;
DROP POLICY IF EXISTS "users_can_insert_own_preferences"    ON public.planner_preferences;
DROP POLICY IF EXISTS "users_can_read_own_preferences"      ON public.planner_preferences;

CREATE POLICY "users_can_insert_own_preferences"
  ON public.planner_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_read_own_preferences"
  ON public.planner_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Supports the "most recent per entity per user" deduplication query
CREATE INDEX IF NOT EXISTS idx_planner_preferences_lookup
  ON public.planner_preferences (user_id, entity_type, entity_name, recorded_at DESC);
