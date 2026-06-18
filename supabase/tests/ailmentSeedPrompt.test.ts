import { assert, assertEquals } from "@std/assert";
import {
  buildAilmentSeedPrompt,
  ailmentRowToColumnShape,
  parseAilmentBatch,
  AILMENT_SEED_BATCH_SCHEMA,
  type AilmentSeedRow,
} from "@shared/ailmentSeedPrompt.ts";

// ── prompt ───────────────────────────────────────────────────────────────────

Deno.test("buildAilmentSeedPrompt — asks for N + lists exclusions", () => {
  const p = buildAilmentSeedPrompt(8, ["Aphids", "Powdery mildew"]);
  assert(p.includes("Propose 8"));
  assert(p.includes("DO NOT include"));
  assert(p.includes("Aphids, Powdery mildew"));
  assert(p.includes("pest | disease | invasive | disorder") || p.includes("pest, disease, invasive, disorder") || p.includes("kind"));
});

Deno.test("buildAilmentSeedPrompt — no exclusion block when none", () => {
  const p = buildAilmentSeedPrompt(5, []);
  assert(!p.includes("DO NOT include"));
});

Deno.test("schema requires name + kind, wraps ailments array", () => {
  assertEquals((AILMENT_SEED_BATCH_SCHEMA.properties.ailments.items.required as readonly string[]).slice(), ["name", "kind"]);
  assert(AILMENT_SEED_BATCH_SCHEMA.required.includes("ailments"));
});

// ── row mapper ───────────────────────────────────────────────────────────────

const full: AilmentSeedRow = {
  name: "  Aphids ", kind: "pest", scientific_name: "Aphidoidea",
  aliases: ["greenfly", "blackfly"], description: "Sap-sucking insects.",
  symptoms: ["curled leaves", "sticky honeydew"], causes: "Warm dry weather",
  treatment: "Blast with water; encourage ladybirds.", prevention: "Companion planting",
  severity: "moderate", affected_plant_types: ["roses", "beans"], affected_families: ["Fabaceae"],
  season: ["spring", "summer"], organic_friendly: true,
};

Deno.test("ailmentRowToColumnShape — maps + trims + defaults", () => {
  const row = ailmentRowToColumnShape(full, { seeded_by_run_id: "run-1" })!;
  assertEquals(row.name, "Aphids");
  assertEquals(row.kind, "pest");
  assertEquals(row.severity, "moderate");
  assertEquals(row.source, "ai");
  assertEquals(row.seeded_by_run_id, "run-1");
  assertEquals(row.aliases, ["greenfly", "blackfly"]);
  assertEquals(row.organic_friendly, true);
  assertEquals(row.valid, null);
});

Deno.test("ailmentRowToColumnShape — rejects missing name / bad kind", () => {
  assertEquals(ailmentRowToColumnShape({ name: "", kind: "pest" }, { seeded_by_run_id: "r" }), null);
  assertEquals(ailmentRowToColumnShape({ name: "X", kind: "bogus" as never }, { seeded_by_run_id: "r" }), null);
});

Deno.test("ailmentRowToColumnShape — coerces stringy arrays + drops bad severity", () => {
  const row = ailmentRowToColumnShape(
    { name: "Blight", kind: "disease", symptoms: "brown spots; wilting" as unknown as string[], severity: "nope" as never },
    { seeded_by_run_id: "r" },
  )!;
  assertEquals(row.symptoms, ["brown spots", "wilting"]);
  assertEquals(row.severity, null);
});

// ── tolerant parse ───────────────────────────────────────────────────────────

Deno.test("parseAilmentBatch — clean JSON", () => {
  const r = parseAilmentBatch(JSON.stringify({ ailments: [{ name: "Aphids", kind: "pest" }] }));
  assertEquals(r.ailments.length, 1);
});

Deno.test("parseAilmentBatch — salvages a truncated array", () => {
  const truncated = '{"ailments":[{"name":"Aphids","kind":"pest"},{"name":"Blight","kind":"disease"},{"name":"Rust","kind"';
  const r = parseAilmentBatch(truncated);
  assert(r.ailments.length >= 2);
  assertEquals(r.ailments[0].name, "Aphids");
});

Deno.test("parseAilmentBatch — garbage → empty", () => {
  assertEquals(parseAilmentBatch("not json").ailments, []);
});
