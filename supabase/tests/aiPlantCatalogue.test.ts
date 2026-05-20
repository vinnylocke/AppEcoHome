import { assertEquals } from "@std/assert";
import {
  diffCareGuide,
  normaliseScientificKey,
  parseMatchString,
} from "@shared/aiPlantCatalogue.ts";

// ──────────────────────────────────────────────────────────────────────────
// normaliseScientificKey
// ──────────────────────────────────────────────────────────────────────────

Deno.test("normaliseScientificKey — lowercases and trims first scientific name", () => {
  assertEquals(
    normaliseScientificKey(["  Solanum Lycopersicum  "], "Tomato"),
    "solanum lycopersicum",
  );
});

Deno.test("normaliseScientificKey — collapses internal whitespace", () => {
  assertEquals(
    normaliseScientificKey(["Solanum   lycopersicum"], "Tomato"),
    "solanum lycopersicum",
  );
});

Deno.test("normaliseScientificKey — falls back to common name when sci empty", () => {
  assertEquals(normaliseScientificKey([], "Brandywine Tomato"), "brandywine tomato");
});

Deno.test("normaliseScientificKey — falls back when first sci entry is empty string", () => {
  assertEquals(normaliseScientificKey([""], "Tomato"), "tomato");
});

Deno.test("normaliseScientificKey — accepts string for scientific_name", () => {
  assertEquals(
    normaliseScientificKey("Solanum lycopersicum", "Tomato"),
    "solanum lycopersicum",
  );
});

Deno.test("normaliseScientificKey — returns null when no usable input", () => {
  assertEquals(normaliseScientificKey([], ""), null);
  assertEquals(normaliseScientificKey(null, null), null);
});

// ──────────────────────────────────────────────────────────────────────────
// parseMatchString
// ──────────────────────────────────────────────────────────────────────────

Deno.test("parseMatchString — Common Name (Scientific) format", () => {
  assertEquals(
    parseMatchString("Tomato (Solanum lycopersicum)"),
    { commonName: "Tomato", scientificName: "Solanum lycopersicum" },
  );
});

Deno.test("parseMatchString — strips surrounding whitespace", () => {
  assertEquals(
    parseMatchString("  Cherry Tomato  ( Solanum lycopersicum cerasiforme )  "),
    { commonName: "Cherry Tomato", scientificName: "Solanum lycopersicum cerasiforme" },
  );
});

Deno.test("parseMatchString — no parens fallback", () => {
  assertEquals(
    parseMatchString("Tomato"),
    { commonName: "Tomato", scientificName: null },
  );
});

// ──────────────────────────────────────────────────────────────────────────
// diffCareGuide — structured fields
// ──────────────────────────────────────────────────────────────────────────

const baseCare = {
  plantData: {
    common_name: "Tomato",
    scientific_name: ["Solanum lycopersicum"],
    description: "A red fruit commonly mistaken for a vegetable.",
    plant_type: "Annual",
    cycle: "annual",
    care_level: "easy",
    growth_rate: "fast",
    maintenance: "low",
    watering_min_days: 2,
    watering_max_days: 4,
    sunlight: ["full sun"],
    flowering_season: ["Spring", "Summer"],
    harvest_season: ["Summer"],
    pruning_month: ["Apr", "May"],
    propagation: ["seed"],
    is_edible: true,
  },
};

Deno.test("diffCareGuide — identical payloads have no changes", () => {
  const d = diffCareGuide(baseCare, baseCare);
  assertEquals(d.changed, false);
  assertEquals(d.fieldNames, []);
});

Deno.test("diffCareGuide — single scalar field change", () => {
  const newCare = JSON.parse(JSON.stringify(baseCare));
  newCare.plantData.watering_max_days = 5;
  const d = diffCareGuide(baseCare, newCare);
  assertEquals(d.changed, true);
  assertEquals(d.fieldNames, ["watering_max_days"]);
  assertEquals(d.perField.watering_max_days, { before: 4, after: 5 });
});

Deno.test("diffCareGuide — sunlight array order doesn't trigger false positive", () => {
  const a = { plantData: { ...baseCare.plantData, sunlight: ["full sun", "part shade"] } };
  const b = { plantData: { ...baseCare.plantData, sunlight: ["part shade", "full sun"] } };
  const d = diffCareGuide(a, b);
  assertEquals(d.changed, false);
});

Deno.test("diffCareGuide — case-only string change doesn't trigger false positive", () => {
  const a = { plantData: { ...baseCare.plantData, cycle: "annual" } };
  const b = { plantData: { ...baseCare.plantData, cycle: "Annual" } };
  const d = diffCareGuide(a, b);
  assertEquals(d.changed, false);
});

Deno.test("diffCareGuide — array content change is detected", () => {
  const newCare = JSON.parse(JSON.stringify(baseCare));
  newCare.plantData.sunlight = ["part sun"];
  const d = diffCareGuide(baseCare, newCare);
  assertEquals(d.changed, true);
  assertEquals(d.fieldNames, ["sunlight"]);
});

Deno.test("diffCareGuide — boolean change is detected", () => {
  const newCare = JSON.parse(JSON.stringify(baseCare));
  newCare.plantData.is_edible = false;
  const d = diffCareGuide(baseCare, newCare);
  assertEquals(d.changed, true);
  assertEquals(d.fieldNames, ["is_edible"]);
});

Deno.test("diffCareGuide — multiple visible changes returned together", () => {
  const newCare = JSON.parse(JSON.stringify(baseCare));
  newCare.plantData.watering_min_days = 1;
  newCare.plantData.cycle = "Biennial";
  newCare.plantData.pruning_month = ["Mar", "Apr", "May"];
  const d = diffCareGuide(baseCare, newCare);
  assertEquals(d.changed, true);
  assertEquals(d.fieldNames.sort(), ["cycle", "pruning_month", "watering_min_days"]);
});

Deno.test("diffCareGuide — care_level (not user-visible) change is ignored", () => {
  // Wave 7 refresh-simplification: care_level, growth_rate, maintenance are
  // not rendered to the user, so the diff must not flag them. Otherwise the
  // Refresh toast says "N fields updated" for invisible noise.
  const newCare = JSON.parse(JSON.stringify(baseCare));
  newCare.plantData.care_level = "moderate";
  newCare.plantData.growth_rate = "Slow";
  newCare.plantData.maintenance = "High";
  const d = diffCareGuide(baseCare, newCare);
  assertEquals(d.changed, false);
  assertEquals(d.fieldNames, []);
});

// ──────────────────────────────────────────────────────────────────────────
// diffCareGuide — description is intentionally excluded (free-text noise)
// ──────────────────────────────────────────────────────────────────────────

Deno.test("diffCareGuide — description change is IGNORED (Gemini-rewrite noise)", () => {
  // Wave 7 refresh-simplification: Gemini at temp 0.2 still rewrites
  // descriptions slightly on every call. Counting description changes
  // produced "10 fields updated" noise on freshly-added plants. Excluded
  // from the diff entirely.
  const newCare = JSON.parse(JSON.stringify(baseCare));
  newCare.plantData.description = "A red fruit. Tasty when ripe.";
  const d = diffCareGuide(baseCare, newCare);
  assertEquals(d.changed, false);
  assertEquals(d.fieldNames, []);
});

Deno.test("diffCareGuide — whitespace-only change in description doesn't trigger", () => {
  const a = { plantData: { ...baseCare.plantData, description: "Tomato. Red." } };
  const b = { plantData: { ...baseCare.plantData, description: "  Tomato. Red.  " } };
  const d = diffCareGuide(a, b);
  assertEquals(d.changed, false);
});

// ──────────────────────────────────────────────────────────────────────────
// diffCareGuide — schema evolution
// ──────────────────────────────────────────────────────────────────────────

Deno.test("diffCareGuide — new field added to schema counts as a change", () => {
  // Simulates the cron running against a row whose old payload doesn't have
  // a recently-added field. The new generation populates it. We expect the
  // chip to fire.
  const oldCare = { plantData: { ...baseCare.plantData } };
  const newCare = { plantData: { ...baseCare.plantData, drought_tolerant: true } };
  const d = diffCareGuide(oldCare, newCare);
  assertEquals(d.changed, true);
  assertEquals(d.fieldNames, ["drought_tolerant"]);
});

Deno.test("diffCareGuide — null vs undefined treated equivalently", () => {
  const a = { plantData: { ...baseCare.plantData, attracts: null } };
  const b = { plantData: { ...baseCare.plantData } };  // no attracts key
  const d = diffCareGuide(a, b);
  assertEquals(d.changed, false);
});

// ──────────────────────────────────────────────────────────────────────────
// diffCareGuide — robustness
// ──────────────────────────────────────────────────────────────────────────

Deno.test("diffCareGuide — handles missing plantData wrapper", () => {
  const a = { plantData: baseCare.plantData };
  const b = {};
  const d = diffCareGuide(a, b);
  assertEquals(d.changed, true);
  // Every defined field in `a` is treated as a change vs. missing in `b`.
  // (description from free-text + structured fields).
});

Deno.test("diffCareGuide — handles completely empty inputs", () => {
  const d = diffCareGuide({}, {});
  assertEquals(d.changed, false);
  assertEquals(d.fieldNames, []);
});
