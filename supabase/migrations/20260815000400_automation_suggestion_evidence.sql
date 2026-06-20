-- Structured evidence behind each automation suggestion (Pillar B) so the
-- suggestion chip's "Details" can show a real data breakdown (drydown rate,
-- rate-limited count, readings below the watering threshold, recent min/avg).
-- Populated by analyse-automations. See docs/plans/automation-intelligence-and-soil-drydown.md.

ALTER TABLE public.automation_suggestions
  ADD COLUMN IF NOT EXISTS evidence jsonb;
-- Column inherits the table's existing SELECT/UPDATE grants + RLS.
