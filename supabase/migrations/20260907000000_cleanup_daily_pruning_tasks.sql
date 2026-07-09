-- One-shot cleanup: seasonal pruning became a WINDOW task (2026-07), like
-- harvesting — one task per season owned by the frontend ghost engine.
--
-- Before this, Pruning was NOT in the window model, so the generate-tasks cron
-- materialised a separate Pending pruning task for every day of a seasonal
-- pruning window (frequency_days = 1 across the whole season). Those leftover
-- daily rows would otherwise sit alongside the new single window task.
--
-- Delete the leftover daily Pending pruning rows that belong to a WINDOWED
-- pruning blueprint (task_type = 'Pruning' AND end_date IS NOT NULL). The
-- single window task now renders as a ghost from the blueprint, so no
-- replacement rows are needed. Completed / Skipped pruning rows are kept
-- (history + they act as tombstones). Frequency-based pruning blueprints
-- (no end_date) are untouched — they remain normal recurring tasks.
--
-- Mirrors the harvest cron-fix cleanup precedent (Wave-21).

DELETE FROM public.tasks t
USING public.task_blueprints b
WHERE t.blueprint_id = b.id
  AND t.status = 'Pending'
  AND b.task_type = 'Pruning'
  AND b.end_date IS NOT NULL;
