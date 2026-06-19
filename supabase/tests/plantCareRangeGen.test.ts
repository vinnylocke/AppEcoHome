import { assert, assertEquals } from "@std/assert";
import { buildPlantCareRangePrompt, parseCareRangeResponse, CARE_RANGE_SCHEMA } from "@shared/plantCareRangeGen.ts";

Deno.test("CARE_RANGE_SCHEMA requires all six fields (so Gemini can't omit any)", () => {
  // The bug: no `required` array meant the model returned partial ranges that
  // never fully persisted. All six must be required + lowercase-typed.
  assertEquals(CARE_RANGE_SCHEMA.type, "object");
  const req = [...(CARE_RANGE_SCHEMA as { required: readonly string[] }).required].sort();
  assertEquals(req, [
    "soil_ec_max", "soil_ec_min",
    "soil_moisture_max", "soil_moisture_min",
    "soil_temp_max", "soil_temp_min",
  ]);
  for (const f of Object.values(CARE_RANGE_SCHEMA.properties)) {
    assertEquals((f as { type: string }).type, "number");
  }
});

Deno.test("buildPlantCareRangePrompt includes the common + scientific name", () => {
  const p = buildPlantCareRangePrompt({ common_name: "Strawberry", scientific_name: ["Fragaria × ananassa"] });
  assert(p.includes("Strawberry"));
  assert(p.includes("Fragaria × ananassa"));
});

Deno.test("buildPlantCareRangePrompt works without a scientific name", () => {
  const p = buildPlantCareRangePrompt({ common_name: "Strawberry" });
  assert(p.includes("Strawberry"));
});

Deno.test("parseCareRangeResponse parses plain + fenced JSON", () => {
  const r = parseCareRangeResponse('{"soil_moisture_min":30,"soil_moisture_max":60,"soil_ec_min":800,"soil_ec_max":1800,"soil_temp_min":15,"soil_temp_max":26}');
  assertEquals(r?.soil_moisture_min, 30);
  assertEquals(r?.soil_ec_max, 1800);

  const fenced = parseCareRangeResponse("```json\n{\"soil_moisture_min\":35,\"soil_moisture_max\":55}\n```");
  assertEquals(fenced?.soil_moisture_min, 35);
  assertEquals(fenced?.soil_ec_min, null); // absent → null
});

Deno.test("parseCareRangeResponse returns null when nothing usable", () => {
  assertEquals(parseCareRangeResponse('{"soil_moisture_min":null,"soil_ec_min":null,"soil_temp_min":null}'), null);
  assertEquals(parseCareRangeResponse("not json at all"), null);
});

Deno.test("parseCareRangeResponse drops non-finite values", () => {
  const r = parseCareRangeResponse('{"soil_moisture_min":40,"soil_temp_min":"warm"}');
  assertEquals(r?.soil_moisture_min, 40);
  assertEquals(r?.soil_temp_min, null);
});
