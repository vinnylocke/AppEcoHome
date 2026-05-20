-- AI Plant Overhaul — Wave 1 / Realtime
--
-- Adds the plants table and the new user_plant_ack table to the realtime
-- publication so the client useCachedShed + useAiPlantFreshness hooks can
-- subscribe to freshness-version bumps and ack changes respectively.

DO $$
BEGIN
  -- Add plants if not already in the publication.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'plants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plants;
  END IF;

  -- Add user_plant_ack.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'user_plant_ack'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_plant_ack;
  END IF;
END
$$;

-- plant_care_revisions is intentionally NOT subscribed — clients fetch
-- diff_summary on-demand when opening a plant; no realtime needed.

-- ai_plant_manual_refresh_log is intentionally NOT subscribed — rate-limit
-- lookup is request-scoped, doesn't need push.
