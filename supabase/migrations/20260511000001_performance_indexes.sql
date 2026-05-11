-- Performance indexes for hot query paths
-- All are IF NOT EXISTS — safe to run on a live database with no downtime or locking.

-- tasks: primary scan paths used by TaskEngine and LocationTile
CREATE INDEX IF NOT EXISTS idx_tasks_home_date
  ON public.tasks (home_id, due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_home_status
  ON public.tasks (home_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_location_date
  ON public.tasks (location_id, due_date);

-- task_blueprints: scanned on every TaskEngine call
CREATE INDEX IF NOT EXISTS idx_task_blueprints_home_id
  ON public.task_blueprints (home_id);

CREATE INDEX IF NOT EXISTS idx_task_blueprints_location
  ON public.task_blueprints (location_id);

-- inventory_items: scanned on area detail view and task engine
CREATE INDEX IF NOT EXISTS idx_inventory_items_home_area
  ON public.inventory_items (home_id, area_id);
