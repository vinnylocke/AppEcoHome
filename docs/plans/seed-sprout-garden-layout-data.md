# Plan — make the garden layout fully testable on the Sprout test account

**Goal:** every garden-layout overlay + feature (pH, sun, moisture, microclimate, plant tokens, ailment rings, task counts, companions) visibly *does something* and can be exercised end-to-end on the Sprout test account.

## What I found (live prod state of the Sprout account)

The Sprout home (`eee87e36-…e649ea`, "Maple Cottage Garden", lat 51.5072 / lng -0.1276) already has a **well-formed layout** — this is the exact layout from the RHOZLY-3Y crash (`2a653854-…`): 6 rect beds each linked to an area, plus an unlinked Path + Lawn. So the plumbing is fine. The overlays "do nothing" for **data-range**, not wiring, reasons:

| Feature | Data source (verified in code) | Current Sprout state | Why it looks dead |
|---|---|---|---|
| **pH overlay** | `areas.medium_ph` (per shape's `area_id`) → banded tint | all 6 beds **5.9–7.0** | 4 beds fall in the 6.5–7.5 band = a **20%-alpha grey** (near-invisible); 2 amber. No acidic-red or alkaline-blue ever renders. |
| **Sun overlay** | client-computed `computeAllShapesSunHours(shapes, home lat/lng, date)` | coords ✓, shapes ✓ | It *should* compute — **but toggling it is what threw RHOZLY-3Y** (Perenual `sunlight` arrays). That's fixed in OS 37.0007, so this is likely already resolved; the plan adds varied plant sun-prefs so sun-**fit** shows match/mismatch, not just "unknown". |
| **Moisture overlay** | latest `device_readings` (<24h) on `soil_sensor` devices linked to the bed's area | **1** sensor (Raised Bed A), reading likely **stale** (custom_http isn't cron-polled) | At most one bed can tint, and only within 24h of a reading. |
| **Microclimate (frost/wind)** | wind = `garden_shapes.preset_id ∈ {wall,fence-panel,shed,greenhouse}` near the bed; frost = weather min-temp | no structure shapes; London summer forecast | Every bed reads "Exposed"; frost "None". |
| **Plant tokens** | `inventory_items` (Planted) in the bed's area + `plants.sunlight` | beds have plants ✓ | Fine. |
| **Ailment rings** | `plant_instance_ailments` (status `active`) grouped by area → low(1)/moderate(2–3)/severe(4+) | **3** active links (≈1–2 beds) | Only low/one-moderate ring shows; never severe. |
| **Task badges** | non-Completed/Skipped `tasks` due ≤ today overlapping the bed's plants | seeded ✓ | Fine; verify each bed has one. |
| **Companions** | `companion-planting` edge fn (Perenual/AI, cached in `companion_cache`) | Sprout = `enable_perenual:false, ai_enabled:false` | **Tier-limited on Sprout** — see caveats. |

**App-reference / code consulted:** `src/components/GardenLayoutEditor.tsx`, `src/hooks/useShapeLiveState.ts`, `src/lib/garden/microclimate.ts` + `sunFit.ts`, `garden_shapes`/`garden_layouts` migrations, `scripts/seed-test-account.mjs`; cross-check `docs/app-reference/99-cross-cutting/28-sun-analysis.md`, `09-data-model-integrations.md`. Values verified by live prod queries against the Sprout home.

## Proposed changes (all in `scripts/seed-test-account.mjs`, the canonical per-tier seeder)

1. **pH — spread `medium_ph` across all 5 bands** (`areaDefs`): e.g. `4.9` (acidic red), `6.1` (amber), `6.9` (neutral grey), `7.8` (light blue), `8.4` (alkaline blue), + one more. Every pH colour then appears.
2. **Moisture — sensors + fresh readings on ~3 beds.** Extend the smart-home seed: soil sensors on 3 beds with `device_readings` at *seed time* carrying a spread — dry (`~22%` amber), ideal (`~45%` green), wet (`~72%` blue). (Readings age out after 24h; the account's custom_http sensors are "pingable", so I'll also add a one-line "re-ping" helper/snippet to refresh them for a later session.)
3. **Microclimate — add structure shapes.** Add `wall` / `greenhouse` `preset_id` shapes adjacent to 2–3 beds so wind exposure varies (Sheltered vs Exposed). Frost is weather-driven; optionally seed a `weather_snapshots` row with a cold night (min ≤ 0 °C) so frost risk demonstrably renders (flagged as optional since it overrides real weather).
4. **Ailment rings — a low/moderate/severe spread.** Seed active `plant_instance_ailments` so three beds carry 1, 3, and 5 active links → all three ring severities.
5. **Sun-fit — varied plant sun-prefs per bed.** Ensure each bed's plants include a mix of Full Sun / Partial / Shade so the sun overlay's fit summary shows match, adjacent, and mismatch (data already has `sunlight`; this just balances distribution).
6. **Task badges — one overdue + one due-today per bed** (top up if any bed is empty).

Because these live in the seeder, every tier account benefits and re-seeds stay complete.

## How to apply — two options

- **A (recommended): enhance the seeder + re-run for Sprout** (`node scripts/seed-test-account.mjs --email <sprout> --tier sprout --prod`). It's home-scoped reset+seed, so the account is regenerated cleanly. Downside: new layout id (the `2a653854…` bookmark changes).
- **B: non-destructive top-up** — a small one-off script that only `UPDATE`s the existing beds' `medium_ph` and `INSERT`s the extra sensors/readings/structures/ailments onto the current home, preserving the current layout + ids. Keeps the bookmark; less canonical.

I'd do **A** (canonical, benefits all tiers) unless you want to preserve the current layout ids, in which case **B**.

## Caveats / decisions for you

- **Companions are genuinely tier-limited on Sprout** (needs Perenual or AI, both off for Sprout). To test companions we'd either (a) temporarily flip `enable_perenual`/`ai_enabled` on this account, or (b) test companions on the Botanist/Sage account instead. Which do you prefer?
- **Moisture readings expire after 24h** (custom_http sensors aren't polled). Seeded readings are fresh for the session right after seeding; I'll include the re-ping snippet for later.
- **Frost overlay** depends on real forecast; forcing it needs a seeded cold `weather_snapshots` row that overrides live weather until the next `sync-weather`. Include it, or leave frost to real cold snaps?

## Delivered (2026-07-11)

Approved: re-run the seeder (A), companions left out, frost included. Implemented in `scripts/seed-test-account.mjs`:
- **pH** — outdoor `areaDefs` now span all five bands (4.9 / 5.9 / 6.1 / 6.9 / 7.8 / 8.4).
- **Moisture** — `seedSmartHome` seeds **3** soil sensors (Raised Bed A ideal ~50%, Veg Patch dry ~24%, Raised Bed B wet ~74%) with readings stamped *now*.
- **Wind** — four sheltering structures (`preset_id` wall/shed/greenhouse, `extrude_m ≥ 1`) placed so one bed is Sheltered, two Partly, the rest Exposed.
- **Frost** — a cold-snap `weather_snapshots` upsert (worst night **-4 °C** = Severe) — overrides real weather until the next `sync-weather`.
- **Ailment rings** — active links concentrated 1 / 3 / 5 across three beds → low / moderate / severe.
- **Sun** — already fine (home has coords, plants have varied sun-prefs); the "did nothing" was the RHOZLY-3Y crash, fixed in OS 37.0007.

**Also fixed a footgun:** the seeder used to *reset* an existing account's password (and hard-require `--password` on `--prod`), violating the "never reset a test account's password" rule. It now checks existence first and reuses accounts without touching the password; `--password` is required only when genuinely creating.

Validated end-to-end against a local throwaway account, then run on prod for `test.rhozly+sprout@rhozly.com` (reused, password unchanged). Verified live: pH 4.9→8.4, moisture 50/24/74 (fresh), structures + heights, frost min -4. New layout id `2064b30b-…` (the old `2a653854` bookmark is retired by the re-seed).

**Caveats to remember when testing:** moisture readings expire after 24h (re-run the seeder to refresh); the cold-snap weather lasts until the next daily `sync-weather`; companions stay tier-locked on Sprout by design.
