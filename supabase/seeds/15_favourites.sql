-- ============================================================
-- SEED 15 — Cross-Home Favourites (plants + ailments + seed packets)
-- ============================================================
-- Requires: 00_bootstrap.sql, 02_plants_shed.sql, 06_ailments_watchlist.sql
-- Covers test section: FAV / FAV-WL / FAV-NU (favourites.spec.ts)
--
-- Entity UUID segments: 0017 (plants, Phase 1), 0018 (ailments, Phase 2),
-- 0019 (seed packets, Phase 3). 0013–0016 are taken by the integrations
-- seed — integration / devices / readings / valve events.
--
-- Per worker (base prefix, substituted by scripts/seed-test-db.mjs):
--   * Favourite 0017-…01 — seeded manual Tomato (plant 1000001):
--     heart pre-filled on the Home tab + "In this home" on the
--     Favourites tab (the dedupe case).
--   * Favourite 0017-…02 — "Snapdragon" TOMBSTONE (plant_id NULL,
--     snapshot only): the reference-gone render + the clean
--     add-to-home case (no matching row in the active home).
--
-- Worker 1 ONLY (hardcoded 00000001- prefix, pattern precedent:
-- 09_cross_home_markers.sql — the substitution only rewrites the
-- base 00000000-0000-0000- prefix, so these run identically and
-- idempotently on every worker pass):
--   * A minimal SECOND home ("Rooftop Terrace") + owner membership
--     so a spec can switch home and assert favourites persist while
--     the Home tab re-roots.
--   * One manual plant "Fig" (fixed id 9900101) in that second home.
--   * Favourite 0017-…03 for W1 referencing Fig — a LIVE cross-home
--     reference: "Add to this home" in home 1, "In this home" after
--     switching to the Rooftop Terrace.
--
-- Idempotent: safe to re-run at any time.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Worker 1's second home (hardcoded — see header)
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.homes (id, name)
VALUES (
  '00000001-0000-0000-0000-000000000022',
  'Rooftop Terrace'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.home_members (home_id, user_id, role)
VALUES (
  '00000001-0000-0000-0000-000000000022',
  '00000001-0000-0000-0000-000000000001',
  'owner'
)
ON CONFLICT (home_id, user_id) DO NOTHING;

-- A location so the home doesn't look brand-new (an empty home re-triggers
-- the first-run WelcomeModal after switching, which would block E2E clicks).
INSERT INTO public.locations (id, home_id, name, placement, is_outside)
VALUES (
  '00000001-0000-0000-0001-999000000022',
  '00000001-0000-0000-0000-000000000022',
  'Terrace',
  'Outside',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name    = EXCLUDED.name,
  home_id = EXCLUDED.home_id;

-- One plant living in the second home. Fixed id outside every
-- seed-test-db.mjs substitution pattern (like 9900001 in seed 09).
INSERT INTO public.plants (
  id, common_name, scientific_name, source, home_id, is_archived,
  watering, care_level, cycle, description, sunlight
)
VALUES (
  9900101,
  'Fig',
  '["Ficus carica"]'::jsonb,
  'manual',
  '00000001-0000-0000-0000-000000000022',
  false,
  'Average',
  'Low',
  'Perennial',
  'Container fig for the rooftop — restrict the roots for better fruit.',
  '["Full sun"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  common_name = EXCLUDED.common_name,
  home_id     = EXCLUDED.home_id,
  is_archived = EXCLUDED.is_archived;

-- ─────────────────────────────────────────────────────────────
-- Per-worker favourites (base prefix — substituted per worker)
-- ─────────────────────────────────────────────────────────────

-- Favourite 1 — live reference to the seeded manual Tomato.
-- Arbiter is the (user_id, plant_id) unique so a UI-created favourite of
-- the same plant can never break the re-run.
-- Idempotency hardening (2026-07-21, hub overhaul Stage 5 seed-run catch):
-- test suites toggle favourites live, so a re-run can find the same
-- (user_id, plant_id) pair under a DIFFERENT id (heart re-added after the
-- seeded row was removed) — the fixed-id insert then violates the PK while
-- the (user_id, plant_id) conflict target doesn't arbitrate. Clear both
-- identities first (same pre-delete pattern as seeds 16/17).
DELETE FROM public.user_favourite_plants
WHERE id IN (
  '00000000-0000-0000-0017-000000000001',
  '00000000-0000-0000-0017-000000000002',
  '00000001-0000-0000-0017-000000000003'
)
OR (user_id = '00000000-0000-0000-0000-000000000001' AND plant_id = 1000001)
OR (user_id = '00000001-0000-0000-0000-000000000001' AND plant_id = 9900101);

INSERT INTO public.user_favourite_plants (
  id, user_id, plant_id, source, common_name, scientific_name,
  image_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000000-0000-0000-0017-000000000001',
  '00000000-0000-0000-0000-000000000001',
  1000001,
  'manual',
  'Tomato',
  '["Solanum lycopersicum"]'::jsonb,
  NULL,
  '{"common_name":"Tomato","scientific_name":["Solanum lycopersicum"],"watering":"Average","care_level":"Medium","cycle":"Annual","description":"A versatile fruiting plant suitable for raised beds and containers."}'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (user_id, plant_id) DO UPDATE SET
  snapshot    = EXCLUDED.snapshot,
  common_name = EXCLUDED.common_name;

-- Favourite 2 — tombstone (reference gone): renders from snapshot alone and
-- is the clean "Add to this home" case (no Snapdragon in any seeded home).
-- plant_id is NULL so the (user_id, plant_id) unique never arbitrates —
-- conflict target is the fixed PK instead.
INSERT INTO public.user_favourite_plants (
  id, user_id, plant_id, source, common_name, scientific_name,
  image_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000000-0000-0000-0017-000000000002',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'manual',
  'Snapdragon',
  '["Antirrhinum majus"]'::jsonb,
  NULL,
  '{"common_name":"Snapdragon","scientific_name":["Antirrhinum majus"],"watering":"Average","care_level":"Low","cycle":"Annual","description":"Cheerful cottage-garden annual with dragon-mouth flowers.","sunlight":["Full sun","Partial shade"]}'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO UPDATE SET
  snapshot    = EXCLUDED.snapshot,
  common_name = EXCLUDED.common_name;

-- Favourite 3 — WORKER 1 ONLY (hardcoded): live reference to Fig in the
-- second home. Proves cross-home persistence: visible in the Favourites tab
-- from either home; "Add to this home" in home 1, "In this home" after
-- switching to the Rooftop Terrace.
INSERT INTO public.user_favourite_plants (
  id, user_id, plant_id, source, common_name, scientific_name,
  image_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000001-0000-0000-0017-000000000003',
  '00000001-0000-0000-0000-000000000001',
  9900101,
  'manual',
  'Fig',
  '["Ficus carica"]'::jsonb,
  NULL,
  '{"common_name":"Fig","scientific_name":["Ficus carica"],"watering":"Average","care_level":"Low","cycle":"Perennial","description":"Container fig for the rooftop — restrict the roots for better fruit."}'::jsonb,
  '00000001-0000-0000-0000-000000000022'
)
ON CONFLICT (user_id, plant_id) DO UPDATE SET
  snapshot    = EXCLUDED.snapshot,
  common_name = EXCLUDED.common_name;

-- ============================================================
-- Phase 2 — Favourite AILMENTS (UUID segment 0018)
-- ============================================================
-- The E2E workers do NOT seed the ailment_library, so all favourite ailments
-- are library-less tombstones (ailment_library_id NULL) — dedupe is on
-- (user_id, identity_key). identity_key = lower(trim(collapse-ws(name))).
--
-- Per worker (base prefix, substituted per worker):
--   * Ailment favourite 0018-…01 — "Aphid": matches the seeded home ailment
--     (06_ailments_watchlist.sql) by name → heart pre-filled on the Home tab +
--     "In this home" on the Favourites tab (the dedupe case).
--   * Ailment favourite 0018-…02 — "Rose Rust": no matching home ailment → the
--     clean "Add to this home" case.
--
-- Worker 1 ONLY (hardcoded 00000001- prefix):
--   * "Slugs" ailment planted in the SECOND home (Rooftop Terrace) + a favourite
--     for it: shows "Add to this home" in home 1, "In this home" after switching
--     to the Rooftop Terrace — proving the add-state recomputes on home switch
--     while the favourite itself persists.
-- ============================================================

-- An above-tier (perenual-source) ailment in home 1, so the Sprout tier-lock
-- spec has a stable fixture: its favourite heart is disabled + view-only for a
-- Sprout viewer. (Every ailment in 06_ailments_watchlist.sql is 'manual'.)
INSERT INTO public.ailments (
  id, home_id, name, scientific_name, type, source,
  description, symptoms, affected_plants, prevention_steps, remedy_steps, is_archived
)
VALUES (
  '00000000-0000-0000-0007-000000000018',
  '00000000-0000-0000-0000-000000000002',
  'Locked Rust (perenual)',
  'Phragmidium',
  'disease',
  'perenual',
  'A provider-sourced ailment used to prove the Sprout source-tier lock on the favourite heart.',
  '["Orange pustules on leaf undersides"]'::jsonb,
  ARRAY['Rose'],
  '[]'::jsonb,
  '[]'::jsonb,
  false
)
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  source = EXCLUDED.source;

-- v3 feedback polish (2026-07-22): a zero-presence, un-watched ailment is now
-- hidden from the default Watchlist grid — and this one can NEVER be watched
-- by a Sprout viewer (source-locked), so without a real presence link it
-- would vanish from FAV-WL-005's own fixture. Link it to the seeded Rose
-- instance so it keeps derived "active" presence regardless of tier.
INSERT INTO public.plant_instance_ailments (id, plant_instance_id, ailment_id, home_id, status)
VALUES (
  '00000000-0000-0000-000e-000000000004',
  '00000000-0000-0000-0004-000000000003',
  '00000000-0000-0000-0007-000000000018',
  '00000000-0000-0000-0000-000000000002',
  'active'
)
ON CONFLICT (plant_instance_id, ailment_id) DO NOTHING;

-- Favourite ailment 1 — "Aphid", dedupes against the seeded home ailment.
INSERT INTO public.user_favourite_ailments (
  id, user_id, ailment_library_id, identity_key, source, name, ailment_type,
  thumbnail_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000000-0000-0000-0018-000000000001',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'aphid',
  'manual',
  'Aphid',
  'pest',
  NULL,
  '{"scientific_name":"Aphidoidea","description":"Small sap-sucking insects that cluster on young shoots.","affected_plants":["Rose","Tomato"],"prevention_steps":[{"id":"p1","step_order":1,"title":"Encourage predators","description":"Attract ladybirds.","task_type":"inspect","frequency_type":"weekly"}],"remedy_steps":[{"id":"r1","step_order":1,"title":"Blast with water","description":"Dislodge colonies.","task_type":"water","frequency_type":"daily"}]}'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (user_id, identity_key) WHERE ailment_library_id IS NULL DO UPDATE SET
  snapshot = EXCLUDED.snapshot,
  name     = EXCLUDED.name;

-- Favourite ailment 2 — "Rose Rust", clean add-to-home case (not in any home).
INSERT INTO public.user_favourite_ailments (
  id, user_id, ailment_library_id, identity_key, source, name, ailment_type,
  thumbnail_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000000-0000-0000-0018-000000000002',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'rose rust',
  'manual',
  'Rose Rust',
  'disease',
  NULL,
  '{"scientific_name":"Phragmidium tuberculatum","description":"Orange pustules on the undersides of rose leaves.","affected_plants":["Rose"],"prevention_steps":[{"id":"p1","step_order":1,"title":"Improve airflow","description":"Prune for good circulation.","task_type":"prune","frequency_type":"weekly"}],"remedy_steps":[{"id":"r1","step_order":1,"title":"Remove infected leaves","description":"Bag and bin affected foliage.","task_type":"remove","frequency_type":"daily"}]}'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (user_id, identity_key) WHERE ailment_library_id IS NULL DO UPDATE SET
  snapshot = EXCLUDED.snapshot,
  name     = EXCLUDED.name;

-- Worker 1 ONLY — "Slugs" ailment in the second home + its favourite.
INSERT INTO public.ailments (
  id, home_id, name, scientific_name, type, source,
  description, symptoms, affected_plants, prevention_steps, remedy_steps, is_archived
)
VALUES (
  '00000001-0000-0000-0007-999000000018',
  '00000001-0000-0000-0000-000000000022',
  'Slugs',
  'Gastropoda',
  'pest',
  'manual',
  'Nocturnal molluscs that shred seedlings and leave slime trails.',
  '["Ragged holes in leaves","Silvery slime trails"]'::jsonb,
  ARRAY['Hosta', 'Lettuce'],
  '[]'::jsonb,
  '[]'::jsonb,
  false
)
ON CONFLICT (id) DO UPDATE SET
  name    = EXCLUDED.name,
  home_id = EXCLUDED.home_id;

INSERT INTO public.user_favourite_ailments (
  id, user_id, ailment_library_id, identity_key, source, name, ailment_type,
  thumbnail_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000001-0000-0000-0018-000000000003',
  '00000001-0000-0000-0000-000000000001',
  NULL,
  'slugs',
  'manual',
  'Slugs',
  'pest',
  NULL,
  '{"scientific_name":"Gastropoda","description":"Nocturnal molluscs that shred seedlings and leave slime trails.","affected_plants":["Hosta","Lettuce"],"prevention_steps":[],"remedy_steps":[]}'::jsonb,
  '00000001-0000-0000-0000-000000000022'
)
ON CONFLICT (user_id, identity_key) WHERE ailment_library_id IS NULL DO UPDATE SET
  snapshot = EXCLUDED.snapshot,
  name     = EXCLUDED.name;

-- ============================================================
-- Phase 3 — Favourite SEED PACKETS (UUID segment 0019)
-- ============================================================
-- Packets have NO canonical library → favourites are pure snapshots. Dedupe is
-- on (user_id, identity_key), identity_key = lower(variety) || '|' || lower(plant name).
-- There is no existing nursery E2E seed, so this block also plants the home
-- packets the favourites dedupe against.
--
-- Per worker (base prefix, substituted per worker):
--   * Home packet "Cherokee Purple / Tomato" (plant 1000001) → its favourite
--     0019-…01 matches by identity_key → heart pre-filled on the Home tab +
--     "In this home" on the Favourites tab (the dedupe case).
--   * Favourite 0019-…02 — "Cosmos" (seed_packet_id NULL, not in any home) →
--     the clean "Add to this home" case.
--
-- Worker 1 ONLY (hardcoded 00000001- prefix):
--   * A "Kale" packet in the SECOND home (Rooftop Terrace) + its favourite:
--     "Add to this home" in home 1, "In this home" after switching to the
--     Rooftop Terrace — proving the add-state recomputes on home switch while
--     the favourite persists.
-- ============================================================

-- Home packet the "Cherokee Purple" favourite dedupes against, linked to the
-- seeded manual Tomato (plant 1000001 per worker via substitution).
INSERT INTO public.seed_packets (
  id, home_id, plant_id, variety, vendor, sow_by, quantity_remaining, notes, is_archived
)
VALUES (
  '00000000-0000-0000-0019-00000000000a',
  '00000000-0000-0000-0000-000000000002',
  1000001,
  'Cherokee Purple',
  'Real Seeds',
  '2027-03-01',
  'about half a packet',
  'Rich smoky beefsteak — best sliced for sandwiches.',
  false
)
ON CONFLICT (id) DO UPDATE SET
  variety = EXCLUDED.variety,
  home_id = EXCLUDED.home_id,
  plant_id = EXCLUDED.plant_id;

-- Favourite packet 1 — "Cherokee Purple / Tomato", dedupes against the home packet.
INSERT INTO public.user_favourite_seed_packets (
  id, user_id, seed_packet_id, plant_id, plant_common_name, variety, vendor,
  identity_key, copied_image_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000000-0000-0000-0019-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0019-00000000000a',
  1000001,
  'Tomato',
  'Cherokee Purple',
  'Real Seeds',
  'cherokee purple|tomato',
  NULL,
  '{"sow_by":"2027-03-01","notes":"Rich smoky beefsteak — best sliced for sandwiches.","quantity_remaining":"about half a packet"}'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (user_id, identity_key) DO UPDATE SET
  snapshot = EXCLUDED.snapshot,
  variety  = EXCLUDED.variety;

-- Favourite packet 2 — "Cosmos", clean add-to-home case (not in any home).
-- plant_common_name NULL → identity_key 'sensation mix|', so after add-to-home
-- (which creates a plant-less packet) the recreated packet's identity matches
-- and the card flips to "In this home".
INSERT INTO public.user_favourite_seed_packets (
  id, user_id, seed_packet_id, plant_id, plant_common_name, variety, vendor,
  identity_key, copied_image_url, snapshot, favourited_from_home_id
)
VALUES (
  '00000000-0000-0000-0019-000000000002',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  NULL,
  NULL,
  'Sensation Mix',
  'Sarah Raven',
  'sensation mix|',
  NULL,
  '{"sow_by":"2027-04-15","notes":"Cut-and-come-again for late-summer bouquets.","quantity_remaining":"full packet"}'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (user_id, identity_key) DO UPDATE SET
  snapshot = EXCLUDED.snapshot,
  variety  = EXCLUDED.variety;

-- Worker 1 ONLY — "Kale" packet in the second home + its favourite.
INSERT INTO public.seed_packets (
  id, home_id, plant_id, variety, vendor, sow_by, quantity_remaining, notes, is_archived
)
VALUES (
  '00000001-0000-0000-0019-99000000000b',
  '00000001-0000-0000-0000-000000000022',
  NULL,
  'Cavolo Nero',
  'Real Seeds',
  '2027-05-01',
  'full packet',
  'Tuscan kale — hardy through the rooftop winter.',
  false
)
ON CONFLICT (id) DO UPDATE SET
  variety = EXCLUDED.variety,
  home_id = EXCLUDED.home_id;

INSERT INTO public.user_favourite_seed_packets (
  id, user_id, seed_packet_id, plant_id, plant_common_name, variety, vendor,
  identity_key, copied_image_url, snapshot, favourited_from_home_id
)
-- plant_common_name NULL + identity_key 'cavolo nero|' so it matches the home
-- packet (which has plant_id NULL) via isFavouritePacketInHome after switching.
VALUES (
  '00000001-0000-0000-0019-000000000003',
  '00000001-0000-0000-0000-000000000001',
  '00000001-0000-0000-0019-99000000000b',
  NULL,
  NULL,
  'Cavolo Nero',
  'Real Seeds',
  'cavolo nero|',
  NULL,
  '{"sow_by":"2027-05-01","notes":"Tuscan kale — hardy through the rooftop winter.","quantity_remaining":"full packet"}'::jsonb,
  '00000001-0000-0000-0000-000000000022'
)
ON CONFLICT (user_id, identity_key) DO UPDATE SET
  snapshot = EXCLUDED.snapshot,
  variety  = EXCLUDED.variety;
