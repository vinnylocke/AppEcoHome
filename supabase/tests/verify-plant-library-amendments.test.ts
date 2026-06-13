import { assert, assertEquals } from "@std/assert";
import { pickAllowedUpdates } from "../functions/verify-plant-library/helpers.ts";

// ─────────────────────────────────────────────────────────────────────────
// pickAllowedUpdates — months-vs-seasons guard
// ─────────────────────────────────────────────────────────────────────────

Deno.test("pickAllowedUpdates — flowering_season: drops month names entirely", () => {
  const out = pickAllowedUpdates(
    { flowering_season: ["June", "July", "August"] },
    { flowering_season: ["summer"] },
  );
  // Every element was a month — field is dropped, existing list preserved.
  assert(!("flowering_season" in out), "flowering_season should not be in updates");
});

Deno.test("pickAllowedUpdates — flowering_season: drops month names but keeps seasons", () => {
  const out = pickAllowedUpdates(
    { flowering_season: ["summer", "August", "autumn"] },
    { flowering_season: ["spring"] },
  );
  assertEquals(out.flowering_season, ["summer", "autumn"]);
});

Deno.test("pickAllowedUpdates — flowering_season: lowercases and dedupes mixed-case input", () => {
  const out = pickAllowedUpdates(
    { flowering_season: ["Summer", "SUMMER", "Autumn"] },
    { flowering_season: ["winter"] },
  );
  assertEquals(out.flowering_season, ["summer", "autumn"]);
});

Deno.test("pickAllowedUpdates — harvest_season: same vocabulary rule applies", () => {
  const out = pickAllowedUpdates(
    { harvest_season: ["October", "November"] },
    { harvest_season: ["autumn"] },
  );
  assert(!("harvest_season" in out));
});

// ─────────────────────────────────────────────────────────────────────────
// pickAllowedUpdates — non-shrinking array-field guard
// ─────────────────────────────────────────────────────────────────────────

Deno.test("pickAllowedUpdates — propagation: strict subset is rejected (real-world bug)", () => {
  // The reported regression: verifier ships ["seed"] for a plant we seeded
  // as ["seed", "division", "cuttings"]. Wikipedia mentioned only seeds,
  // but division and cuttings remain valid propagation methods.
  const out = pickAllowedUpdates(
    { propagation: ["seed"] },
    { propagation: ["seed", "division", "cuttings"] },
  );
  assert(!("propagation" in out), "propagation should not be in updates");
});

Deno.test("pickAllowedUpdates — attracts: strict subset is rejected (real-world bug)", () => {
  const out = pickAllowedUpdates(
    { attracts: ["bees"] },
    { attracts: ["bees", "butterflies", "hummingbirds"] },
  );
  assert(!("attracts" in out));
});

Deno.test("pickAllowedUpdates — propagation: additive amendment merges, not overwrites", () => {
  const out = pickAllowedUpdates(
    { propagation: ["seed", "tissue culture"] },
    { propagation: ["seed", "division"] },
  );
  // Both original AND new value retained.
  assertEquals(
    new Set(out.propagation as string[]),
    new Set(["seed", "division", "tissue culture"]),
  );
});

Deno.test("pickAllowedUpdates — attracts: amendment with overlap + addition merges", () => {
  const out = pickAllowedUpdates(
    { attracts: ["bees", "moths"] },
    { attracts: ["bees", "butterflies"] },
  );
  assertEquals(
    new Set(out.attracts as string[]),
    new Set(["bees", "butterflies", "moths"]),
  );
});

Deno.test("pickAllowedUpdates — propagation: empty existing → AI list passes through (initial fill)", () => {
  const out = pickAllowedUpdates(
    { propagation: ["seed"] },
    { propagation: [] },
  );
  assertEquals(out.propagation, ["seed"]);
});

Deno.test("pickAllowedUpdates — propagation: identical lists no-op merge into the same set", () => {
  const out = pickAllowedUpdates(
    { propagation: ["seed", "division"] },
    { propagation: ["seed", "division"] },
  );
  assertEquals(
    new Set(out.propagation as string[]),
    new Set(["seed", "division"]),
  );
});

Deno.test("pickAllowedUpdates — sunlight: strict subset is rejected", () => {
  const out = pickAllowedUpdates(
    { sunlight: ["full sun"] },
    { sunlight: ["full sun", "part shade"] },
  );
  assert(!("sunlight" in out));
});

// ─────────────────────────────────────────────────────────────────────────
// pickAllowedUpdates — regression: existing behaviour stays intact
// ─────────────────────────────────────────────────────────────────────────

Deno.test("pickAllowedUpdates — numeric coercion still works for watering_min_days", () => {
  const out = pickAllowedUpdates({ watering_min_days: "7" });
  assertEquals(out.watering_min_days, 7);
});

Deno.test("pickAllowedUpdates — numeric strings with units are coerced (existing bug-fix)", () => {
  const out = pickAllowedUpdates({ watering_max_days: "10 days" });
  assertEquals(out.watering_max_days, 10);
});

Deno.test("pickAllowedUpdates — free-form scalar fields pass through unchanged", () => {
  const out = pickAllowedUpdates({
    family: "Solanaceae",
    plant_type: "Vegetable",
    description: "A new description.",
  });
  assertEquals(out.family, "Solanaceae");
  assertEquals(out.plant_type, "Vegetable");
  assertEquals(out.description, "A new description.");
});

Deno.test("pickAllowedUpdates — keys not in VERIFIABLE_FIELDS are silently dropped", () => {
  const out = pickAllowedUpdates({
    family: "Solanaceae",
    not_a_real_field: "anything",
    id: 999,
  } as Record<string, unknown>);
  assertEquals(out.family, "Solanaceae");
  assert(!("not_a_real_field" in out));
  assert(!("id" in out));
});

// ─────────────────────────────────────────────────────────────────────────
// pickAllowedUpdates — defensive shapes
// ─────────────────────────────────────────────────────────────────────────

Deno.test("pickAllowedUpdates — non-array value for season field is ignored", () => {
  const out = pickAllowedUpdates(
    { flowering_season: "summer" as unknown as string[] },
    { flowering_season: ["spring"] },
  );
  assert(!("flowering_season" in out));
});

Deno.test("pickAllowedUpdates — non-array value for non-shrinking field is ignored", () => {
  const out = pickAllowedUpdates(
    { propagation: "seed" as unknown as string[] },
    { propagation: ["seed", "division"] },
  );
  assert(!("propagation" in out));
});
