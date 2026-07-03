// Upload-template registry (RHO-4 Phase 1).
//
// PLANT_TEMPLATE is the single source of truth for the plants CSV: the template
// download, the parser, per-field validation, and the review-step save all read
// it, so they cannot drift. The field matrix mirrors ManualPlantCreation's
// `cleanPayload` (the authoritative plant column set the manual form saves) plus
// the three bulk-paste extras (variety / quantity / notes) and a `favourite`
// flag (cross-home favourites integration, 2026-07-03).
//
// A parity unit test (tests/unit/lib/uploadTemplates/registry.test.ts) pins the
// template headers to the actual cleanPayload keys so the two can never drift.
//
// Deliberately EXCLUDED (per plan §5.1 + answers 2026-07-03):
//   * thumbnail_url / images — a CSV can't carry a photo; image picking stays a
//     per-plant UI action (answer 5).
//   * hardiness_min/max, salt_tolerant, thorny, invasive, flowers, leaf,
//     edible_leaf — form state that cleanPayload itself strips (not plants cols).
//   * AI-catalogue columns (care_guide_data, freshness_*) — server-managed.
//
// Phase 2 (AILMENT_TEMPLATE) and Phase 3 (SEED_PACKET_TEMPLATE) slot in by
// adding a new RecordTemplate below + registering it in TEMPLATES — csv.ts /
// parse.ts / template.ts need no changes.

import type { FieldSpec, ParsedValue, RecordTemplate } from "./types";

// ── Shared enum vocabularies (kept in sync with ManualPlantCreation) ─────────
const SUNLIGHT_VALUES = [
  "full sun",
  "part sun",
  "part shade",
  "filtered shade",
  "full shade",
];
const SEASON_VALUES = ["Spring", "Summer", "Autumn", "Winter", "Year-round"];
const MONTH_VALUES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const PROPAGATION_VALUES = [
  "Seed", "Bulb", "Cuttings", "Division", "Layering", "Grafting",
];
const ATTRACTS_VALUES = ["Bees", "Butterflies", "Hummingbirds", "Ladybugs", "Moths"];

// ── apply helpers — a FieldSpec.apply that just writes the coerced value ─────
const setKey =
  (key: string) =>
  (value: ParsedValue, payload: Record<string, unknown>): void => {
    payload[key] = value;
  };

/**
 * PLANT_TEMPLATE — the plants CSV contract.
 *
 * `apply` writes each column straight onto a flat working payload keyed by the
 * plants column name (plus `variety` / `quantity` / `favourite` scratch keys).
 * `buildPayload` then folds variety/quantity/notes into plant_metadata + labels,
 * exactly mirroring the existing BulkPastePlantsModal save, and strips the
 * scratch keys so the result is a clean `saveToShed` skeleton.
 */
export const PLANT_TEMPLATE: RecordTemplate = {
  id: "plant",
  filename: "rhozly-plants-template.csv",
  fields: [
    {
      header: "common_name",
      label: "Common name",
      required: true,
      kind: "text",
      maxLen: 120,
      example: "Tomato",
      apply: setKey("common_name"),
    },
    {
      header: "variety",
      label: "Variety",
      required: false,
      kind: "text",
      maxLen: 120,
      example: "Sungold",
      // Scratch key — folded into plant_metadata.variety + labels below.
      apply: setKey("variety"),
    },
    {
      header: "quantity",
      label: "Quantity",
      required: false,
      kind: "int",
      min: 1,
      max: 999,
      example: "3",
      // Scratch key — folded into a bulk_import_notes line below.
      apply: setKey("quantity"),
    },
    {
      header: "scientific_name",
      label: "Scientific name(s)",
      required: false,
      kind: "list",
      maxLen: 120,
      example: "Solanum lycopersicum",
      apply: setKey("scientific_name"),
    },
    {
      header: "description",
      label: "Description",
      required: false,
      kind: "text",
      maxLen: 2000,
      example: "Sweet cherry tomato, heavy cropper.",
      apply: setKey("description"),
    },
    {
      header: "plant_type",
      label: "Plant type",
      required: false,
      kind: "text",
      maxLen: 60,
      example: "Vegetable",
      apply: setKey("plant_type"),
    },
    {
      header: "cycle",
      label: "Cycle",
      required: false,
      kind: "text",
      maxLen: 60,
      example: "Annual",
      apply: setKey("cycle"),
    },
    {
      header: "care_level",
      label: "Care level",
      required: false,
      kind: "enum",
      enumValues: ["Beginner", "Intermediate", "Advanced"],
      example: "Beginner",
      apply: setKey("care_level"),
    },
    {
      header: "growth_rate",
      label: "Growth rate",
      required: false,
      kind: "enum",
      enumValues: ["Slow", "Medium", "Fast"],
      example: "Medium",
      apply: setKey("growth_rate"),
    },
    {
      header: "maintenance",
      label: "Maintenance",
      required: false,
      kind: "enum",
      enumValues: ["Low", "Medium", "High"],
      example: "Low",
      apply: setKey("maintenance"),
    },
    {
      header: "watering_min_days",
      label: "Watering min (days)",
      required: false,
      kind: "int",
      min: 1,
      max: 365,
      example: "2",
      apply: setKey("watering_min_days"),
    },
    {
      header: "watering_max_days",
      label: "Watering max (days)",
      required: false,
      kind: "int",
      min: 1,
      max: 365,
      example: "5",
      apply: setKey("watering_max_days"),
      crossValidate: (payload) => {
        const min = payload.watering_min_days;
        const max = payload.watering_max_days;
        if (
          typeof min === "number" &&
          typeof max === "number" &&
          min > max
        ) {
          return "watering_max_days must be greater than or equal to watering_min_days";
        }
        return null;
      },
    },
    {
      header: "sunlight",
      label: "Sunlight",
      required: false,
      kind: "enum-multi",
      enumValues: SUNLIGHT_VALUES,
      example: "full sun; part shade",
      apply: setKey("sunlight"),
    },
    {
      header: "flowering_season",
      label: "Flowering season",
      required: false,
      kind: "enum-multi",
      enumValues: SEASON_VALUES,
      example: "Summer",
      apply: setKey("flowering_season"),
    },
    {
      header: "harvest_season",
      label: "Harvest season",
      required: false,
      kind: "enum-multi",
      enumValues: SEASON_VALUES,
      example: "Summer; Autumn",
      apply: setKey("harvest_season"),
    },
    {
      header: "pruning_month",
      label: "Pruning months",
      required: false,
      kind: "enum-multi",
      enumValues: MONTH_VALUES,
      example: "Mar; Apr",
      apply: setKey("pruning_month"),
    },
    {
      header: "propagation",
      label: "Propagation",
      required: false,
      kind: "enum-multi",
      enumValues: PROPAGATION_VALUES,
      example: "Seed",
      apply: setKey("propagation"),
    },
    {
      header: "attracts",
      label: "Attracts wildlife",
      required: false,
      kind: "enum-multi",
      enumValues: ATTRACTS_VALUES,
      example: "Bees; Butterflies",
      apply: setKey("attracts"),
    },
    {
      header: "indoor",
      label: "Indoor",
      required: false,
      kind: "bool",
      example: "false",
      apply: setKey("indoor"),
    },
    {
      header: "is_edible",
      label: "Edible fruit",
      required: false,
      kind: "bool",
      example: "true",
      apply: setKey("is_edible"),
    },
    {
      header: "drought_tolerant",
      label: "Drought tolerant",
      required: false,
      kind: "bool",
      example: "false",
      apply: setKey("drought_tolerant"),
    },
    {
      header: "tropical",
      label: "Tropical",
      required: false,
      kind: "bool",
      example: "false",
      apply: setKey("tropical"),
    },
    {
      header: "is_toxic_pets",
      label: "Toxic to pets",
      required: false,
      kind: "bool",
      example: "false",
      apply: setKey("is_toxic_pets"),
    },
    {
      header: "is_toxic_humans",
      label: "Toxic to humans",
      required: false,
      kind: "bool",
      example: "false",
      apply: setKey("is_toxic_humans"),
    },
    {
      header: "medicinal",
      label: "Medicinal",
      required: false,
      kind: "bool",
      example: "false",
      apply: setKey("medicinal"),
    },
    {
      header: "cuisine",
      label: "Culinary use",
      required: false,
      kind: "bool",
      example: "true",
      apply: setKey("cuisine"),
    },
    {
      header: "labels",
      label: "Guide labels",
      required: false,
      kind: "list",
      example: "vegetable",
      apply: setKey("labels"),
    },
    {
      header: "notes",
      label: "Notes",
      required: false,
      kind: "text",
      maxLen: 400,
      // Scratch key — appended into bulk_import_notes below.
      example: "From the garden centre haul.",
      apply: setKey("notes"),
    },
    {
      header: "favourite",
      label: "Add to favourites",
      required: false,
      kind: "bool",
      example: "false",
      // Scratch key — read by the review step to call favouritePlant() after
      // insert; NOT a plants column, so buildPayload strips it.
      apply: setKey("favourite"),
    },
  ],
  buildPayload: (payload) => {
    const {
      variety,
      quantity,
      notes,
      favourite: _favourite,
      labels,
      ...plantCols
    } = payload as Record<string, unknown>;

    // Fold quantity + free-text notes into the bulk_import_notes line, mirroring
    // the existing BulkPastePlantsModal save exactly.
    const noteParts: string[] = [];
    if (typeof quantity === "number" && quantity > 0) {
      noteParts.push(`Bulk import: ${quantity} plant${quantity === 1 ? "" : "s"}`);
    }
    if (typeof notes === "string" && notes.trim()) noteParts.push(notes.trim());

    // Labels: user-supplied labels list, plus the lowercase variety label the
    // existing paste flow derives.
    const labelSet = new Set<string>();
    if (Array.isArray(labels)) {
      for (const l of labels) if (typeof l === "string" && l.trim()) labelSet.add(l.trim());
    }
    if (typeof variety === "string" && variety.trim()) {
      labelSet.add(variety.trim().toLowerCase());
    }

    const skeleton: Record<string, unknown> = {
      ...plantCols,
      source: "manual",
      plant_metadata: {
        variety: typeof variety === "string" && variety.trim() ? variety.trim() : null,
        bulk_import_notes: noteParts.length > 0 ? noteParts.join(" — ") : null,
      },
      // `plants.labels` is NOT NULL — default to an empty array (matches
      // ManualPlantCreation's cleanPayload, which sends `labels: []`).
      labels: [...labelSet],
    };
    return skeleton;
  },
  extractFavourite: (payload) => payload.favourite === true,
};

// ── Ailment enum vocabulary (matches the ailments_type_check DB constraint) ──
const AILMENT_TYPE_VALUES = ["pest", "disease", "invasive_plant"];

/**
 * AILMENT_TEMPLATE — the Watchlist CSV contract (RHO-4 Phase 2).
 *
 * Mirrors the manual `StepBuilder` add form in AilmentWatchlist.tsx (its insert
 * payload is the authoritative field set) — every uploaded ailment is
 * `source='manual'`. Grammar v1 (answers 2026-07-03): symptoms are
 * `title [severity]` per `;`-separated cell; prevention/remedy steps are titles
 * only. Full step config (task_type, frequency, product) stays in the detail
 * editor. `home_id` is NOT set here — the modal injects the active home id at
 * insert time (like the plant flow leaves ids to saveToShed).
 *
 * `thumbnail_url` / `perenual_id` are excluded (image is a per-ailment UI
 * action; perenual_id is provider-owned).
 */
export const AILMENT_TEMPLATE: RecordTemplate = {
  id: "ailment",
  filename: "rhozly-watchlist-template.csv",
  fields: [
    {
      header: "name",
      label: "Name",
      required: true,
      kind: "text",
      maxLen: 120,
      example: "Aphids",
      apply: setKey("name"),
    },
    {
      header: "type",
      label: "Type",
      required: true,
      kind: "enum",
      enumValues: AILMENT_TYPE_VALUES,
      example: "pest",
      apply: setKey("type"),
    },
    {
      header: "scientific_name",
      label: "Scientific name",
      required: false,
      kind: "text",
      maxLen: 120,
      example: "Aphidoidea",
      apply: setKey("scientific_name"),
    },
    {
      header: "description",
      label: "Description",
      required: false,
      kind: "text",
      maxLen: 2000,
      example: "Small sap-sucking insects that cluster on new growth.",
      apply: setKey("description"),
    },
    {
      header: "affected_plants",
      label: "Affected plants",
      required: false,
      kind: "list",
      maxLen: 120,
      example: "Roses; Beans",
      apply: setKey("affected_plants"),
    },
    {
      header: "symptoms",
      label: "Symptoms",
      required: false,
      kind: "symptoms",
      example: "Sticky leaves [moderate]; Curled shoots",
      apply: setKey("symptoms"),
    },
    {
      header: "prevention_steps",
      label: "Prevention steps",
      required: false,
      kind: "steps",
      example: "Encourage ladybirds; Inspect new growth weekly",
      apply: setKey("prevention_steps"),
    },
    {
      header: "remedy_steps",
      label: "Remedy steps",
      required: false,
      kind: "steps",
      example: "Blast with water; Apply insecticidal soap",
      apply: setKey("remedy_steps"),
    },
    {
      header: "favourite",
      label: "Add to favourites",
      required: false,
      kind: "bool",
      example: "false",
      // Scratch key — read by the review step to call favouriteAilment() after
      // insert; NOT an ailments column, so buildPayload strips it.
      apply: setKey("favourite"),
    },
  ],
  buildPayload: (payload) => {
    const p = payload as Record<string, unknown>;
    // `favourite` is a scratch flag surfaced via extractFavourite — never insert it.
    const { favourite: _favourite, ...cols } = p;
    return {
      name: (cols.name as string) ?? "",
      type: cols.type ?? "disease",
      scientific_name:
        typeof cols.scientific_name === "string" && cols.scientific_name.trim()
          ? cols.scientific_name.trim()
          : null,
      // `ailments.description` is NOT NULL DEFAULT '' — never send null.
      description: typeof cols.description === "string" ? cols.description : "",
      symptoms: Array.isArray(cols.symptoms) ? cols.symptoms : [],
      affected_plants: Array.isArray(cols.affected_plants) ? cols.affected_plants : [],
      prevention_steps: Array.isArray(cols.prevention_steps) ? cols.prevention_steps : [],
      remedy_steps: Array.isArray(cols.remedy_steps) ? cols.remedy_steps : [],
      source: "manual",
      perenual_id: null,
      thumbnail_url: null,
    };
  },
  extractFavourite: (payload) => payload.favourite === true,
};

/** The ailment-column keys AILMENT_TEMPLATE applies (excludes the `favourite`
 *  scratch key). Exposed for the parity test that pins these to the manual
 *  AddAilmentModal insert payload keys. `home_id` is added by the modal, not the
 *  template, so it's asserted separately. */
export const AILMENT_TEMPLATE_COLUMNS = AILMENT_TEMPLATE.fields
  .map((f) => f.header)
  .filter((h) => h !== "favourite");

/**
 * SEED_PACKET_TEMPLATE — the Nursery CSV contract (RHO-4 Phase 3 — FINAL).
 *
 * Mirrors `nurseryService.createSeedPacket`'s insert shape (the authoritative
 * per-row insert the existing paste flow already uses). Every column here is a
 * user-settable packet field; `home_id`, `plant_id` and `image_url` are NOT CSV
 * columns — the modal injects `home_id`, resolves `plant_id` by name at save
 * time (link-by-name), and images stay a per-packet UI action.
 *
 * Dates are FLEXIBLE (parse.ts `date` kind): full ISO plus `YYYY-MM` /
 * `Month YYYY`. `purchased_on` / `opened_on` round DOWN to the first of the
 * period; `sow_by` rounds UP to the last day (a deadline), exactly matching
 * parseSeedPackets.parseDatePhrase.
 *
 * `plant_name` is a scratch key: buildPayload keeps it on the working payload so
 * the modal can resolve it to a Shed plant_id (case-insensitive exact match);
 * unmatched names follow the existing unlinked-packet convention (plant_id null,
 * name preserved in a notes provenance line — the modal, not the template, does
 * that so it can see the resolution outcome).
 */
export const SEED_PACKET_TEMPLATE: RecordTemplate = {
  id: "seed_packet",
  filename: "rhozly-seed-packets-template.csv",
  fields: [
    {
      header: "plant_name",
      label: "Plant name",
      required: true,
      kind: "text",
      maxLen: 120,
      example: "Tomato",
      // Scratch key — the modal resolves it to a Shed plant_id (link-by-name).
      apply: setKey("plant_name"),
    },
    {
      header: "variety",
      label: "Variety",
      required: false,
      kind: "text",
      maxLen: 120,
      example: "Sungold",
      apply: setKey("variety"),
    },
    {
      header: "vendor",
      label: "Vendor",
      required: false,
      kind: "text",
      maxLen: 120,
      example: "Suttons",
      apply: setKey("vendor"),
    },
    {
      header: "purchased_on",
      label: "Purchased on",
      required: false,
      kind: "date",
      datePartial: "down",
      example: "2026-03",
      apply: setKey("purchased_on"),
    },
    {
      header: "opened_on",
      label: "Opened on",
      required: false,
      kind: "date",
      datePartial: "down",
      example: "2026-04",
      apply: setKey("opened_on"),
    },
    {
      header: "sow_by",
      label: "Sow by",
      required: false,
      kind: "date",
      datePartial: "up",
      example: "2028-12",
      apply: setKey("sow_by"),
    },
    {
      header: "quantity_remaining",
      label: "Quantity remaining",
      required: false,
      kind: "text",
      maxLen: 80,
      example: "~30 seeds",
      apply: setKey("quantity_remaining"),
    },
    {
      header: "notes",
      label: "Notes",
      required: false,
      kind: "text",
      maxLen: 400,
      example: "Heavy cropper, sweet.",
      apply: setKey("notes"),
    },
    {
      header: "favourite",
      label: "Add to favourites",
      required: false,
      kind: "bool",
      example: "false",
      // Scratch key — read by the review step to call favouriteSeedPacket()
      // after insert; NOT a seed_packets column, so buildPayload strips it.
      apply: setKey("favourite"),
    },
  ],
  buildPayload: (payload) => {
    const p = payload as Record<string, unknown>;
    const { favourite: _favourite, ...cols } = p;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    return {
      // plant_name is kept so the modal can resolve link-by-name; it is NOT a
      // seed_packets column — the modal folds it into plant_id/notes at save.
      plant_name: str(cols.plant_name),
      variety: str(cols.variety),
      vendor: str(cols.vendor),
      purchased_on: str(cols.purchased_on),
      opened_on: str(cols.opened_on),
      sow_by: str(cols.sow_by),
      quantity_remaining: str(cols.quantity_remaining),
      notes: str(cols.notes),
    };
  },
  extractFavourite: (payload) => payload.favourite === true,
};

/** The seed-packet column keys SEED_PACKET_TEMPLATE applies (excludes the
 *  `favourite` scratch key). Exposed for the parity test that pins these to the
 *  createSeedPacket insert keys. `plant_name` is a scratch link-by-name key (not
 *  a column — resolved to plant_id by the modal); it is asserted separately. */
export const SEED_PACKET_TEMPLATE_COLUMNS = SEED_PACKET_TEMPLATE.fields
  .map((f) => f.header)
  .filter((h) => h !== "favourite");

/**
 * Registry of every record template. Phase 1 exposes PLANT_TEMPLATE; Phase 2
 * adds AILMENT_TEMPLATE; Phase 3 adds SEED_PACKET_TEMPLATE.
 */
export const TEMPLATES: Record<string, RecordTemplate> = {
  [PLANT_TEMPLATE.id]: PLANT_TEMPLATE,
  [AILMENT_TEMPLATE.id]: AILMENT_TEMPLATE,
  [SEED_PACKET_TEMPLATE.id]: SEED_PACKET_TEMPLATE,
};

/** The plant-column keys a PLANT_TEMPLATE row applies (excludes the
 *  scratch keys variety/quantity/notes/favourite). Exposed for the parity test
 *  that pins these to ManualPlantCreation's cleanPayload. */
export const PLANT_TEMPLATE_PLANT_COLUMNS = PLANT_TEMPLATE.fields
  .map((f) => f.header)
  .filter((h) => !["variety", "quantity", "notes", "favourite"].includes(h));

/** Convenience list of the scratch (non-plants-column) headers. */
export const PLANT_TEMPLATE_SCRATCH_HEADERS = ["variety", "quantity", "notes", "favourite"];
