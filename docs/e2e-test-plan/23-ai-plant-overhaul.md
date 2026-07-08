# 23. AI Plant Overhaul — Freshness Chip + Override Flow

**Spec files:** `tests/e2e/specs/ai-plant-freshness.spec.ts` (Wave 5) · `tests/e2e/specs/ai-plant-override.spec.ts` (Wave 6)
**Seed dependencies:** `13_ai_freshness.sql` — see [01-seeded-fixtures.md § AI plant freshness + override forks](01-seeded-fixtures.md#ai-plant-freshness--override-forks-13_ai_freshnesssql)
**Per-test reset (freshness):** inline `beforeEach` re-upserts `user_plant_ack.seen_freshness_version=1` so AI-FRESH-001/002 stay re-runnable after AI-FRESH-003 acknowledges.
**App-reference:** [99-cross-cutting/25-plant-providers.md](../app-reference/99-cross-cutting/25-plant-providers.md), [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md)

## Freshness chip + acknowledge (Wave 5)

The seed adds a global Cherry Tomato at `freshness_version=2` with `updated_care_fields=["sunlight","watering_min_days"]`, a per-home shallow fork, and a `user_plant_ack` at version 1 — so the chip fires on load.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| AI-FRESH-001 | ✅ | Shed card shows the Updated chip on Cherry Tomato — `ai-updated-chip` contains "Update available" (2026-07-08 calm-down) | — | ✅ Passing |
| AI-FRESH-002 | ✅ | Opening the plant shows the yellow callout — `ai-care-update-callout` contains "Sunlight" + "watering" labels | — | ✅ Passing |
| AI-FRESH-003 | ✅ | Keep mine (ack) dismisses the callout — optimistic local clear (was "Mark as reviewed"; callout now also offers "Apply updates") | — | ✅ Passing |

## Override flow (Wave 6)

The seed adds a Lavender global + a per-home **CUSTOM fork** with `overridden_fields = ["watering_min_days"]`.

**Important:** the Lavender custom fork shares its common name with the seeded inventory Lavender. Tests target the fork by per-worker plant ID (`${workerNum + 1}00013`), not by `plantCard("Lavender")`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| AI-OVERRIDE-001 | ✅ | Catalogue-tracking Cherry Tomato shows `ai-source-chip-catalogue`; custom chip absent | — | ✅ Passing |
| AI-OVERRIDE-002 | ✅ | Custom Lavender fork shows `ai-source-chip-custom` + `ai-care-reset`; Refresh-now rendered disabled (not hidden — better discoverability) | — | ✅ Passing |
| AI-OVERRIDE-003 | ✅ | Reset opens confirm modal → Cancel keeps fork custom | — | ✅ Passing |
| AI-OVERRIDE-004 | ✅ | Expanding Care Requirements → `form-field-overridden-watering` badge contains "Custom" | — | ✅ Passing |
