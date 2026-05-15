-- ─── BLUEPRINT → PLANT INSTANCE JUNCTION TABLE ───────────────────────────────
-- Links a task blueprint to zero or more specific plant instances.
-- Primary use: pruning blueprints pre-linked to the plants they cover.

CREATE TABLE blueprint_plant_instances (
  blueprint_id uuid NOT NULL REFERENCES task_blueprints(id) ON DELETE CASCADE,
  instance_id  uuid NOT NULL REFERENCES inventory_items(id)  ON DELETE CASCADE,
  PRIMARY KEY (blueprint_id, instance_id)
);

ALTER TABLE blueprint_plant_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members manage blueprint_plant_instances"
  ON blueprint_plant_instances FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_blueprints bp
      JOIN home_members hm ON hm.home_id = bp.home_id
      WHERE bp.id = blueprint_plant_instances.blueprint_id
        AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_blueprints bp
      JOIN home_members hm ON hm.home_id = bp.home_id
      WHERE bp.id = blueprint_plant_instances.blueprint_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_bpi_blueprint ON blueprint_plant_instances(blueprint_id);
CREATE INDEX idx_bpi_instance  ON blueprint_plant_instances(instance_id);
