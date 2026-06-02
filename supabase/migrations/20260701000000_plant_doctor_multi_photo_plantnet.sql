-- ─── Plant Doctor / Lens: multi-photo + Pl@ntNet provenance ─────────────────
--
-- Three additions to `plant_doctor_sessions` that land together because
-- they all relate to the Wave-19 plant-lens upgrade:
--
--   1. `image_paths text[]` — up to 5 storage paths per session (vs the
--      legacy single `image_path`). `image_path` is preserved for back-
--      compat; when a multi-photo session lands, `image_paths[0]` and
--      `image_path` carry the same path so old readers keep working.
--
--   2. `plantnet_result jsonb` — captures the Pl@ntNet response when the
--      identify path used it. Shape:
--        {
--          "best_match": { score, scientificName, commonName, genus, family, gbifId },
--          "top_matches": [ … up to 5 of the same shape … ],
--          "identification_source": "plantnet" | "plantnet+ai_confirmed"
--                                  | "plantnet_vs_ai_disagreement" | "ai_fallback",
--          "ai_suggested_name": string | null,
--          "remaining_requests": number | null
--        }
--
--   3. Action CHECK constraint extended to include the `scene` (Multi-ID)
--      and `analyse` (comprehensive analyse) values that the client has
--      been writing for several releases — the original constraint only
--      allowed `identify | diagnose | pest`, so those rows were silently
--      rejected. Fixing it here unblocks History for those actions.
--
-- All columns nullable; old sessions and Gemini-only paths continue to
-- work unchanged.

ALTER TABLE public.plant_doctor_sessions
  ADD COLUMN IF NOT EXISTS image_paths     text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS plantnet_result jsonb;

COMMENT ON COLUMN public.plant_doctor_sessions.image_paths IS
  'Up to 5 uploaded photo storage paths (Plant Lens Wave 19). image_paths[0] mirrors image_path for back-compat.';

COMMENT ON COLUMN public.plant_doctor_sessions.plantnet_result IS
  'Captured Pl@ntNet identify response + source-routing decision. Null for AI-only sessions.';

-- Extend the action CHECK to cover every value the client currently writes.
ALTER TABLE public.plant_doctor_sessions
  DROP CONSTRAINT IF EXISTS plant_doctor_sessions_action_check;

ALTER TABLE public.plant_doctor_sessions
  ADD CONSTRAINT plant_doctor_sessions_action_check
  CHECK (action IN ('identify', 'diagnose', 'pest', 'scene', 'analyse'));
