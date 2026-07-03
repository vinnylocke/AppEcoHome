import { describe, test, expect } from "vitest";
import {
  PLANT_TEMPLATE,
  AILMENT_TEMPLATE,
  SEED_PACKET_TEMPLATE,
  AILMENT_TEMPLATE_COLUMNS,
  SEED_PACKET_TEMPLATE_COLUMNS,
  PLANT_TEMPLATE_PLANT_COLUMNS,
  PLANT_TEMPLATE_SCRATCH_HEADERS,
  parseCsv,
} from "../../../../src/lib/uploadTemplates";

/**
 * PARITY GUARD (RHO-4 Phase 1).
 *
 * The template's plant-column headers MUST match the exact set of plants
 * columns ManualPlantCreation's `cleanPayload` writes — minus `thumbnail_url`,
 * which is deliberately excluded from CSV (a CSV can't carry a photo; answer 5).
 *
 * This is the anti-drift guard: if someone adds/renames a column on the manual
 * form, this pinned list forces them to update the template in the same change
 * (or consciously decide to exclude it here).
 *
 * The pinned list is copied verbatim from ManualPlantCreation.tsx `cleanPayload`
 * keys (the authoritative insert payload — the CSV matches cleanPayload, not the
 * larger form state which carries hardiness/leaf/etc. that cleanPayload strips).
 */
const CLEAN_PAYLOAD_KEYS = [
  "common_name",
  "scientific_name",
  "description",
  "plant_type",
  "cycle",
  "care_level",
  "growth_rate",
  "maintenance",
  "watering_min_days",
  "watering_max_days",
  "sunlight",
  "flowering_season",
  "harvest_season",
  "pruning_month",
  "propagation",
  "attracts",
  "is_toxic_humans",
  "is_toxic_pets",
  "indoor",
  "is_edible",
  "drought_tolerant",
  "tropical",
  "medicinal",
  "cuisine",
  "thumbnail_url",
  "labels",
] as const;

/** Explicitly excluded from the CSV (image is a per-plant UI action). */
const EXCLUDED_FROM_CSV = new Set(["thumbnail_url"]);

describe("PLANT_TEMPLATE ↔ cleanPayload parity", () => {
  test("template plant-columns match cleanPayload keys (minus excluded)", () => {
    const expected = CLEAN_PAYLOAD_KEYS.filter((k) => !EXCLUDED_FROM_CSV.has(k)).sort();
    const actual = [...PLANT_TEMPLATE_PLANT_COLUMNS].sort();
    expect(actual).toEqual(expected);
  });

  test("no cleanPayload key (except excluded) is missing from the template", () => {
    const headers = new Set(PLANT_TEMPLATE.fields.map((f) => f.header));
    for (const key of CLEAN_PAYLOAD_KEYS) {
      if (EXCLUDED_FROM_CSV.has(key)) continue;
      expect(headers.has(key)).toBe(true);
    }
  });

  test("the template does not smuggle in an excluded column", () => {
    const headers = new Set(PLANT_TEMPLATE.fields.map((f) => f.header));
    for (const key of EXCLUDED_FROM_CSV) expect(headers.has(key)).toBe(false);
  });

  test("scratch headers (variety/quantity/notes/favourite) exist but aren't plant columns", () => {
    const headers = new Set(PLANT_TEMPLATE.fields.map((f) => f.header));
    for (const h of PLANT_TEMPLATE_SCRATCH_HEADERS) {
      expect(headers.has(h)).toBe(true);
      expect(PLANT_TEMPLATE_PLANT_COLUMNS).not.toContain(h);
    }
  });

  test("favourite is a bool FieldSpec defaulting off, and never a plants column", () => {
    const fav = PLANT_TEMPLATE.fields.find((f) => f.header === "favourite");
    expect(fav).toBeDefined();
    expect(fav!.kind).toBe("bool");
    expect(PLANT_TEMPLATE_PLANT_COLUMNS).not.toContain("favourite");
  });

  test("every field has a unique header, a label, and an example", () => {
    const seen = new Set<string>();
    for (const f of PLANT_TEMPLATE.fields) {
      expect(seen.has(f.header)).toBe(false);
      seen.add(f.header);
      expect(f.label.length).toBeGreaterThan(0);
      expect(typeof f.example).toBe("string");
    }
  });
});

describe("PLANT_TEMPLATE buildPayload → saveToShed skeleton shape", () => {
  test("a minimal valid row produces a source=manual skeleton with folded metadata", () => {
    const csv = "common_name,variety,quantity,notes\nTomato,Sungold,3,heavy cropper\n";
    const { rows } = parseCsv(csv, PLANT_TEMPLATE);
    expect(rows).toHaveLength(1);
    const p = rows[0].payload as Record<string, any>;
    expect(p.common_name).toBe("Tomato");
    expect(p.source).toBe("manual");
    expect(p.plant_metadata.variety).toBe("Sungold");
    expect(p.plant_metadata.bulk_import_notes).toContain("Bulk import: 3 plants");
    expect(p.plant_metadata.bulk_import_notes).toContain("heavy cropper");
    // variety-derived lowercase label present.
    expect(p.labels).toContain("sungold");
    // scratch keys must NOT leak onto the insert payload.
    expect(p.variety).toBeUndefined();
    expect(p.quantity).toBeUndefined();
    expect(p.notes).toBeUndefined();
    expect(p.favourite).toBeUndefined();
  });

  test("payload never contains a `thumbnail_url` key from CSV", () => {
    const csv = "common_name\nBasil\n";
    const { rows } = parseCsv(csv, PLANT_TEMPLATE);
    expect(rows[0].payload).not.toHaveProperty("thumbnail_url");
  });
});

/**
 * PARITY GUARD (RHO-4 Phase 2) — AILMENT_TEMPLATE ↔ the manual AddAilmentModal
 * insert payload. The authoritative shape is the `payload` object built in
 * AilmentWatchlist.tsx `AddAilmentModal.handleSave` (lines ~726–739). The
 * template's columns must match it minus:
 *   - `home_id`  — injected by the bulk modal at insert time, not a CSV column,
 *   - `source` / `perenual_id` / `thumbnail_url` — set by buildPayload, not user
 *     columns (source is always 'manual'; the other two are excluded like plants).
 */
const AILMENT_INSERT_KEYS = [
  "home_id",
  "name",
  "scientific_name",
  "type",
  "description",
  "symptoms",
  "affected_plants",
  "prevention_steps",
  "remedy_steps",
  "source",
  "perenual_id",
  "thumbnail_url",
] as const;

/** User-supplied CSV columns = insert keys minus the modal/buildPayload-owned ones. */
const AILMENT_BUILDPAYLOAD_OWNED = new Set([
  "home_id",
  "source",
  "perenual_id",
  "thumbnail_url",
]);

describe("AILMENT_TEMPLATE ↔ manual insert payload parity", () => {
  test("template columns match the user-supplied ailment insert keys", () => {
    const expected = AILMENT_INSERT_KEYS.filter(
      (k) => !AILMENT_BUILDPAYLOAD_OWNED.has(k),
    ).sort();
    const actual = [...AILMENT_TEMPLATE_COLUMNS].sort();
    expect(actual).toEqual(expected);
  });

  test("buildPayload output has exactly the ailments insert keys (minus home_id)", () => {
    const csv = "name,type\nAphids,pest\n";
    const { rows } = parseCsv(csv, AILMENT_TEMPLATE);
    const payload = rows[0].payload as Record<string, unknown>;
    const expected = AILMENT_INSERT_KEYS.filter((k) => k !== "home_id").sort();
    expect(Object.keys(payload).sort()).toEqual(expected);
    expect(payload.source).toBe("manual");
    // scratch favourite flag never leaks onto the insert payload.
    expect(payload).not.toHaveProperty("favourite");
  });

  test("type is required + validated against the DB CHECK values", () => {
    const typeField = AILMENT_TEMPLATE.fields.find((f) => f.header === "type")!;
    expect(typeField.required).toBe(true);
    expect(typeField.enumValues).toEqual(["pest", "disease", "invasive_plant"]);
    // A bad type is a per-row error (row blocked).
    const { rows } = parseCsv("name,type\nAphids,bogus\n", AILMENT_TEMPLATE);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].issues.some((i) => i.field === "type" && i.severity === "error")).toBe(true);
  });

  test("name is required — an empty name blocks the row", () => {
    const { rows } = parseCsv("name,type\n,pest\n", AILMENT_TEMPLATE);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].issues.some((i) => i.field === "name")).toBe(true);
  });

  test("description defaults to '' (NOT NULL column), never null", () => {
    const { rows } = parseCsv("name,type\nSlugs,pest\n", AILMENT_TEMPLATE);
    const p = rows[0].payload as Record<string, unknown>;
    expect(p.description).toBe("");
  });
});

describe("AILMENT_TEMPLATE symptom + step cell grammar (v1)", () => {
  test("`title [severity]` symptom cell → AilmentSymptom objects", () => {
    const csv =
      "name,type,symptoms\n" +
      "Aphids,pest,Sticky leaves [moderate]; Curled shoots\n";
    const { rows } = parseCsv(csv, AILMENT_TEMPLATE);
    const symptoms = (rows[0].payload as Record<string, any>).symptoms as any[];
    expect(symptoms).toHaveLength(2);
    expect(symptoms[0].title).toBe("Sticky leaves");
    expect(symptoms[0].severity).toBe("moderate");
    expect(symptoms[0].description).toBe("");
    expect(symptoms[0].location).toBe("");
    expect(typeof symptoms[0].id).toBe("string");
    // No severity suffix → defaults to mild.
    expect(symptoms[1].title).toBe("Curled shoots");
    expect(symptoms[1].severity).toBe("mild");
  });

  test("unknown severity is treated as part of the title (defaults mild)", () => {
    const csv = "name,type,symptoms\nBlight,disease,Wilting [nope]\n";
    const { rows } = parseCsv(csv, AILMENT_TEMPLATE);
    const symptoms = (rows[0].payload as Record<string, any>).symptoms as any[];
    expect(symptoms[0].severity).toBe("mild");
    expect(symptoms[0].title).toContain("Wilting");
  });

  test("step titles → full AilmentStep objects with StepBuilder defaults + order", () => {
    const csv =
      "name,type,prevention_steps\n" +
      "Aphids,pest,Encourage ladybirds; Inspect weekly\n";
    const { rows } = parseCsv(csv, AILMENT_TEMPLATE);
    const steps = (rows[0].payload as Record<string, any>).prevention_steps as any[];
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      title: "Encourage ladybirds",
      step_order: 1,
      task_type: "inspect",
      frequency_type: "once",
      description: "",
    });
    expect(steps[1].step_order).toBe(2);
  });

  test("favourite bool column exists, defaults off, is never an ailments column", () => {
    const fav = AILMENT_TEMPLATE.fields.find((f) => f.header === "favourite");
    expect(fav).toBeDefined();
    expect(fav!.kind).toBe("bool");
    expect(AILMENT_TEMPLATE_COLUMNS).not.toContain("favourite");
    // extractFavourite reads the flag.
    const { rows } = parseCsv("name,type,favourite\nAphids,pest,true\n", AILMENT_TEMPLATE);
    expect(rows[0].favourite).toBe(true);
  });
});

/**
 * PARITY GUARD (RHO-4 Phase 3 — FINAL) — SEED_PACKET_TEMPLATE ↔ the
 * `createSeedPacket` insert shape (nurseryService.CreateSeedPacketInput). The
 * template's user columns must match the insert keys minus:
 *   - `home_id`  — injected by the modal at save time, not a CSV column,
 *   - `plant_id` — resolved from `plant_name` (link-by-name) by the modal,
 *   - `image_url` — a per-packet UI action (a CSV can't carry a photo).
 * The template carries a `plant_name` scratch column INSTEAD of `plant_id` (the
 * link-by-name key), asserted separately.
 */
const CREATE_SEED_PACKET_KEYS = [
  "home_id",
  "plant_id",
  "variety",
  "vendor",
  "purchased_on",
  "opened_on",
  "sow_by",
  "quantity_remaining",
  "notes",
  "image_url",
] as const;

/** Insert keys the modal owns (not user CSV columns). */
const SEED_PACKET_MODAL_OWNED = new Set(["home_id", "plant_id", "image_url"]);

describe("SEED_PACKET_TEMPLATE ↔ createSeedPacket parity", () => {
  test("template columns = createSeedPacket keys minus modal-owned, plus plant_name link key", () => {
    const expected = [
      ...CREATE_SEED_PACKET_KEYS.filter((k) => !SEED_PACKET_MODAL_OWNED.has(k)),
      "plant_name", // the link-by-name scratch key replaces the resolved plant_id
    ].sort();
    const actual = [...SEED_PACKET_TEMPLATE_COLUMNS].sort();
    expect(actual).toEqual(expected);
  });

  test("plant_name is required (link-by-name key) and is not a seed_packets column", () => {
    const nameField = SEED_PACKET_TEMPLATE.fields.find((f) => f.header === "plant_name")!;
    expect(nameField.required).toBe(true);
    const { rows } = parseCsv("plant_name,variety\n,Sungold\n", SEED_PACKET_TEMPLATE);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].issues.some((i) => i.field === "plant_name")).toBe(true);
  });

  test("buildPayload output carries the createSeedPacket fields (minus modal-owned) + plant_name", () => {
    const csv = "plant_name,variety,vendor\nTomato,Sungold,Suttons\n";
    const { rows } = parseCsv(csv, SEED_PACKET_TEMPLATE);
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload.plant_name).toBe("Tomato");
    expect(payload.variety).toBe("Sungold");
    expect(payload.vendor).toBe("Suttons");
    // Modal-owned keys never appear on the template payload.
    expect(payload).not.toHaveProperty("home_id");
    expect(payload).not.toHaveProperty("plant_id");
    expect(payload).not.toHaveProperty("image_url");
    // Favourite scratch flag surfaces on the row, never on the payload.
    expect(payload).not.toHaveProperty("favourite");
  });

  test("sow_by rounds up, purchased_on/opened_on round down (partial dates)", () => {
    const sowBy = SEED_PACKET_TEMPLATE.fields.find((f) => f.header === "sow_by")!;
    const purchased = SEED_PACKET_TEMPLATE.fields.find((f) => f.header === "purchased_on")!;
    const opened = SEED_PACKET_TEMPLATE.fields.find((f) => f.header === "opened_on")!;
    expect(sowBy.datePartial).toBe("up");
    expect(purchased.datePartial).toBe("down");
    expect(opened.datePartial).toBe("down");
  });

  test("favourite bool column exists, defaults off, is never a seed_packets column", () => {
    const fav = SEED_PACKET_TEMPLATE.fields.find((f) => f.header === "favourite");
    expect(fav).toBeDefined();
    expect(fav!.kind).toBe("bool");
    expect(SEED_PACKET_TEMPLATE_COLUMNS).not.toContain("favourite");
    const { rows } = parseCsv("plant_name,favourite\nTomato,true\n", SEED_PACKET_TEMPLATE);
    expect(rows[0].favourite).toBe(true);
  });

  test("every field has a unique header, a label, and an example", () => {
    const seen = new Set<string>();
    for (const f of SEED_PACKET_TEMPLATE.fields) {
      expect(seen.has(f.header)).toBe(false);
      seen.add(f.header);
      expect(f.label.length).toBeGreaterThan(0);
      expect(typeof f.example).toBe("string");
    }
  });
});
