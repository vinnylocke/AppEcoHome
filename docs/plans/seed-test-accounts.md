# Seed comprehensive test accounts (start with Sprout)

## Goal

Populate the **live** database with a rich, realistic dataset for a tier test account — starting with **Sprout** (`test.rhozly+sprout@rhozly.com`), the heavily-manual free tier — so the whole app can be exercised as that user. Repeatable for one account per tier later.

## Approach — a parameterized, account-scoped "reset + seed" script

A node script `scripts/seed-test-account.mjs` (run with the **prod** service-role key from `.env`), parameterized by `email` + `tier`:

1. **Find-or-create the auth user** for the email (Supabase admin API). Set/keep a known password (see open questions).
2. **Resolve the account's home(s)** strictly from its `uid` (via `user_profiles` / `home_members`). **Every** read, delete and insert is scoped to those `home_id`s — the script can never touch another user's data.
3. **Reset** that account's existing test data (delete rows for those home_ids across the tables below) so re-runs are clean + idempotent. Homes/profile/membership are kept (or created on first run).
4. **Seed** the comprehensive dataset (below) for the tier.

This is **additive + isolated**: nothing outside the test account's homes is read or written. It runs against prod only after a successful local dry-run (create the same account locally, run, verify the app renders it).

## Tier specifics — Sprout (free, manual)

- `user_profiles`: `subscription_tier='sprout'`, `ai_enabled=false`, `enable_perenual=false`.
- Plants + ailments are all `source='manual'` (no Perenual/AI-sourced rows).
- **No AI-generated content**: skip `plans` (planner is AI-driven), AI insights, Head Gardener data, weather AI, etc. — a Sprout user wouldn't have these. (Weather snapshots/alerts come from the hourly cron once the home has a location + lat/lng, so those populate themselves.)
- Garden layouts ARE included (the `garden_layout` feature gate is open to all tiers).

## Dataset spec (comprehensive Sprout user)

- **2 homes** — e.g. "Home Garden" + "Allotment" (owner membership on both). One gets lat/lng so weather works.
- **~5 locations** across the homes (Front Garden, Back Garden, Greenhouse, Indoor, Allotment Plot).
- **~10 areas** (raised beds, borders, pots, lawn, windowsill) with `growing_medium` / `medium_ph` / `is_outside` / light set.
- **~18 manual `plants`** (Tomato, Basil, Lavender, Rose, Carrot, Lettuce, Strawberry, Courgette, Apple, Mint, Sunflower, Sage, Chilli, Blueberry, Hosta, Fern, Marigold, Garlic), `source='manual'`, realistic care fields.
- **~28 `inventory_items`** — mix of **In-Shed** (unplanted) and **Planted** (assigned to areas, with `planted_at`, `growth_state`); a couple Archived.
- **~12 `task_blueprints`** (routines) — watering/feeding/pruning/inspection/mowing, across `home`/`area`/`plant` scope, varied `frequency_days`.
- **~35 `tasks`** — standalone + blueprint-linked, spread across past (Completed/Skipped) and upcoming (Pending), various `type`s, some with areas/plants attached + a harvest-window one.
- **~7 `ailments`** (aphid, blackspot, slug, powdery mildew, vine weevil, blight, bindweed-invasive), `source='manual'`, with symptoms + prevention/remedy steps; **3–4 linked** to specific planted instances via `plant_instance_ailments`.
- **~6 `notes`** (rich-text) with `note_links` to areas/plants/ailments; a couple pinned.
- **~14 `plant_journals`** entries across several instances (germination, flowering, problems, harvests).
- **~6 `yield_records`** on harvested edibles.
- **1–2 `garden_layouts`** with ~8 `garden_shapes` (beds/paths/lawn), some linked to real `area_id`s.
- **1–2 `shopping_lists`** with plant + product items.
- `home_quiz_completions` + a few `planner_preferences` (so the profile looks lived-in).

## Build-time checks (verify against the seeds/migrations while coding — don't trust memory)
- Exact `inventory_items.status` vocabulary (Unplanted vs "In Shed" — confirm from `02_plants_shed.sql`).
- `plants.id` is an integer PK — confirm whether it auto-assigns; if not, the script reads `max(id)` and assigns above it so it can't collide with the global catalogue or other accounts.
- Exact column names / NOT NULL / CHECK enums per the schema reference compiled from the seeds.

## Safety
- **Strictly home-id-scoped** — resolve the test account's homes first; every statement filters on those ids. A guard refuses to run if the resolved email isn't a `test.rhozly+…` address.
- **Local dry-run first**, then prod only on explicit go-ahead.
- Re-running = wipe + reseed **that test account only** (safe; it's a throwaway account).
- Service-role key stays in `.env` (never committed); the script is committed but contains no secrets.

## Repeatability (other tiers, later)
- Same script, `--tier botanist|sage|evergreen` flips `subscription_tier` + `ai_enabled` / `enable_perenual`, and adds tier-appropriate rows (e.g. Perenual-sourced plants for Sage+, an AI plan + Head Gardener brief for AI tiers). Each account gets its own home(s), so datasets never collide.

## Open questions
1. **Account creation** — have you already signed up `test.rhozly+sprout@rhozly.com` (so you know the password), or should the script create it and I share a password with you?
2. **Scale** — is the spec above about right, or do you want more/less of anything?
3. **Go-ahead for the prod write** once the local dry-run looks good.
