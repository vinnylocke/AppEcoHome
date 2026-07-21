-- ============================================================================
-- SEED 16 — Ailment Library entries (ailment-library overhaul Stage 1)
--
-- Gives the /ailment-library browse + detail + watch/favourite e2e tests real
-- catalogue rows (the table was previously unseeded → shell-only tests).
--
-- ⚠ GLOBAL-TABLE RULES (this seed runs once PER WORKER — 4×):
--   * `ailment_library` is global (no home_id), so every worker hits the SAME
--     rows → the insert MUST be idempotent: explicit ids + ON CONFLICT (id).
--   * `name_key` is a GENERATED column with its own unique index — never
--     insert it, and never reuse a name (name-collision would violate it).
--   * Names deliberately AVOID 15_favourites' tombstone names ("Aphid",
--     "Rose Rust", "Slugs") — a library row matching those would make
--     resolveAilmentLibraryId start resolving and break the tombstone tests.
--   * No worker-substituted literals (no 0000000N- UUID prefixes, no 100000N
--     plant ids) — the runner's replaceAll must not touch this file.
--   * High explicit ids (900001+) + setval keep the bigserial clear of both
--     these rows and any AI write-back inserts during local runs.
--   * name_key is ALSO unique — on an ad-hoc local DB the app's AI write-back
--     may already hold a same-named row at a different id, which ON CONFLICT
--     (id) would NOT absorb. Pre-delete any same-key strays first (review
--     finding — keeps iterative local seeding collision-proof).
--   * Late Blight (900002) is deliberately source='ai' — realistic (the prod
--     catalogue is mostly AI-authored) and proves the tier-fix migration
--     (20261015000000) lets library-referenced favourites through.
-- ============================================================================

DELETE FROM public.ailment_library
WHERE name_key IN ('tomato hornworm', 'late blight', 'japanese knotweed')
  AND id NOT IN (900001, 900002, 900003);

INSERT INTO public.ailment_library
  (id, name, kind, scientific_name, aliases, description, symptoms, causes,
   treatment, prevention, severity, affected_plant_types, affected_families,
   season, organic_friendly, source, valid)
VALUES
  (900001, 'Tomato Hornworm', 'pest', 'Manduca quinquemaculata',
   '["five-spotted hawkmoth larva"]'::jsonb,
   'A large green caterpillar that can defoliate tomato plants in days.',
   '["Chewed leaves and stems", "Dark droppings on foliage", "Large green caterpillars on stems"]'::jsonb,
   'Adult moths lay eggs on the undersides of leaves in early summer.',
   'Hand-pick caterpillars at dusk; encourage parasitic wasps.',
   'Till soil after harvest to destroy pupae; rotate crops.',
   'high',
   '["tomato", "pepper", "potato"]'::jsonb,
   '["Solanaceae"]'::jsonb,
   '["summer"]'::jsonb,
   true, 'manual', true),
  (900002, 'Late Blight', 'disease', 'Phytophthora infestans',
   '[]'::jsonb,
   'A fast-moving disease of tomatoes and potatoes in cool, wet spells.',
   '["Brown lesions on leaves", "White mould under leaves", "Rapid plant collapse"]'::jsonb,
   'A water mould spread by wind-blown spores in cool wet weather.',
   'Remove and destroy infected foliage immediately; copper-based fungicide.',
   'Space plants for airflow; water at the base; choose resistant varieties.',
   'critical',
   '["tomato", "potato"]'::jsonb,
   '["Solanaceae"]'::jsonb,
   '["humid weather", "autumn"]'::jsonb,
   true, 'ai', true),
  (900003, 'Japanese Knotweed', 'invasive', 'Reynoutria japonica',
   '["Asian knotweed"]'::jsonb,
   'A notoriously persistent invasive that spreads through rhizomes.',
   '["Bamboo-like hollow stems", "Shovel-shaped leaves", "Creamy late-summer flower spikes"]'::jsonb,
   'Spreads from rhizome fragments in moved soil.',
   'Repeated cutting exhausts rhizomes over seasons; specialist removal for large stands.',
   'Never compost fragments; check imported topsoil.',
   'critical',
   '[]'::jsonb,
   '["Polygonaceae"]'::jsonb,
   '["summer"]'::jsonb,
   false, 'manual', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  severity = EXCLUDED.severity,
  source = EXCLUDED.source,
  affected_plant_types = EXCLUDED.affected_plant_types;

-- Keep the bigserial clear of the explicit ids (idempotent: only ever raises).
SELECT setval(
  pg_get_serial_sequence('public.ailment_library', 'id'),
  GREATEST(900010, (SELECT COALESCE(MAX(id), 0) FROM public.ailment_library))
);
