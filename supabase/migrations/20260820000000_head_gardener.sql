-- ============================================================
-- HEAD GARDENER — AI garden manager
--
-- Three home-scoped tables that turn Rhozly's reactive AI insights into a
-- standing "garden manager" experience:
--   1. garden_brief           — the manager's job spec (goals + constraints).
--   2. garden_manager_reports — the cached Estate Report (one per home).
--   3. garden_manager_log     — continuity / follow-up entries (advice + outcomes).
--
-- Gated to the Evergreen tier (client: tierFeatures.ts head_gardener;
-- server: _shared/insightTiers.ts). See docs/plans/head-gardener-ai-manager.md.
-- ============================================================


-- ------------------------------------------------------------
-- 1. GARDEN BRIEF — one editable row per home.
--    AI-drafted from quiz answers + planner_preferences, then user-confirmed.
--    Written by clients via supabase-js (RLS-gated); the AI only proposes a draft.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garden_brief (
  home_id          uuid        PRIMARY KEY REFERENCES public.homes(id) ON DELETE CASCADE,
  -- goals: grow_your_own | year_round_colour | attract_wildlife | low_maintenance |
  --        container_only | family_safe | calm_retreat | privacy_screening
  goals            text[]      NOT NULL DEFAULT '{}',
  time_per_week    text,       -- 'under_1h' | '1_3h' | '3_7h' | '7h_plus'
  budget_tier      text,       -- 'budget' | 'moderate' | 'premium'
  experience_level text,       -- 'beginner' | 'improving' | 'confident' | 'expert'
  -- styles: cottage | modern_minimal | tropical | mediterranean | wild_natural | kitchen_veg
  styles           text[]      NOT NULL DEFAULT '{}',
  notes            text,       -- free-text "anything else you want me to know"
  ai_summary       text,       -- the manager's one-paragraph understanding of the garden
  derived_from     jsonb,      -- provenance: which prefs/quiz answers seeded the draft
  confirmed_at     timestamptz, -- null until the user confirms → drives "review your brief" nudge
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.garden_brief IS
  'Head Gardener job spec: the home''s gardening goals + constraints. AI-drafted, user-confirmed.';

ALTER TABLE public.garden_brief ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_read_garden_brief"
  ON public.garden_brief FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_can_insert_garden_brief"
  ON public.garden_brief FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_can_update_garden_brief"
  ON public.garden_brief FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- Data API grants — required for tables created after 2026-10-30 (harmless before).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garden_brief TO authenticated;


-- ------------------------------------------------------------
-- 2. GARDEN MANAGER REPORTS — cached Estate Report, latest per home.
--    Written service-role by the garden-manager-report edge function;
--    clients only read (mirrors ai_insight_summaries).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garden_manager_reports (
  home_id      uuid        PRIMARY KEY REFERENCES public.homes(id) ON DELETE CASCADE,
  report       jsonb       NOT NULL,    -- structured sections (see Report shape in the plan)
  persona      text,
  based_on     text,                    -- content hash of the inputs this report reflects
  generated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.garden_manager_reports IS
  'Cached Head Gardener Estate Report (one per home). Regenerated weekly by cron + on demand.';

ALTER TABLE public.garden_manager_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_read_garden_manager_reports"
  ON public.garden_manager_reports FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

GRANT SELECT ON TABLE public.garden_manager_reports TO authenticated;


-- ------------------------------------------------------------
-- 3. GARDEN MANAGER LOG — continuity / follow-up (append-only).
--    Inserted service-role (report fn + cron); members read + may dismiss/resolve.
--    Reconciliation is deterministic (driven by user_events / tasks / inventory),
--    so the manager never claims an outcome it can't verify.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garden_manager_log (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text        NOT NULL CHECK (kind IN ('recommendation', 'gap', 'seasonal_action', 'follow_up')),
  title        text        NOT NULL,
  body         text,
  goal         text,       -- which brief goal this advances (nullable)
  target_kind  text,       -- 'plant' | 'area' | 'plan' | 'task' | 'blueprint'
  target_id    text,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acted', 'dismissed', 'expired')),
  resolved_at  timestamptz,
  outcome_note text        -- how it was reconciled, e.g. "user completed feeding task on 2026-06-18"
);

COMMENT ON TABLE public.garden_manager_log IS
  'Head Gardener continuity log: advice given + deterministically-reconciled outcomes.';

CREATE INDEX IF NOT EXISTS idx_garden_manager_log_home
  ON public.garden_manager_log (home_id, status, created_at DESC);

ALTER TABLE public.garden_manager_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_read_garden_manager_log"
  ON public.garden_manager_log FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- Members may dismiss / mark-done their home's log entries from the UI.
CREATE POLICY "home_members_can_update_garden_manager_log"
  ON public.garden_manager_log FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

GRANT SELECT, UPDATE ON TABLE public.garden_manager_log TO authenticated;
