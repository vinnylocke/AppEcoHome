-- Enable Supabase Realtime for plant_instance_ailments (idempotent).
-- AilmentWatchlist subscribes to this table via HOME_TABLES
-- (src/context/HomeRealtimeContext.tsx) to keep affected-plant counts
-- fresh across clients. Without publication membership the subscription
-- never receives postgres_changes events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'plant_instance_ailments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plant_instance_ailments;
  END IF;
END $$;

-- REPLICA IDENTITY FULL so DELETE events (ailment unlinked) include
-- home_id — otherwise the home_id=eq.X filtered subscription never
-- receives deletes (WAL only carries the primary key).
ALTER TABLE public.plant_instance_ailments REPLICA IDENTITY FULL;
