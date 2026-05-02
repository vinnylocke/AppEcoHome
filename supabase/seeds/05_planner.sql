-- ============================================================
-- SEED 05 — Plans (Planner)
-- ============================================================
-- Requires: 00_bootstrap.sql
-- Covers test sections: PLAN
--
-- Plans:
--   Summer Veg Plan  — In Progress (active/pending)
--   Spring Cleanup   — Completed
--   Winter Prep      — Archived
-- ============================================================

INSERT INTO public.plans (
  id, home_id, name, description, status, ai_blueprint, staging_state
)
VALUES
  -- Active plan
  (
    '00000000-0000-0000-0008-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Summer Veg Plan',
    'A plan for establishing a productive summer vegetable garden.',
    'In Progress',
    '{
      "project_overview": {
        "title": "Summer Vegetable Garden",
        "summary": "Establish a productive summer vegetable garden in the raised beds.",
        "estimated_difficulty": "Intermediate"
      },
      "infrastructure_requirements": {
        "needs_new_area": false,
        "suggested_area_name": "Raised Bed A",
        "suggested_environment": "Outdoor",
        "suggested_sunlight": "Full Sun",
        "suggested_medium": "Compost-enriched loam"
      },
      "plant_manifest": [
        {
          "common_name": "Tomato",
          "scientific_name": "Solanum lycopersicum",
          "quantity": 3,
          "role": "Main crop",
          "aesthetic_reason": "Vibrant red fruits add visual interest.",
          "horticultural_reason": "Thrives in full sun with warm temperatures.",
          "procurement_advice": "Buy established seedlings from a nursery."
        },
        {
          "common_name": "Basil",
          "scientific_name": "Ocimum basilicum",
          "quantity": 4,
          "role": "Companion plant",
          "aesthetic_reason": "Fragrant foliage and small white flowers.",
          "horticultural_reason": "Deters pests and improves tomato flavour.",
          "procurement_advice": "Grow from seed or buy plug plants."
        }
      ],
      "preparation_tasks": [
        {
          "task_index": 0,
          "title": "Clear and weed bed",
          "description": "Remove all weeds and debris from the raised bed.",
          "depends_on_index": null
        },
        {
          "task_index": 1,
          "title": "Add compost",
          "description": "Work in 2 inches of compost to improve soil structure.",
          "depends_on_index": 0
        }
      ],
      "custom_maintenance_tasks": [
        {
          "title": "Water deeply",
          "description": "Water at the base of plants to prevent fungal issues.",
          "frequency_days": 2,
          "seasonality": "Summer"
        }
      ]
    }'::jsonb,
    '{}'::jsonb
  ),
  -- Completed plan
  (
    '00000000-0000-0000-0008-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Spring Cleanup',
    'Annual spring garden tidy-up and preparation.',
    'Completed',
    '{
      "project_overview": {
        "title": "Spring Garden Cleanup",
        "summary": "Clear winter debris and prepare beds for spring planting.",
        "estimated_difficulty": "Beginner"
      },
      "infrastructure_requirements": {
        "needs_new_area": false,
        "suggested_area_name": "Main Beds",
        "suggested_environment": "Outdoor",
        "suggested_sunlight": "Partial Shade",
        "suggested_medium": "Garden soil"
      },
      "plant_manifest": [
        {
          "common_name": "Lavender",
          "scientific_name": "Lavandula angustifolia",
          "quantity": 2,
          "role": "Border plant",
          "aesthetic_reason": "Purple flowers add colour from early summer.",
          "horticultural_reason": "Drought tolerant once established.",
          "procurement_advice": "Buy bareroot or potted specimens."
        }
      ],
      "preparation_tasks": [
        {
          "task_index": 0,
          "title": "Remove dead growth",
          "description": "Cut back dead stems and remove fallen leaves.",
          "depends_on_index": null
        },
        {
          "task_index": 1,
          "title": "Edge borders",
          "description": "Re-cut lawn edges along all garden borders.",
          "depends_on_index": 0
        }
      ],
      "custom_maintenance_tasks": [
        {
          "title": "Monthly tidy",
          "description": "Quick tidy of borders and path edges.",
          "frequency_days": 30,
          "seasonality": "Spring"
        }
      ]
    }'::jsonb,
    '{}'::jsonb
  ),
  -- Archived plan
  (
    '00000000-0000-0000-0008-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'Winter Prep',
    'Preparing the garden for winter dormancy.',
    'Archived',
    '{
      "project_overview": {
        "title": "Winter Garden Preparation",
        "summary": "Protect plants and infrastructure before winter sets in.",
        "estimated_difficulty": "Beginner"
      },
      "infrastructure_requirements": {
        "needs_new_area": false,
        "suggested_area_name": "All Beds",
        "suggested_environment": "Outdoor",
        "suggested_sunlight": "Full Shade",
        "suggested_medium": "Mulch"
      },
      "plant_manifest": [
        {
          "common_name": "Heather",
          "scientific_name": "Calluna vulgaris",
          "quantity": 3,
          "role": "Winter colour",
          "aesthetic_reason": "Provides colour during winter months.",
          "horticultural_reason": "Hardy and frost tolerant.",
          "procurement_advice": "Available at most garden centres in autumn."
        }
      ],
      "preparation_tasks": [
        {
          "task_index": 0,
          "title": "Mulch beds",
          "description": "Apply a 3-inch layer of mulch over all beds.",
          "depends_on_index": null
        },
        {
          "task_index": 1,
          "title": "Cover tender plants",
          "description": "Wrap frost-tender plants with fleece or move indoors.",
          "depends_on_index": null
        }
      ],
      "custom_maintenance_tasks": [
        {
          "title": "Check frost protection",
          "description": "Inspect fleece covers and mulch after hard frost.",
          "frequency_days": 14,
          "seasonality": "Winter"
        }
      ]
    }'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  status       = EXCLUDED.status,
  ai_blueprint = EXCLUDED.ai_blueprint;
