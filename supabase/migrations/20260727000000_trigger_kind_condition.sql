-- Unified condition automations — Phase 2 (2026-06-17)
-- Allow trigger_kind='condition' for tree-native automations created by the new
-- unified builder. Legacy values stay valid (auto-converted rows keep theirs).

ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_kind_check;
ALTER TABLE public.automations
  ADD CONSTRAINT automations_trigger_kind_check
  CHECK (trigger_kind IN ('time_scheduled', 'sensor_threshold', 'condition'));
