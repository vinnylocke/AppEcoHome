-- ============================================================
-- SEED 14 — Head Gardener (AI garden manager)
-- ============================================================
-- Fixed prefix: 00000000-0000-0000- (substituted per worker by seed-test-db.mjs)
-- Test home   : 00000000-0000-0000-0000-000000000002
-- Test user   : 00000000-0000-0000-0000-000000000001
-- Log UUIDs   : 00000000-0000-0000-0013-00000000000{n}
--
-- Seeds a confirmed Garden Brief, a cached Estate Report, and two continuity-log
-- entries (one open recommendation, one already-acted follow-up) so the Head
-- Gardener tab renders fully populated in E2E tests.
--
-- Safe to re-run: every statement uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ── Garden Brief (confirmed) ───────────────────────────────────────────────────
INSERT INTO public.garden_brief
  (home_id, goals, time_per_week, budget_tier, experience_level, styles, notes, ai_summary, derived_from, confirmed_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  ARRAY['grow_your_own', 'year_round_colour', 'attract_wildlife'],
  '1_3h',
  'moderate',
  'improving',
  ARRAY['cottage', 'kitchen_veg'],
  'I want the front beds to look good all year and grow enough veg for a family of four.',
  'A productive but pretty cottage-style garden: you''re happy to put in a few hours a week, want food from the raised beds, year-round colour out front, and you''re keen to bring in more pollinators.',
  '{"source": "quiz+preferences", "goals_from": "quiz", "styles_from": "swipe"}'::jsonb,
  now()
)
ON CONFLICT (home_id) DO NOTHING;

-- ── Estate Report (cached) ─────────────────────────────────────────────────────
INSERT INTO public.garden_manager_reports (home_id, report, persona, based_on)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '{
    "headline": "Your garden is in good shape — two quick wins this week.",
    "greeting": "Morning! Your raised beds are powering ahead and the tomatoes you fed last month are setting fruit nicely. Two things worth a look before the weekend.",
    "sections": [
      {"goal": "grow_your_own", "title": "Your edible garden", "body": "Tomatoes and beans are cropping well in Raised Bed A. Succession-sow lettuce now to avoid a midsummer gap.", "severity": 2, "recommendation": "Sow a short row of lettuce this week.", "link": "/shed"},
      {"goal": "year_round_colour", "title": "Year-round colour", "body": "Plenty in flower now, but nothing covers November to February in the front border.", "severity": 2, "recommendation": "Add winter structure: hellebores and a winter clematis.", "link": "/planner"},
      {"goal": "attract_wildlife", "title": "Wildlife", "body": "Your salvias are drawing bees. A small water source would widen the range of visitors.", "severity": 1, "recommendation": "Add a shallow water dish near the cottage bed.", "link": null}
    ],
    "gaps": [
      {"goal": "year_round_colour", "title": "Nothing flowers Nov–Feb", "detail": "Your north-facing border has no winter interest.", "suggestion": "Hellebores and winter-flowering clematis suit that shady, sheltered spot.", "link": "/planner"}
    ],
    "yearPlan": {
      "thisMonth": ["Succession-sow lettuce and rocket", "Keep tomatoes fed weekly"],
      "thisSeason": ["Plan autumn bulb order for spring colour"],
      "comingUp": ["Plant winter-interest shrubs in the front border"]
    },
    "followUps": [
      {"logId": "00000000-0000-0000-0013-000000000002", "title": "Feed the tomatoes", "status": "acted", "note": "You logged a feed on schedule — fruit is setting well."}
    ],
    "generatedAt": "2026-06-22T05:00:00.000Z",
    "persona": "experienced"
  }'::jsonb,
  'experienced',
  'seed-fixture'
)
ON CONFLICT (home_id) DO NOTHING;

-- ── Continuity log ─────────────────────────────────────────────────────────────
-- Entry 1: open recommendation (a gap the manager wants the user to act on).
INSERT INTO public.garden_manager_log
  (id, home_id, user_id, kind, title, body, goal, target_kind, target_id, status)
VALUES (
  '00000000-0000-0000-0013-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'gap',
  'Fill the winter colour gap',
  'Nothing in the front border flowers November to February. Hellebores and a winter clematis would fix it.',
  'year_round_colour',
  'area',
  null,
  'open'
)
ON CONFLICT (id) DO NOTHING;

-- Entry 2: already-acted follow-up (reconciled deterministically from a completed feed task).
INSERT INTO public.garden_manager_log
  (id, home_id, user_id, kind, title, body, goal, target_kind, target_id, status, resolved_at, outcome_note)
VALUES (
  '00000000-0000-0000-0013-000000000002',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'follow_up',
  'Feed the tomatoes',
  'Your tomatoes were due a feed to support fruit set.',
  'grow_your_own',
  'plant',
  null,
  'acted',
  now(),
  'You logged a feed on schedule — fruit is setting well.'
)
ON CONFLICT (id) DO NOTHING;
