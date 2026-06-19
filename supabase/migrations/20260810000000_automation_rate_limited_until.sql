-- Rate-limit "mute until next eligible" for automations.
-- See docs/plans/automation-rate-limit-mute-until.md.
--
-- When an automation hits its run-limit, the engine computes the exact instant
-- the limit next clears and stores it here, then skips re-evaluation until then
-- — no per-tick skip-row flood. Separate from `defer_until` (weather deferral):
-- an automation can be weather-deferred AND rate-limited at once.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz;

-- Clear the mute whenever the automation's definition changes (or it's
-- re-activated), so an amendment re-checks immediately via ANY client path.
-- The engine's own bookkeeping writes (last_fired_at, condition_was_true, and
-- rate_limited_until itself) don't touch the columns checked here, so they
-- never self-clear the mute.
CREATE OR REPLACE FUNCTION public.clear_automation_rate_limit_on_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trigger_logic            IS DISTINCT FROM OLD.trigger_logic
     OR NEW.run_limit_count       IS DISTINCT FROM OLD.run_limit_count
     OR NEW.run_limit_window_hours IS DISTINCT FROM OLD.run_limit_window_hours
     OR NEW.sensor_cooldown_minutes IS DISTINCT FROM OLD.sensor_cooldown_minutes
     OR (NEW.is_active AND NOT OLD.is_active) THEN
    NEW.rate_limited_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_automation_rate_limit ON public.automations;
CREATE TRIGGER trg_clear_automation_rate_limit
  BEFORE UPDATE ON public.automations
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_automation_rate_limit_on_change();
