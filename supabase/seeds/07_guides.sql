-- ============================================================
-- SEED 07 — Guides
-- ============================================================
-- Requires: 00_bootstrap.sql
-- Covers test sections: GDE
-- Note: guides table has RLS disabled (public read, admin write).
--       Seeds are inserted directly.
--
-- Guides:
--   Watering Basics     — Beginner, labels: ['Watering', 'Beginner']
--   Pruning Techniques  — Intermediate, labels: ['Pruning', 'Intermediate']
--   Composting 101      — Beginner, labels: ['Soil', 'Beginner', 'Organic']
--   Growing Tomatoes    — Beginner, labels: ['Tomato', 'Vegetable', 'Annual']
--                         (links to the seeded Tomato plant via common_name match)
-- ============================================================

INSERT INTO public.guides (id, data, labels)
VALUES
  -- Watering Basics — Beginner
  (
    '00000000-0000-0000-0009-000000000001',
    '{
      "title": "Watering Basics",
      "subtitle": "How to water your plants the right way",
      "difficulty": "Beginner",
      "estimated_minutes": 5,
      "sections": [
        {
          "type": "paragraph",
          "content": "Getting watering right is one of the most important skills in gardening. Both under-watering and over-watering can harm your plants."
        },
        {
          "type": "header",
          "content": "When to Water"
        },
        {
          "type": "paragraph",
          "content": "The best time to water is early morning before temperatures rise. This reduces evaporation and gives foliage time to dry before evening, reducing disease risk."
        },
        {
          "type": "header",
          "content": "How Much to Water"
        },
        {
          "type": "paragraph",
          "content": "Most plants prefer deep, infrequent watering rather than shallow, frequent applications. Aim for water to penetrate 15–20 cm into the soil."
        },
        {
          "type": "list",
          "items": [
            "Check soil moisture before watering — push a finger 5 cm into the soil",
            "Water at the base, not on foliage",
            "Use a watering can with a rose head for seedlings",
            "Mulch around plants to retain moisture"
          ]
        },
        {
          "type": "header",
          "content": "Signs of Over-Watering"
        },
        {
          "type": "paragraph",
          "content": "Yellowing leaves, wilting despite wet soil, and root rot are common signs of over-watering. Ensure pots have drainage holes and borders have good drainage."
        }
      ]
    }'::jsonb,
    ARRAY['Watering', 'Beginner']
  ),
  -- Pruning Techniques — Intermediate
  (
    '00000000-0000-0000-0009-000000000002',
    '{
      "title": "Pruning Techniques",
      "subtitle": "When and how to prune for healthy, productive plants",
      "difficulty": "Intermediate",
      "estimated_minutes": 10,
      "sections": [
        {
          "type": "paragraph",
          "content": "Pruning encourages healthy growth, improves shape, increases fruit and flower production, and removes diseased or damaged material. Timing and technique vary by plant type."
        },
        {
          "type": "header",
          "content": "Basic Principles"
        },
        {
          "type": "list",
          "items": [
            "Always use sharp, clean tools to make clean cuts",
            "Cut to just above a bud or lateral branch",
            "Angle cuts away from buds to shed water",
            "Remove the three Ds: dead, diseased, and damaged wood first"
          ]
        },
        {
          "type": "header",
          "content": "When to Prune"
        },
        {
          "type": "paragraph",
          "content": "Most deciduous shrubs and trees are best pruned in late winter or early spring while dormant. Summer-flowering shrubs are often pruned after flowering. Roses are typically pruned in early spring."
        },
        {
          "type": "header",
          "content": "Roses"
        },
        {
          "type": "paragraph",
          "content": "Prune hybrid tea and floribunda roses to 30–45 cm in early spring. Cut to outward-facing buds to encourage an open, vase-shaped structure with good air circulation."
        }
      ]
    }'::jsonb,
    ARRAY['Pruning', 'Intermediate']
  ),
  -- Composting 101 — Beginner
  (
    '00000000-0000-0000-0009-000000000003',
    '{
      "title": "Composting 101",
      "subtitle": "Turn kitchen and garden waste into garden gold",
      "difficulty": "Beginner",
      "estimated_minutes": 7,
      "sections": [
        {
          "type": "paragraph",
          "content": "Compost is the single best soil amendment you can make. It improves structure, feeds soil life, and provides a slow-release source of nutrients — all from material you would otherwise throw away."
        },
        {
          "type": "header",
          "content": "What to Compost"
        },
        {
          "type": "list",
          "items": [
            "Greens (nitrogen): vegetable peelings, grass clippings, coffee grounds, fresh plant trimmings",
            "Browns (carbon): cardboard, paper, dried leaves, straw, wood chips",
            "Aim for roughly equal volumes of greens and browns"
          ]
        },
        {
          "type": "header",
          "content": "What NOT to Compost"
        },
        {
          "type": "list",
          "items": [
            "Cooked food or meat (attracts pests)",
            "Diseased plant material",
            "Persistent weeds with seeds or rhizomes",
            "Pet waste"
          ]
        },
        {
          "type": "header",
          "content": "Maintaining Your Heap"
        },
        {
          "type": "paragraph",
          "content": "Turn the heap every 2–4 weeks to introduce oxygen and speed decomposition. Keep it moist but not waterlogged — it should feel like a wrung-out sponge. Most compost is ready in 3–6 months."
        }
      ]
    }'::jsonb,
    ARRAY['Soil', 'Beginner', 'Organic']
  )
  ,
  -- Growing Tomatoes — Beginner (links to Tomato plant via label match)
  (
    '00000000-0000-0000-0009-000000000004',
    '{
      "title": "Growing Tomatoes",
      "subtitle": "From seedling to harvest — everything you need to know",
      "difficulty": "Beginner",
      "estimated_minutes": 8,
      "sections": [
        {
          "type": "paragraph",
          "content": "Tomatoes are one of the most rewarding crops to grow at home. With the right care they will produce abundantly from mid-summer through to first frost."
        },
        {
          "type": "header",
          "content": "Watering & Feeding"
        },
        {
          "type": "list",
          "items": [
            "Water deeply and consistently — irregular watering causes blossom end rot and splitting",
            "Feed with a high-potassium liquid fertiliser once the first flowers appear",
            "Mulch around the base to retain moisture and suppress weeds"
          ]
        },
        {
          "type": "header",
          "content": "Support & Pruning"
        },
        {
          "type": "paragraph",
          "content": "Cordon (indeterminate) varieties need staking and regular side-shoot removal. Pinch out side shoots that appear in the leaf axils while they are small. Bush (determinate) varieties require less attention but benefit from a light cage for support."
        },
        {
          "type": "tip",
          "content": "Pinch out the growing tip once the plant has set four or five trusses to concentrate energy into ripening existing fruit before the end of the season."
        }
      ]
    }'::jsonb,
    ARRAY['Tomato', 'Vegetable', 'Annual']
  )
ON CONFLICT (id) DO NOTHING;
