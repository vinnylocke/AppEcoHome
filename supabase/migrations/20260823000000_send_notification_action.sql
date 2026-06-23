-- Add the `send_notification` automation action — a custom-message reminder sent
-- to every home member when the automation triggers. Distinct from `notification`
-- (the Automation Receipt, which reports run outcomes).
-- See docs/plans/automation-receipt-action.md.

ALTER TABLE public.automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_action_kind_check;

ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_kind_check
    CHECK (action_kind IN ('notification', 'send_notification', 'valve_open', 'valve_close', 'complete_task'));
