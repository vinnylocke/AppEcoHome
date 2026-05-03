-- Enable Supabase Realtime for all home-scoped tables (idempotent).
-- Adds each table to supabase_realtime only if not already a member.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'locations','areas','homes','inventory_items','weather_alerts',
    'tasks','task_blueprints','weather_snapshots','plants','ailments','plans'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Set REPLICA IDENTITY FULL so DELETE events include all columns.
-- Without this, filtered DELETE subscriptions (home_id=eq.X) are never
-- delivered because the WAL only carries the primary key for deletes.
ALTER TABLE public.locations         REPLICA IDENTITY FULL;
ALTER TABLE public.areas             REPLICA IDENTITY FULL;
ALTER TABLE public.homes             REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_items   REPLICA IDENTITY FULL;
ALTER TABLE public.weather_alerts    REPLICA IDENTITY FULL;
ALTER TABLE public.tasks             REPLICA IDENTITY FULL;
ALTER TABLE public.task_blueprints   REPLICA IDENTITY FULL;
ALTER TABLE public.weather_snapshots REPLICA IDENTITY FULL;
ALTER TABLE public.plants            REPLICA IDENTITY FULL;
ALTER TABLE public.ailments          REPLICA IDENTITY FULL;
ALTER TABLE public.plans             REPLICA IDENTITY FULL;
