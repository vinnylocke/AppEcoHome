-- ─── PRUNING RECORDS ──────────────────────────────────────────────────────────
-- Written when a user completes a Pruning task.
-- instance_id IS NULL → "General Pruning" (not tied to any specific plant).
-- instance_id IS NOT NULL → specific plant instance was pruned.

CREATE TABLE pruning_records (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     uuid        NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  instance_id uuid        REFERENCES inventory_items(id) ON DELETE SET NULL,
  task_id     uuid        REFERENCES tasks(id) ON DELETE SET NULL,
  pruned_at   timestamptz NOT NULL DEFAULT now(),
  notes       text
);

ALTER TABLE pruning_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members manage pruning_records"
  ON pruning_records FOR ALL TO authenticated
  USING (home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_pruning_records_home     ON pruning_records(home_id, pruned_at DESC);
CREATE INDEX idx_pruning_records_instance ON pruning_records(instance_id, pruned_at DESC);
