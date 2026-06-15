# 21. Companion Plants Tab

**Spec file:** `tests/e2e/specs/companion-plants.spec.ts`
**Seed dependencies:** `02_plants_shed.sql` (any seeded shed plant)
**Mocks:** `companion-planting` edge function → `{ beneficial, harmful, neutral }` or `{ error: "ai_required" }`. Use `mockEdgeFunction(page, "companion-planting", ...)`.
**App-reference:** [03-garden-hub/](../app-reference/03-garden-hub/) (plant modal companion tab)

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CPT-001 | ✅ | `plant-modal-tab-companions` visible after opening first shed plant | — | ✅ Passing |
| CPT-002 | ✅ | Click tab → `companion-section-beneficial` visible | `companion-planting` | ✅ Passing |
| CPT-003 | ✅ | Beneficial section lists "Basil" + "Marigold" | `companion-planting` | ✅ Passing |
| CPT-004 | ✅ | Harmful section lists "Fennel" | `companion-planting` | ✅ Passing |
| CPT-005 | ✅ | Neutral collapsed by default; expands on click ("Parsley") | `companion-planting` | ✅ Passing |
| CPT-006 | ✅ | Check companion → `companion-add-to-shed` visible → opens PlantSourcePicker | `companion-planting` | ✅ Passing |
| CPT-007 | ✅ | `ai_required` response → "AI Add-on Required" upgrade message | `companion-planting` → ai_required | ✅ Passing |
| CPT-008 | 🔲 | ⓘ peek populates info pills + description; `companion-open-{key}` opens PlantDetailModal cloning from library/provider. Resolution order: library → Verdantly/Perenual → AI by name | `plant_library` RPC + provider search mocks | 🔲 Planned |
