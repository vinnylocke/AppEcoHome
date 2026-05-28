-- AI Agent Chat — Phase 1 foundations
--
-- New objects:
--   1. chat_tool_calls table — audit log of every tool call the AI proposes,
--      its confirmation status, and what it affected (for undo).
--   2. check_ai_message_quota() — per-user daily message cap helper, used
--      by the agent-chat edge function to enforce tier limits.
--
-- Retention: chat_tool_calls is added to prune-app-logs-daily in a follow-up
-- migration once the table has steady traffic.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. chat_tool_calls — per-tool-call audit log
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_tool_calls (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  home_id         uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  tool_name       text        NOT NULL,
  tool_args       jsonb       NOT NULL,

  -- 'auto'           — read-only or trivially safe; runs without user confirmation
  -- 'confirm'        — single tap confirm required (default for mutations)
  -- 'strong_confirm' — destructive / bulk; UI requires extra friction (hold-to-confirm)
  risk_level      text        NOT NULL
                              CHECK (risk_level IN ('auto', 'confirm', 'strong_confirm')),

  -- Lifecycle: pending → confirmed → executed (success)
  --                                or failed
  --                  pending → cancelled
  --                  pending → expired (after 30 min)
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'confirmed', 'executed',
                                                'failed', 'cancelled', 'expired')),

  confirmed_at    timestamptz,
  executed_at     timestamptz,

  result          jsonb,
  error_message   text,

  -- For Undo: which rows the tool created/affected so we can reverse the change.
  -- Example: {"table": "tasks", "ids": ["uuid-1", "uuid-2"], "op": "insert"}
  affected_row_refs jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_tool_calls_message_idx
  ON public.chat_tool_calls (message_id);

CREATE INDEX IF NOT EXISTS chat_tool_calls_pending_idx
  ON public.chat_tool_calls (home_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS chat_tool_calls_user_recent_idx
  ON public.chat_tool_calls (user_id, created_at DESC);

ALTER TABLE public.chat_tool_calls ENABLE ROW LEVEL SECURITY;

-- Users can read their own tool calls (for chat history hydration + undo).
CREATE POLICY "users read own tool calls"
  ON public.chat_tool_calls
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Inserts + updates happen via the agent-chat edge function (service role),
-- so no INSERT/UPDATE policies for `authenticated`.

GRANT SELECT ON public.chat_tool_calls TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. check_ai_message_quota — rolling 24h message counter
-- ─────────────────────────────────────────────────────────────────────────
-- Returns { used, limit, allowed } for a given user + function_name pair.
-- The agent-chat edge function:
--   1. inserts ONE ai_usage_log row per user-message turn (function_name='agent-chat-message')
--   2. calls this function to check whether the current count is within tier
--
-- Counts ai_usage_log rows in the rolling 24h window because those are
-- already retained by Wave B's prune cron (90 days) and indexed on user_id.

CREATE OR REPLACE FUNCTION public.check_ai_message_quota(
  p_user_id       uuid,
  p_function_name text,
  p_limit         int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  used_count int;
BEGIN
  SELECT count(*) INTO used_count
  FROM public.ai_usage_log
  WHERE user_id       = p_user_id
    AND function_name = p_function_name
    AND created_at    >= now() - interval '24 hours';

  RETURN jsonb_build_object(
    'used',      used_count,
    'limit',     p_limit,
    'remaining', greatest(0, p_limit - used_count),
    'allowed',   used_count < p_limit
  );
END;
$function$;

COMMENT ON FUNCTION public.check_ai_message_quota IS
  'Per-user rolling 24h quota check. Returns {used, limit, remaining, allowed}. Used by agent-chat to enforce tier message caps.';

-- Index supporting the quota check (user_id + function_name + created_at).
-- Existing ai_usage_log_user_time covers (user_id, created_at) which is fine
-- for a single user's row count, but adding function_name to the leading
-- columns makes the filter cheaper when one user uses multiple AI features.
CREATE INDEX IF NOT EXISTS ai_usage_log_quota_idx
  ON public.ai_usage_log (user_id, function_name, created_at DESC);
