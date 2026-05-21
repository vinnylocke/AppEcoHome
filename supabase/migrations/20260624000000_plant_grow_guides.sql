-- ============================================================
-- PLANT GROW GUIDES
--
-- Catalogue-level structured growing guides — one row per plants.id.
-- AI-generated via the `generate_grow_guide` action on the plant-doctor
-- edge fn. Refreshed every 90 days by the `refresh-stale-grow-guides`
-- cron + on-demand via a Refresh button on the new Grow Guide tab.
--
-- Trust model mirrors Perenual catalogue data: any authenticated user
-- can SELECT (catalogue-level fact), only service-role can write.
--
-- Idempotent — safe to re-run via `supabase migration up`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plant_grow_guides (
  -- 1:1 with plants. PK = plant_id; no surrogate key needed.
  plant_id                int  PRIMARY KEY REFERENCES public.plants(id) ON DELETE CASCADE,

  -- Full guide envelope. Shape enforced server-side via Gemini
  -- responseSchema; see _shared/growGuide.ts → GROW_GUIDE_SCHEMA.
  -- Structure: { schema_version, generated_at, sections: GuideSection[] }
  guide_data              jsonb NOT NULL,

  -- Freshness tracking — mirrors the AI care guide pattern.
  schema_version          int  NOT NULL DEFAULT 1,
  freshness_version       int  NOT NULL DEFAULT 1,
  last_generated_at       timestamptz NOT NULL DEFAULT now(),
  last_freshness_check_at timestamptz,    -- NULL → eligible for next cron run
  updated_fields          jsonb,           -- ["category", ...] from the last regen diff

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plant_grow_guides IS
  'AI-generated structured grow guides — one row per plants.id. Refreshed every 90 days by refresh-stale-grow-guides cron + on-demand via Grow Guide tab.';

-- Cron's primary scan — NULL-first ordering so freshly-created guides
-- (or ones never checked) are processed before older recently-verified
-- ones.
CREATE INDEX IF NOT EXISTS plant_grow_guides_stale_idx
  ON public.plant_grow_guides (last_freshness_check_at NULLS FIRST);

-- Keep updated_at fresh on every row update.
CREATE OR REPLACE FUNCTION public.touch_plant_grow_guides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plant_grow_guides_set_updated_at ON public.plant_grow_guides;
CREATE TRIGGER plant_grow_guides_set_updated_at
  BEFORE UPDATE ON public.plant_grow_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_plant_grow_guides_updated_at();

-- ============================================================
-- RLS
-- Authenticated users read. No client writes — only service-role +
-- SECURITY DEFINER paths (the edge fn) can INSERT / UPDATE / DELETE.
-- ============================================================

ALTER TABLE public.plant_grow_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read grow guides" ON public.plant_grow_guides;
CREATE POLICY "Authenticated can read grow guides"
  ON public.plant_grow_guides
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies → blocks every client write path.
-- The edge fn runs with service-role and bypasses RLS.
