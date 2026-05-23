-- Plant Library — token + cost tracking per run
--
-- Each seed batch and verify call lands a `usage` object from
-- callGeminiCascade with prompt/candidates token counts and the model
-- that produced the response. The seed/verify edge fns accumulate
-- these onto the run row after every batch so admins can see at a
-- glance how much each run actually cost.
--
-- Cost is an estimate computed client-side in the edge fn using a
-- per-model price table — accurate to the published Gemini rates at
-- the time of the call.

ALTER TABLE public.plant_library_runs
  ADD COLUMN IF NOT EXISTS total_prompt_tokens     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_candidates_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_usd          numeric(10,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.plant_library_runs.total_prompt_tokens IS
  'Sum of promptTokenCount across every callGeminiCascade invocation in this run.';
COMMENT ON COLUMN public.plant_library_runs.total_candidates_tokens IS
  'Sum of candidatesTokenCount across every callGeminiCascade invocation in this run.';
COMMENT ON COLUMN public.plant_library_runs.total_tokens IS
  'Sum of totalTokenCount across every callGeminiCascade invocation in this run.';
COMMENT ON COLUMN public.plant_library_runs.total_cost_usd IS
  'Estimated USD cost for the run based on a per-model price table in _shared/geminiCost.ts. Cumulative; updated per batch.';
