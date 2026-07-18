// Stored-string option lists for the area "bed profile" selects
// (areas.water_movement / areas.nutrient_source). Shared by the Area
// Advanced settings panel (AreaAdvancedFields) and the Garden Walk
// bed-profile sheet (WalkReadingSheet) so the two surfaces can never
// drift on the persisted values — the `value` strings are what the DB
// stores and what the AI grounding reads.

export const WATER_MOVEMENT_OPTIONS = [
  { value: "Well-Drained", label: "Well-Drained" },
  { value: "Low-Drained", label: "Low-Drained (Pools)" },
  { value: "Recirculating", label: "Recirculating (Pump)" },
  { value: "Static", label: "Static / Deep Water" },
] as const;

export const NUTRIENT_SOURCE_OPTIONS = [
  { value: "Organic Breakdown", label: "Organic (Compost)" },
  { value: "Synthetic", label: "Synthetic / Salts" },
  { value: "Biowaste", label: "Biowaste (Fish/Aqua)" },
] as const;
