-- Plant Library — extended token breakdown per run
--
-- Adds two columns so the cost estimate can account for the cheaper
-- billing tiers Gemini exposes via `usageMetadata`:
--
--   total_cached_tokens   — `cachedContentTokenCount` summed per call.
--                            Context-cached input is billed at ~25%
--                            of the normal input rate.
--   total_thoughts_tokens — `thoughtsTokenCount` summed per call.
--                            Pro-model thinking is billed at the
--                            normal OUTPUT rate (not free).
--
-- Existing `total_prompt_tokens` continues to include cached tokens
-- (it's Gemini's reported total), so the cost formula subtracts
-- cached from prompt before applying the input rate.

ALTER TABLE public.plant_library_runs
  ADD COLUMN IF NOT EXISTS total_cached_tokens   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_thoughts_tokens integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.plant_library_runs.total_cached_tokens IS
  'Sum of cachedContentTokenCount across every callGeminiCascade invocation. Billed at ~25% of input rate.';
COMMENT ON COLUMN public.plant_library_runs.total_thoughts_tokens IS
  'Sum of thoughtsTokenCount across every callGeminiCascade invocation. Billed at the model''s output rate.';
