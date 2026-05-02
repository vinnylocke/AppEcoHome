-- ============================================================
-- SEED 06 — Ailments (Watchlist)
-- ============================================================
-- Requires: 00_bootstrap.sql
-- Covers test sections: WL
--
-- Ailments:
--   Aphid             — pest,           active
--   Early Blight      — disease,        active  (with prevention + remedy steps)
--   Japanese Knotweed — invasive_plant, active
--   Powdery Mildew    — disease,        ARCHIVED
-- ============================================================

INSERT INTO public.ailments (
  id, home_id, name, scientific_name, type, source,
  description, symptoms, affected_plants,
  prevention_steps, remedy_steps, is_archived
)
VALUES
  -- Aphid — pest, active, manual
  (
    '00000000-0000-0000-0007-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Aphid',
    'Aphidoidea',
    'pest',
    'manual',
    'Small sap-sucking insects that cluster on young shoots and undersides of leaves, excreting sticky honeydew and causing curling, distortion, and yellowing.',
    '["Sticky residue on leaves (honeydew)", "Curled or distorted new growth", "Clusters of small insects on stems", "Yellowing leaves", "Black sooty mould on honeydew"]'::jsonb,
    ARRAY['Rose', 'Tomato', 'Pepper', 'Nasturtium'],
    '[
      {"id": "aphid-prev-1", "step_order": 1, "title": "Encourage natural predators", "description": "Attract ladybirds and lacewings to control aphid populations naturally.", "task_type": "inspect", "frequency_type": "weekly"},
      {"id": "aphid-prev-2", "step_order": 2, "title": "Plant companion plants", "description": "Use marigolds and chives as companion planting to deter aphids.", "task_type": "other", "frequency_type": "once"},
      {"id": "aphid-prev-3", "step_order": 3, "title": "Apply reflective mulch", "description": "Use reflective mulch to deter winged aphids from landing.", "task_type": "other", "frequency_type": "once"},
      {"id": "aphid-prev-4", "step_order": 4, "title": "Inspect regularly", "description": "Check new growth and undersides of leaves weekly, especially in spring.", "task_type": "inspect", "frequency_type": "weekly"},
      {"id": "aphid-prev-5", "step_order": 5, "title": "Avoid excess nitrogen", "description": "Do not over-fertilise with nitrogen — it promotes lush growth that attracts aphids.", "task_type": "fertilize", "frequency_type": "monthly"}
    ]'::jsonb,
    '[
      {"id": "aphid-rem-1", "step_order": 1, "title": "Blast with water", "description": "Use a strong jet of water to dislodge and remove aphid colonies from stems.", "task_type": "water", "frequency_type": "daily"},
      {"id": "aphid-rem-2", "step_order": 2, "title": "Apply insecticidal soap", "description": "Spray insecticidal soap or neem oil directly onto affected areas.", "task_type": "spray", "frequency_type": "every_n_days", "frequency_every_n_days": 3},
      {"id": "aphid-rem-3", "step_order": 3, "title": "Use pyrethrin spray", "description": "Apply pyrethrin-based spray as a last resort for heavy infestations.", "task_type": "spray", "frequency_type": "weekly"},
      {"id": "aphid-rem-4", "step_order": 4, "title": "Remove infested shoots", "description": "Cut off and destroy heavily infested shoot tips to stop spread.", "task_type": "prune", "frequency_type": "once"},
      {"id": "aphid-rem-5", "step_order": 5, "title": "Introduce ladybird larvae", "description": "Release ladybird larvae as biological control for persistent infestations.", "task_type": "other", "frequency_type": "once"}
    ]'::jsonb,
    false
  ),
  -- Early Blight — disease, active, manual
  (
    '00000000-0000-0000-0007-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Early Blight',
    'Alternaria solani',
    'disease',
    'manual',
    'A fungal disease causing characteristic dark brown spots with concentric rings on lower leaves, progressively moving up the plant and causing defoliation.',
    '["Dark brown spots with concentric rings (target-like pattern)", "Yellow halo around spots", "Lesions starting on oldest lower leaves", "Progressive defoliation from base upward", "Stem lesions near soil level (collar rot)"]'::jsonb,
    ARRAY['Tomato', 'Potato', 'Pepper', 'Aubergine'],
    '[
      {"id": "blight-prev-1", "step_order": 1, "title": "Rotate crops", "description": "Avoid planting tomato family in the same bed for 3+ years.", "task_type": "other", "frequency_type": "once"},
      {"id": "blight-prev-2", "step_order": 2, "title": "Remove infected debris", "description": "Clear and destroy infected plant debris at end of season.", "task_type": "remove", "frequency_type": "once"},
      {"id": "blight-prev-3", "step_order": 3, "title": "Water at the base", "description": "Water at soil level — avoid wetting foliage to reduce spread.", "task_type": "water", "frequency_type": "daily"},
      {"id": "blight-prev-4", "step_order": 4, "title": "Improve air circulation", "description": "Prune lower leaves to maintain good airflow through the canopy.", "task_type": "prune", "frequency_type": "weekly"},
      {"id": "blight-prev-5", "step_order": 5, "title": "Apply copper fungicide", "description": "Apply copper-based fungicide preventatively in high-risk wet weather.", "task_type": "spray", "frequency_type": "weekly"}
    ]'::jsonb,
    '[
      {"id": "blight-rem-1", "step_order": 1, "title": "Remove affected leaves", "description": "Remove and dispose of infected leaves immediately — do not compost.", "task_type": "remove", "frequency_type": "daily"},
      {"id": "blight-rem-2", "step_order": 2, "title": "Apply copper fungicide", "description": "Spray copper-based fungicide or mancozeb every 7–10 days.", "task_type": "spray", "frequency_type": "every_n_days", "frequency_every_n_days": 7},
      {"id": "blight-rem-3", "step_order": 3, "title": "Remove heavily infected plants", "description": "Pull out and dispose of plants with severe systemic infection.", "task_type": "remove", "frequency_type": "once"},
      {"id": "blight-rem-4", "step_order": 4, "title": "Mulch around the base", "description": "Apply mulch to prevent soil splash spreading spores onto lower leaves.", "task_type": "other", "frequency_type": "once"},
      {"id": "blight-rem-5", "step_order": 5, "title": "Boost potassium", "description": "Ensure adequate potassium nutrition to build plant resistance.", "task_type": "fertilize", "frequency_type": "weekly"}
    ]'::jsonb,
    false
  ),
  -- Japanese Knotweed — invasive plant, active
  (
    '00000000-0000-0000-0007-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'Japanese Knotweed',
    'Reynoutria japonica',
    'invasive_plant',
    'manual',
    'An extremely aggressive invasive plant that spreads rapidly through underground rhizomes, damages structures, and is very difficult to eradicate. Notify local authorities if found near watercourses.',
    '["Hollow bamboo-like stems with purple speckles", "Heart-shaped leaves with flat base", "Cream/white flower clusters in late summer", "Dense stands that exclude all other vegetation", "Regrowth from tiny rhizome fragments"]'::jsonb,
    ARRAY['Any surrounding vegetation (outcompetes all)'],
    '[
      {"id": "knotweed-prev-1", "step_order": 1, "title": "Do not import unknown topsoil", "description": "Never import topsoil from unknown sources — it may contain rhizome fragments.", "task_type": "inspect", "frequency_type": "once"},
      {"id": "knotweed-prev-2", "step_order": 2, "title": "Report waterway sightings", "description": "Report sightings near waterways to the Environment Agency.", "task_type": "other", "frequency_type": "once"},
      {"id": "knotweed-prev-3", "step_order": 3, "title": "Do not cut or strim", "description": "Never cut or strim — this spreads the plant from fragments.", "task_type": "other", "frequency_type": "once"},
      {"id": "knotweed-prev-4", "step_order": 4, "title": "Clean tools and boots", "description": "Decontaminate tools and boots before leaving any infected site.", "task_type": "inspect", "frequency_type": "once"}
    ]'::jsonb,
    '[
      {"id": "knotweed-rem-1", "step_order": 1, "title": "Chemical treatment", "description": "Engage a licensed contractor for glyphosate treatment.", "task_type": "spray", "frequency_type": "yearly"},
      {"id": "knotweed-rem-2", "step_order": 2, "title": "Excavate rhizomes", "description": "Dig out rhizomes to at least 1 metre depth with specialist equipment.", "task_type": "remove", "frequency_type": "once"},
      {"id": "knotweed-rem-3", "step_order": 3, "title": "Repeated cutting programme", "description": "A multi-year cutting programme may gradually weaken established plants.", "task_type": "prune", "frequency_type": "weekly"},
      {"id": "knotweed-rem-4", "step_order": 4, "title": "Dispose as controlled waste", "description": "All plant material must be disposed of as controlled waste — never compost.", "task_type": "remove", "frequency_type": "once"}
    ]'::jsonb,
    false
  ),
  -- Powdery Mildew — disease, ARCHIVED
  (
    '00000000-0000-0000-0007-000000000004',
    '00000000-0000-0000-0000-000000000002',
    'Powdery Mildew',
    'Erysiphales',
    'disease',
    'manual',
    'A fungal disease producing white powdery growth on leaf surfaces, stunting growth and reducing yield.',
    '["White powdery coating on leaf surfaces", "Distorted new growth", "Yellowing and browning of affected leaves", "Premature leaf drop"]'::jsonb,
    ARRAY['Courgette', 'Cucumber', 'Rose', 'Apple', 'Gooseberry'],
    '[
      {"id": "mildew-prev-1", "step_order": 1, "title": "Ensure air circulation", "description": "Keep good spacing between plants to promote airflow and reduce humidity.", "task_type": "prune", "frequency_type": "weekly"},
      {"id": "mildew-prev-2", "step_order": 2, "title": "Avoid overhead watering", "description": "Water at the base to keep foliage dry.", "task_type": "water", "frequency_type": "daily"},
      {"id": "mildew-prev-3", "step_order": 3, "title": "Plant resistant varieties", "description": "Choose mildew-resistant cultivars where available.", "task_type": "other", "frequency_type": "once"},
      {"id": "mildew-prev-4", "step_order": 4, "title": "Limit nitrogen fertiliser", "description": "Avoid excess nitrogen which promotes lush susceptible growth.", "task_type": "fertilize", "frequency_type": "monthly"}
    ]'::jsonb,
    '[
      {"id": "mildew-rem-1", "step_order": 1, "title": "Remove affected leaves", "description": "Pick off infected leaves and dispose of carefully — do not compost.", "task_type": "remove", "frequency_type": "daily"},
      {"id": "mildew-rem-2", "step_order": 2, "title": "Apply potassium bicarbonate", "description": "Spray potassium bicarbonate or sulphur-based fungicide on infected areas.", "task_type": "spray", "frequency_type": "weekly"},
      {"id": "mildew-rem-3", "step_order": 3, "title": "Milk spray treatment", "description": "Apply 1:9 milk-to-water spray as an organic treatment option.", "task_type": "spray", "frequency_type": "weekly"}
    ]'::jsonb,
    true  -- archived
  )
ON CONFLICT (id) DO UPDATE SET
  name              = EXCLUDED.name,
  type              = EXCLUDED.type,
  description       = EXCLUDED.description,
  prevention_steps  = EXCLUDED.prevention_steps,
  remedy_steps      = EXCLUDED.remedy_steps,
  is_archived       = EXCLUDED.is_archived;
