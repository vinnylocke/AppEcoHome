-- Seed: Community Guides
-- Test user UUID: 00000000-0000-0000-0000-000000000001
-- Community guide UUIDs: 00000000-0000-0000-0010-00000000000{n}
-- Community comment UUIDs: 00000000-0000-0000-0011-00000000000{n}

-- Guide 1: published, labeled with tomato+pruning for PlantGuidesTab overlap
INSERT INTO public.community_guides (
  id, author_id, title, subtitle, body, labels, star_count, comment_count, is_draft
) VALUES (
  '00000000-0000-0000-0010-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'How to Prune Tomatoes for Maximum Yield',
  'A step-by-step guide to removing suckers and shaping your tomato plants',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Why Pruning Matters"}]},{"type":"paragraph","content":[{"type":"text","text":"Regular pruning keeps your plants healthy and directs energy to fruit production."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Remove suckers below the first flower cluster"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Always use clean, sharp scissors or secateurs"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Prune in the morning so cuts heal before nightfall"}]}]}]}]}',
  ARRAY['tomato', 'pruning', 'vegetables'],
  1,
  2,
  false
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  body = EXCLUDED.body,
  labels = EXCLUDED.labels,
  is_draft = EXCLUDED.is_draft;

-- Guide 2: published, general watering guide
INSERT INTO public.community_guides (
  id, author_id, title, subtitle, body, labels, star_count, comment_count, is_draft
) VALUES (
  '00000000-0000-0000-0010-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Deep Watering Techniques for Healthy Roots',
  'Why shallow watering harms your plants and how to water deeply and infrequently',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Deep watering encourages roots to grow downward, making plants more drought-resistant."}]}]}',
  ARRAY['watering', 'roots', 'soil'],
  0,
  0,
  false
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  body = EXCLUDED.body,
  labels = EXCLUDED.labels,
  is_draft = EXCLUDED.is_draft;

-- Star: test user has starred guide 1 (used by PlantGuidesTab filter test)
INSERT INTO public.community_guide_stars (guide_id, user_id)
VALUES (
  '00000000-0000-0000-0010-000000000001',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (guide_id, user_id) DO NOTHING;

-- Update star_count to match the star above (trigger fires on insert; idempotent re-runs may skip it)
UPDATE public.community_guides
  SET star_count = (
    SELECT COUNT(*) FROM public.community_guide_stars
    WHERE guide_id = '00000000-0000-0000-0010-000000000001'
  )
WHERE id = '00000000-0000-0000-0010-000000000001';

-- Comment 1: top-level comment on guide 1
INSERT INTO public.community_guide_comments (
  id, guide_id, author_id, parent_id, body
) VALUES (
  '00000000-0000-0000-0011-000000000001',
  '00000000-0000-0000-0010-000000000001',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'Great guide! I started removing suckers last season and my yield doubled.'
)
ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body;

-- Comment 2: reply to comment 1
INSERT INTO public.community_guide_comments (
  id, guide_id, author_id, parent_id, body
) VALUES (
  '00000000-0000-0000-0011-000000000002',
  '00000000-0000-0000-0010-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0011-000000000001',
  'Same here — the trick is being consistent and doing it weekly.'
)
ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body;

-- Sync comment_count for guide 1
UPDATE public.community_guides
  SET comment_count = (
    SELECT COUNT(*) FROM public.community_guide_comments
    WHERE guide_id = '00000000-0000-0000-0010-000000000001'
  )
WHERE id = '00000000-0000-0000-0010-000000000001';
