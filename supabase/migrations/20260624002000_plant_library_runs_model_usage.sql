-- Plant Library — per-model token + cost breakdown on each run
--
-- The existing `total_*_tokens` and `total_cost_usd` columns sum
-- usage across whatever models the cascade actually used during a
-- run. That's fine for the headline number, but loses the
-- per-model detail the admin needs to spot expensive fallbacks
-- (cascade landing on gemini-3.5-flash at $1.50/$9.00 is 15× the
-- top-rung cost — worth seeing).
--
-- `model_usage` is keyed by model id; each value is a small
-- breakdown:
--
--   {
--     "gemini-2.5-flash-lite": {
--       "prompt_tokens": 9200,
--       "candidates_tokens": 1100,
--       "cached_tokens": 2150,
--       "thoughts_tokens": 0,
--       "cost_usd": 0.00237,
--       "call_count": 3
--     },
--     "gemini-2.5-flash": { ... }
--   }
--
-- Rendered in the admin's expandable run rows. Pre-migration rows
-- get '{}' — the UI shows "No per-model data" for those.

ALTER TABLE public.plant_library_runs
  ADD COLUMN IF NOT EXISTS model_usage jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.plant_library_runs.model_usage IS
  'Per-model token + cost breakdown for the run. Keyed by model id; each value: { prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens, cost_usd, call_count }. Aggregated totals stay in the total_* columns.';
