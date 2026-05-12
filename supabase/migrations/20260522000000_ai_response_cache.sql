-- General-purpose AI response cache.
-- Stores deterministic AI outputs (care guides, ailment data, plant search results, community guide drafts)
-- keyed by a normalised string so repeated identical queries skip the LLM entirely.
-- Contains only factual AI-generated plant knowledge — no user data — so open authenticated access is safe.

CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id         uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  cache_key  text NOT NULL,
  fn_name    text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT ai_response_cache_key_unique UNIQUE (cache_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_key     ON public.ai_response_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires ON public.ai_response_cache (expires_at);

ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users read write ai response cache"
  ON public.ai_response_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_response_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_response_cache TO service_role;
