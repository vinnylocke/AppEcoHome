import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildYieldPrompt } from "@shared/yieldPrompt.ts";

const BASE = {
  commonName: "Basil",
  plantedAt: "2026-03-01",
  expectedHarvestDate: "2026-06-01",
  cycle: "Annual",
  watering: "Average",
  careLevel: "Low",
  sunlight: "Full Sun",
  pastYields: [],
  weatherSummary: null,
};

Deno.test("YLD-FN-001: buildYieldPrompt includes common_name", () => {
  const prompt = buildYieldPrompt(BASE);
  assertStringIncludes(prompt, "Basil");
});

Deno.test("YLD-FN-002: buildYieldPrompt includes planted_date when present", () => {
  const prompt = buildYieldPrompt(BASE);
  assertStringIncludes(prompt, "2026-03-01");
});

Deno.test("YLD-FN-003: buildYieldPrompt includes expected_harvest_date when present", () => {
  const prompt = buildYieldPrompt(BASE);
  assertStringIncludes(prompt, "2026-06-01");
});

Deno.test("YLD-FN-004: buildYieldPrompt with zero records includes no harvest history text", () => {
  const prompt = buildYieldPrompt({ ...BASE, pastYields: [] });
  assertStringIncludes(prompt, "No harvest history");
});

Deno.test("YLD-FN-005: buildYieldPrompt with 3 records lists all of them", () => {
  const prompt = buildYieldPrompt({
    ...BASE,
    pastYields: [
      { value: 0.15, unit: "kg", harvested_at: "2026-04-01T09:00:00Z" },
      { value: 0.20, unit: "kg", harvested_at: "2026-04-15T09:00:00Z" },
      { value: 0.18, unit: "kg", harvested_at: "2026-05-01T09:00:00Z" },
    ],
  });
  assertStringIncludes(prompt, "0.15");
  assertStringIncludes(prompt, "0.2");
  assertStringIncludes(prompt, "0.18");
});

Deno.test("YLD-FN-006: buildYieldPrompt includes weather summary when provided", () => {
  const prompt = buildYieldPrompt({
    ...BASE,
    weatherSummary: "2026-05-01: max 22°C, rain 3mm",
  });
  assertStringIncludes(prompt, "22°C");
  assertStringIncludes(prompt, "Recent & Forecast Weather");
});
