-- ============================================================
-- PLANT DOCTOR CHAT — PLAN SUGGESTION
-- Adds an optional column for the chat AI's proactive "Make a Plan"
-- CTA payload. NULL when the AI decided not to suggest a plan for a
-- given turn. Older rows stay NULL — UI hides the card on null.
--
-- Shape (when populated):
--   { "headline": "Sounds like you're planning a sunny veg patch",
--     "plan_name": "Sunny Veg Patch 2026",
--     "description": "Short framing the New Plan modal will pre-fill.",
--     "plants_of_interest": ["Tomato", "Pepper", "Strawberry"] }
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS plan_suggestion jsonb;
