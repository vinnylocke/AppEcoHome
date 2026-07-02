# Complete the Sprout test account — all applicable data

## Goal
The first Sprout seed only covered 16 tables. Sprout is gated out of just **AI Insights** + **Head Gardener** (and AI/Perenual via the two profile flags) — everything else (nursery/seeds, garden walk, zones, light sensor, smart-home integrations, etc.) is open to it. Extend `scripts/seed-test-account.mjs` so a Sprout account has **all applicable manual data**, starting with the nursery/seeds the user called out.

## Classification (from a full schema + tier-gate audit)
- **Already seeded (16):** locations, areas, plants, inventory_items, task_blueprints, tasks, ailments, plant_instance_ailments, notes, note_links, plant_journals, yield_records, garden_layouts, garden_shapes, shopping_lists, shopping_list_items.
- **AI-gated → skip for Sprout:** area_scans, plant_doctor_sessions, doctor_history, garden_brief, garden_manager_*, area_ai_insights, home_grow/pest/seasonal_*, automation_suggestions, weekly_overviews, planner_ai_memory, chat_*, ai_*.
- **Cron/derived/cache → skip:** weather_snapshots, pollen_snapshots, home_climate, soil_moisture_profiles, automation_runs, *_cache, species_cache, plant_library*, telemetry.
- **Needs real storage objects → skip (would render broken images):** garden_shape_photos, plan_photos, visualiser_captures.

## Group A — manual content tables to ADD (safe, no side effects)
All home- or user-scoped, user-created, no AI/Perenual/device needed:
1. **seed_packets** + **seed_sowings** — the Nursery (seeds + sowing batches; sowings reference a packet, statuses sown/germinated/planted_out/discarded). *The thing the user asked for.*
2. **todo_lists** — a couple of dated to-do lists.
3. **pruning_records** — pruning log on planted instances (like yields).
4. **garden_zones** + **garden_zone_shapes** — watering/planting zones over the existing layout shapes.
5. **garden_shape_notes** — per-bed notes on layout shapes.
6. **home_quiz_completions** — marks the habit quiz done (clears the dashboard banner).
7. **planner_preferences** — a handful of plant/aesthetic likes & dislikes (lived-in profile).
8. **garden_shape_templates** (user-scoped) — saved bed templates.
9. **guide_bookmarks** (user-scoped) — best-effort: bookmark a few existing global `guides` if any exist.
10. **garden_walk_sessions** (+ **garden_walk_visits**) — a logged garden walk (shape confirmed at build time).

## Group B — smart-home set (applicable to Sprout, but has live-cron side effects) — NEEDS A DECISION
integrations + devices + automations (+ automation_actions) + automation_devices/sensors + area_lux/moisture/temp/ec_readings. Sprout is allowed these, BUT seeding them on **prod** means:
- `integrations.credentials_encrypted` would be a placeholder → the ecowitt/eWeLink **sync cron** would try to contact a non-existent account and log errors.
- **Active** automations would be evaluated by `evaluate-automations` every 5 min → attempts to fire fake valves + could send failure notifications to the test user.

**Mitigation if we include it:** seed the integration in a non-syncing state and automations with **`is_active=false`** (display-only), so the Integrations/Automations tabs + sensor charts are populated but no live cron fires against fake hardware. Sensor area-readings (lux/moisture/temp/ec) are pure data → always safe.

→ **Question for the user:** include Group B as inactive/display-only, or skip the smart-home data for now?

## Approach
- Extend `seedHome()` in `scripts/seed-test-account.mjs` with the Group A tables (and Group B if chosen). Same home-scoped reset+seed; add the new tables to `resetHome()`'s delete list (FK-safe order) so re-runs stay idempotent.
- Verify exact columns/enums against the migrations as I add each (the dry-run will catch any mismatch).
- **Local dry-run + integrity check first**, then re-run on prod for `test.rhozly+sprout@rhozly.com` (it's a reset+seed, so it cleanly replaces the current data).

## Tests / docs
- This is a dev-tooling script (not app code) — no app tests. Update `docs/plans/seed-test-accounts.md` notes + the memory to record the expanded coverage.

## Risk
- Reset+seed wipes & rebuilds only the test account's homes (guarded to `test.rhozly+…`).
- Group B only if approved, and only inactive/non-syncing to avoid prod cron noise.
