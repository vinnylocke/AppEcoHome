-- ============================================================================
-- SEED 17 — Plant Library entries (garden-hub search-first overhaul Stage 1)
--
-- The local `plant_library` was empty, so every takeover search fell straight
-- through to the escalation ladder — result-row e2e assertions (row tap →
-- detail, + → cart) had nothing deterministic to click. Three evergreen rows
-- fix that for library-first search, browse-by-filter chips, and the ladder's
-- "only after wider search is exhausted" sequencing tests.
--
-- ⚠ GLOBAL-TABLE RULES (this seed runs once PER WORKER — 4×), mirroring
--   16_ailment_library.sql:
--   * `plant_library` is global (no home_id) → idempotent insert: explicit ids
--     + ON CONFLICT (id) DO UPDATE.
--   * `scientific_name_key` is GENERATED with a unique index — never insert
--     it; pre-delete same-key strays at other ids (AI write-back on an ad-hoc
--     local DB may already hold these species) so re-seeding never collides.
--   * `search_text` / `search_norm` are GENERATED — never insert them.
--   * No worker-substituted literals (no 0000000N- prefixes, no 100000N ids).
--   * Names avoid 15_favourites' snapshot-only tombstone ("Snapdragon") so
--     tombstone rendering tests keep rendering from snapshot alone.
--   * High explicit ids (910001+) + setval keep the bigserial clear of these
--     rows and any AI write-back inserts during local runs.
-- ============================================================================

DELETE FROM public.plant_library
WHERE scientific_name_key IN ('solanum lycopersicum', 'lavandula angustifolia', 'helianthus annuus')
  AND id NOT IN (910001, 910002, 910003);

INSERT INTO public.plant_library (
  id, common_name, scientific_name, other_names, plant_type, cycle, watering,
  sunlight, care_level, is_edible, indoor, flowers, description, valid, verified_at
) VALUES
  (
    910001, 'Tomato', '["Solanum lycopersicum"]'::jsonb, '["Love Apple"]'::jsonb,
    'Vegetable', 'annual', 'Frequent',
    '["full_sun"]'::jsonb, 'Medium', true, false, true,
    'The classic kitchen-garden fruiting crop — sun-hungry, thirsty, and generous in a good summer.',
    true, now()
  ),
  (
    910002, 'Lavender', '["Lavandula angustifolia"]'::jsonb, '["English Lavender"]'::jsonb,
    'Herb', 'perennial', 'Minimum',
    '["full_sun"]'::jsonb, 'Low', true, false, true,
    'Drought-tolerant Mediterranean shrub loved by pollinators — thrives on neglect in free-draining soil.',
    true, now()
  ),
  (
    910003, 'Sunflower', '["Helianthus annuus"]'::jsonb, '[]'::jsonb,
    'Flower', 'annual', 'Average',
    '["full_sun"]'::jsonb, 'Low', true, false, true,
    'Fast, tall and cheerful — a first-summer favourite that tracks the sun as it grows.',
    true, now()
  )
ON CONFLICT (id) DO UPDATE SET
  common_name = EXCLUDED.common_name,
  scientific_name = EXCLUDED.scientific_name,
  other_names = EXCLUDED.other_names,
  plant_type = EXCLUDED.plant_type,
  cycle = EXCLUDED.cycle,
  watering = EXCLUDED.watering,
  sunlight = EXCLUDED.sunlight,
  care_level = EXCLUDED.care_level,
  is_edible = EXCLUDED.is_edible,
  indoor = EXCLUDED.indoor,
  flowers = EXCLUDED.flowers,
  description = EXCLUDED.description,
  valid = EXCLUDED.valid,
  verified_at = EXCLUDED.verified_at;

SELECT setval('plant_library_id_seq', GREATEST((SELECT MAX(id) FROM public.plant_library), 910003));
