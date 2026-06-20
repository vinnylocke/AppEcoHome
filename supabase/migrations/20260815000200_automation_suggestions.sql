-- Automation suggestions — Pillar B of the automation-intelligence feature.
-- Deterministic tuning suggestions for watering automations (raise run limit,
-- ease over-watering, enable rain-skip) produced by `analyse-automations` from
-- automation_runs history + the soil_moisture_profiles model. The trigger and
-- the proposed value are deterministic; `ai_rationale` is an optional Sage+
-- friendlier rewrite. Applied one-tap (never silently).
-- See docs/plans/automation-intelligence-and-soil-drydown.md.

CREATE TABLE IF NOT EXISTS public.automation_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  home_id         uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  kind            text NOT NULL,             -- raise_run_limit | reduce_watering | enable_weather_skip
  field           text,                      -- automations column the apply mutates
  current_value   jsonb,
  proposed_value  jsonb,
  rationale       text NOT NULL,             -- deterministic plain-language reason (all tiers)
  ai_rationale    text,                      -- optional Sage+ friendlier rewrite
  confidence      numeric NOT NULL DEFAULT 0,-- 0..1
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','applied','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,
  expires_at      timestamptz
);

-- At most one ACTIVE suggestion per (automation, kind).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_automation_suggestion
  ON public.automation_suggestions (automation_id, kind) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_suggestions_home ON public.automation_suggestions (home_id);
CREATE INDEX IF NOT EXISTS idx_automation_suggestions_automation ON public.automation_suggestions (automation_id);

ALTER TABLE public.automation_suggestions ENABLE ROW LEVEL SECURITY;

-- Home members can read their suggestions. They can also flip status
-- (apply/dismiss) — the real guard is the automations table's own RLS, which the
-- one-tap apply must also pass to actually change the automation. New rows are
-- written by the edge function (service role bypasses RLS).
DROP POLICY IF EXISTS "automation_suggestions_select_members" ON public.automation_suggestions;
CREATE POLICY "automation_suggestions_select_members" ON public.automation_suggestions
  FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "automation_suggestions_update_members" ON public.automation_suggestions;
CREATE POLICY "automation_suggestions_update_members" ON public.automation_suggestions
  FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- Data API exposure (RLS still gates rows). SELECT + UPDATE for clients; inserts are service-role.
GRANT SELECT, UPDATE ON TABLE public.automation_suggestions TO authenticated;
