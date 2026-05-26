-- Planner — Garden Overhaul feature
--
-- New "Overhaul existing garden" entry on the Planner Dashboard.
-- Admin uploads a photo + describes likes/dislikes/wants → AI
-- analyses the photo + generates a redesign blueprint + 3-4 Imagen
-- "after" concept images they pick from. Result lands as a
-- `plans` row (kind='overhaul') so it flows through Plan Staging
-- and the rest of the planner unchanged.
--
-- See docs/plans/planner-garden-overhaul.md for the full design.

-- ── plans: kind column ───────────────────────────────────────────
--
-- Existing flow's rows get the default 'designed'; new overhaul
-- flow inserts with kind='overhaul'. Lets the dashboard render a
-- different icon / chip + Plan Staging show the before/after view.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'designed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_kind_check'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_kind_check CHECK (kind IN ('designed', 'overhaul'));
  END IF;
END $$;

COMMENT ON COLUMN public.plans.kind IS
  '"designed" = generated from the 3-step NewPlanForm; "overhaul" = generated from a photo + likes/dislikes via the Overhaul flow.';

-- ── plan_overhaul_inputs ─────────────────────────────────────────
--
-- One row per overhaul plan. Stores the user's input + the original
-- garden photo URL + a snapshot of the context we fed the AI. The
-- context_used snapshot makes "but it didn't know about my clay
-- soil" complaints debuggable — we can see exactly what the AI was
-- told.

CREATE TABLE IF NOT EXISTS public.plan_overhaul_inputs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            uuid NOT NULL UNIQUE REFERENCES public.plans(id) ON DELETE CASCADE,
  original_photo_url text NOT NULL,
  likes              text,
  dislikes           text,
  wants              text,
  aesthetic          text,
  context_used       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_overhaul_inputs IS
  'User input + AI context snapshot for a single overhaul plan. The context_used jsonb captures home/areas/plants/preferences/climate exactly as they were fed to Gemini, so we can diagnose suggestions after-the-fact.';

ALTER TABLE public.plan_overhaul_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_overhaul_inputs read" ON public.plan_overhaul_inputs;
CREATE POLICY "plan_overhaul_inputs read"
  ON public.plan_overhaul_inputs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plans p
        JOIN public.home_members hm ON hm.home_id = p.home_id
       WHERE p.id = plan_overhaul_inputs.plan_id
         AND hm.user_id = auth.uid()
    )
  );

-- Writes go through the service-role edge fn, no INSERT policy
-- needed for authenticated users.

-- ── plan_overhaul_concepts ───────────────────────────────────────
--
-- The N AI-generated concept images. User picks one via the result
-- view, which flips `selected_by_user` on that row.

CREATE TABLE IF NOT EXISTS public.plan_overhaul_concepts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  image_url        text NOT NULL,
  prompt           text NOT NULL,
  aesthetic        text NOT NULL,
  imagen_model     text NOT NULL,
  cost_usd         numeric(8, 5) NOT NULL,
  selected_by_user boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_overhaul_concepts_plan_idx
  ON public.plan_overhaul_concepts (plan_id, created_at);

ALTER TABLE public.plan_overhaul_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_overhaul_concepts read" ON public.plan_overhaul_concepts;
CREATE POLICY "plan_overhaul_concepts read"
  ON public.plan_overhaul_concepts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plans p
        JOIN public.home_members hm ON hm.home_id = p.home_id
       WHERE p.id = plan_overhaul_concepts.plan_id
         AND hm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "plan_overhaul_concepts update_selection" ON public.plan_overhaul_concepts;
CREATE POLICY "plan_overhaul_concepts update_selection"
  ON public.plan_overhaul_concepts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plans p
        JOIN public.home_members hm ON hm.home_id = p.home_id
       WHERE p.id = plan_overhaul_concepts.plan_id
         AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.plans p
        JOIN public.home_members hm ON hm.home_id = p.home_id
       WHERE p.id = plan_overhaul_concepts.plan_id
         AND hm.user_id = auth.uid()
    )
  );

-- ── plan_overhaul_feedback ───────────────────────────────────────
--
-- Thumbs up/down + free-text on the overall overhaul result.
-- Mirrors optimiser_proposal_feedback's pattern.

CREATE TABLE IF NOT EXISTS public.plan_overhaul_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating     text NOT NULL CHECK (rating IN ('positive', 'negative')),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id)
);

ALTER TABLE public.plan_overhaul_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_overhaul_feedback insert_own" ON public.plan_overhaul_feedback;
CREATE POLICY "plan_overhaul_feedback insert_own"
  ON public.plan_overhaul_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "plan_overhaul_feedback update_own" ON public.plan_overhaul_feedback;
CREATE POLICY "plan_overhaul_feedback update_own"
  ON public.plan_overhaul_feedback
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "plan_overhaul_feedback read" ON public.plan_overhaul_feedback;
CREATE POLICY "plan_overhaul_feedback read"
  ON public.plan_overhaul_feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS plan_overhaul_feedback_plan_idx
  ON public.plan_overhaul_feedback (plan_id, created_at DESC);

-- ── ai_usage_log: image generation columns ───────────────────────
--
-- Imagen calls log a row with image_count > 0 + image_cost_usd > 0.
-- The audit page (src/components/AuditPage.tsx) reads ai_usage_log
-- so adding these columns lets it surface image-gen rows + their
-- per-image cost accurately.

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS image_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_cost_usd numeric(8, 5) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_usage_log.image_count IS
  'Number of images generated in this AI call (Imagen). Zero for text/vision-only calls.';
COMMENT ON COLUMN public.ai_usage_log.image_cost_usd IS
  'Per-call image-generation cost. Adds to estimated_cost_usd in audit totals.';

-- ── system_rate_limit_overrides ──────────────────────────────────
--
-- Currently rateLimit.ts has per-user overrides in
-- user_rate_limit_overrides + hardcoded TIER_LIMITS. This table
-- adds system-wide per-(function, tier) overrides so the admin can
-- tune rate limits without a code deploy. resolveMax() checks
-- here BEFORE falling back to the hardcoded table.

CREATE TABLE IF NOT EXISTS public.system_rate_limit_overrides (
  function_name text NOT NULL,
  tier          text NOT NULL CHECK (tier IN ('sprout', 'botanist', 'sage', 'evergreen')),
  max_per_hour  integer NOT NULL CHECK (max_per_hour >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (function_name, tier)
);

COMMENT ON TABLE public.system_rate_limit_overrides IS
  'Admin-tunable per-function per-tier rate limits. resolveMax() in _shared/rateLimit.ts checks this BEFORE the hardcoded TIER_LIMITS, so admins can adjust limits live without redeploying.';

ALTER TABLE public.system_rate_limit_overrides ENABLE ROW LEVEL SECURITY;

-- Admin-only — same pattern as plant_library admin tables.
DROP POLICY IF EXISTS "system_rate_limit_overrides admin read"
  ON public.system_rate_limit_overrides;
CREATE POLICY "system_rate_limit_overrides admin read"
  ON public.system_rate_limit_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

DROP POLICY IF EXISTS "system_rate_limit_overrides admin write"
  ON public.system_rate_limit_overrides;
CREATE POLICY "system_rate_limit_overrides admin write"
  ON public.system_rate_limit_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

-- ── Storage buckets ──────────────────────────────────────────────
--
-- garden-overhaul-photos: private, holds the original user-uploaded
--   garden photos. Only accessible via signed URLs from edge fns.
-- garden-overhaul-concepts: public, holds AI-generated concept
--   images. Public is fine — they're generative output, not user PII.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('garden-overhaul-photos',  'garden-overhaul-photos',  false),
  ('garden-overhaul-concepts','garden-overhaul-concepts',true)
ON CONFLICT (id) DO NOTHING;

-- Read policy for the public concepts bucket — everyone signed in
-- can read (the URLs are public anyway, this just lets the SDK
-- generate them).
DROP POLICY IF EXISTS "garden-overhaul-concepts authenticated read"
  ON storage.objects;
CREATE POLICY "garden-overhaul-concepts authenticated read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'garden-overhaul-concepts');
