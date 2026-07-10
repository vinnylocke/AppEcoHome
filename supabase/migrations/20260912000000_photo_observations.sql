-- ─── Garden Brain Phase 3: the photo timeline (photo_observations + cron) ────
--
-- Nightly (04:00 UTC, before the 04:30 Daily Brief) `scan-journal-photos`
-- analyses NEW plant-linked journal photos for Sage/Evergreen homes with a
-- schema-enforced vision call: observed growth stage (correcting the
-- season-guessed inventory_items.growth_state), a health flag, findings, and
-- a CLOSED vocabulary of recommended actions (create_task /
-- check_for_ailment / watch_closely) that the user one-tap applies from the
-- plant's photo timeline. `concern` observations feed the Daily Brief.

CREATE TABLE public.photo_observations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id            uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  inventory_item_id  uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  -- One observation per photo, ever — the idempotency spine.
  journal_id         uuid NOT NULL UNIQUE REFERENCES public.plant_journals(id) ON DELETE CASCADE,
  -- The photo's moment, not the scan's (growth curves need photo time).
  observed_at        timestamptz NOT NULL,
  growth_stage       text CHECK (growth_stage IN (
    'Germination','Seedling','Vegetative','Budding/Pre-Flowering',
    'Flowering/Bloom','Fruiting/Pollination','Ripening/Maturity','Senescence')),
  health             text NOT NULL CHECK (health IN ('healthy','watch','concern')),
  findings           text NOT NULL DEFAULT '',
  confidence         numeric NOT NULL DEFAULT 0,
  -- Did this observation update inventory_items.growth_state? (audit)
  stage_applied      boolean NOT NULL DEFAULT false,
  -- Validated recommended_actions, each { kind, ..., status: proposed|applied|dismissed, applied_task_id? }
  actions            jsonb NOT NULL DEFAULT '[]'::jsonb,
  model              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX photo_observations_item_idx ON public.photo_observations (inventory_item_id, observed_at DESC);
CREATE INDEX photo_observations_home_health_idx ON public.photo_observations (home_id, health, created_at DESC);

ALTER TABLE public.photo_observations ENABLE ROW LEVEL SECURITY;

-- Members read + act (apply/dismiss mutates `actions`); service role inserts.
CREATE POLICY photo_observations_select ON public.photo_observations
  FOR SELECT USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );
CREATE POLICY photo_observations_update ON public.photo_observations
  FOR UPDATE USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

-- Data API exposure (2026-10 rule).
GRANT SELECT, UPDATE ON TABLE public.photo_observations TO authenticated;

-- ── Nightly cron — 04:00 UTC (after reconcile 03:45, before brief 04:30). ───
create extension if not exists pg_cron;

select cron.schedule(
  'scan-journal-photos-daily',
  '0 4 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/scan-journal-photos',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
