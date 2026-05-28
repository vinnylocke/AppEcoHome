import { assertEquals, assert, assertStringIncludes } from "@std/assert";
import {
  buildSuggestPrompt,
  SUGGEST_RESPONSE_SCHEMA,
  type SuggestPromptInput,
} from "../functions/suggest-rotation-plants/prompt.ts";

function makeInput(overrides: Partial<SuggestPromptInput> = {}): SuggestPromptInput {
  return {
    areaName: "South Bed",
    hemisphere: "northern",
    locationHint: null,
    areaContext: null,
    rotation: { history: [], avoid: [], prefer: [] },
    ownedPlants: [],
    ...overrides,
  };
}

Deno.test("buildSuggestPrompt — includes area name + hemisphere", () => {
  const out = buildSuggestPrompt(makeInput());
  assertStringIncludes(out, `Area: "South Bed"`);
  assertStringIncludes(out, "Hemisphere: northern");
});

Deno.test("buildSuggestPrompt — falls back to 'unknown' hemisphere", () => {
  const out = buildSuggestPrompt(makeInput({ hemisphere: null }));
  assertStringIncludes(out, "Hemisphere: unknown");
});

Deno.test("buildSuggestPrompt — renders area conditions when provided", () => {
  const out = buildSuggestPrompt(
    makeInput({
      areaContext: {
        sunlight: "Full sun",
        soil: "Loam",
        ph: 6.5,
        waterMovement: "Well-drained",
      },
    }),
  );
  assertStringIncludes(out, "Light: Full sun");
  assertStringIncludes(out, "Soil: Loam");
  assertStringIncludes(out, "pH: 6.5");
  assertStringIncludes(out, "Drainage: Well-drained");
});

Deno.test("buildSuggestPrompt — flags 'first time growing here' when history is empty", () => {
  const out = buildSuggestPrompt(makeInput());
  assertStringIncludes(out, "no records");
});

Deno.test("buildSuggestPrompt — renders rotation history when present", () => {
  const out = buildSuggestPrompt(
    makeInput({
      rotation: {
        history: [
          { year: 2026, families: ["Solanaceae"] },
          { year: 2025, families: ["Brassicaceae"] },
        ],
        avoid: ["Solanaceae"],
        prefer: ["Fabaceae"],
      },
    }),
  );
  assertStringIncludes(out, "2026: Solanaceae");
  assertStringIncludes(out, "2025: Brassicaceae");
  assertStringIncludes(out, "AVOID families: Solanaceae");
  assertStringIncludes(out, "PREFER families: Fabaceae");
});

Deno.test("buildSuggestPrompt — caps owned plants display at 30 entries", () => {
  const many = Array.from({ length: 50 }, (_, i) => `Plant ${i + 1}`);
  const out = buildSuggestPrompt(makeInput({ ownedPlants: many }));
  // Should mention the first plant but not the 40th (cut at 30)
  assertStringIncludes(out, "Plant 1");
  assert(!out.includes("Plant 40"), "expected the 40th plant to be cut off");
});

Deno.test("buildSuggestPrompt — omits owned-plants line when none", () => {
  const out = buildSuggestPrompt(makeInput({ ownedPlants: [] }));
  assert(!out.includes("already owns"), "should not include the owned-plants line");
});

Deno.test("SUGGEST_RESPONSE_SCHEMA — top-level shape matches contract", () => {
  assertEquals(SUGGEST_RESPONSE_SCHEMA.type, "OBJECT");
  assertEquals(SUGGEST_RESPONSE_SCHEMA.required, ["suggestions"]);
  const item = SUGGEST_RESPONSE_SCHEMA.properties.suggestions.items;
  assertEquals(item.type, "OBJECT");
  assert(item.required.includes("plant_name"));
  assert(item.required.includes("reason"));
});
