-- ============================================================
-- PLANT DOCTOR CHAT HISTORY & FEEDBACK
-- Persists per-user chat messages and quality-feedback ratings.
-- ============================================================

-- 1. Chat messages (one row per turn)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id              uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  role                 text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content              text        NOT NULL,
  suggested_plants     jsonb,
  suggested_tasks      jsonb,
  preferences_captured integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_insert_own_chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "users_can_read_own_chat_messages"   ON public.chat_messages;

CREATE POLICY "users_can_insert_own_chat_messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_read_own_chat_messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_home_time
  ON public.chat_messages (user_id, home_id, created_at DESC);

-- 2. Per-message thumbs up / thumbs down feedback
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  rating     text        NOT NULL CHECK (rating IN ('positive', 'negative')),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_insert_own_chat_feedback" ON public.chat_feedback;
DROP POLICY IF EXISTS "users_can_read_own_chat_feedback"   ON public.chat_feedback;

CREATE POLICY "users_can_insert_own_chat_feedback"
  ON public.chat_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_can_read_own_chat_feedback"
  ON public.chat_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());
