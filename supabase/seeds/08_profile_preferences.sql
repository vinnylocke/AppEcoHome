-- ============================================================
-- SEED 08 — Garden Profile: Quiz Completion & Preferences
-- ============================================================
-- Requires: 00_bootstrap.sql
-- Covers test sections: PROF
--
-- Inserts:
--   - home_quiz_completions row (quiz marked complete)
--   - planner_preferences (3 sample preferences: quiz + swipe sources)
--
-- The quiz completion causes the dashboard banner to be hidden
-- and the completion heading to be shown on /profile.
-- Run 00_bootstrap.sql ONLY (without this script) to test the
-- pre-completion quiz flow.
-- ============================================================

-- Mark quiz as complete for test home + user
INSERT INTO public.home_quiz_completions (home_id, user_id)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (home_id, user_id) DO NOTHING;

-- Sample planner preferences (mix of sources and sentiments)
INSERT INTO public.planner_preferences (
  id, home_id, user_id, entity_type, entity_name, sentiment, source, reason
)
VALUES
  -- Positive plant preference (from quiz)
  (
    '00000000-0000-0000-000c-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'plant',
    'Tomato',
    'positive',
    'quiz',
    'Grows food and likes our sunny beds'
  ),
  -- Negative plant preference (from quiz)
  (
    '00000000-0000-0000-000c-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'plant',
    'Cactus',
    'negative',
    'quiz',
    'Not suitable for outdoor UK climate'
  ),
  -- Positive aesthetic preference (from swipe)
  (
    '00000000-0000-0000-000c-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'aesthetic',
    'Cottage Garden',
    'positive',
    'swipe',
    'Relaxed and naturalistic style'
  ),
  -- Positive maintenance preference (from quiz)
  (
    '00000000-0000-0000-000c-000000000004',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'difficulty',
    'Medium (Some Effort)',
    'positive',
    'quiz',
    NULL
  ),
  -- Positive wildlife preference (from quiz)
  (
    '00000000-0000-0000-000c-000000000005',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'wildlife',
    'Bees',
    'positive',
    'quiz',
    'Want to encourage pollinators'
  )
ON CONFLICT (id) DO NOTHING;
