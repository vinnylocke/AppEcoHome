import { assertEquals } from "@std/assert";
import { isAcceptablePlantEnrichment } from "../functions/_shared/plantEnrichmentGuard.ts";

Deno.test("accepts a specific plant / cultivar", () => {
  assertEquals(isAcceptablePlantEnrichment("Carrot 'Autumn King'", "Daucus carota").ok, true);
  assertEquals(isAcceptablePlantEnrichment("Tomato", ["Solanum lycopersicum"]).ok, true);
  assertEquals(isAcceptablePlantEnrichment("Peace Lily", "Spathiphyllum").ok, true); // genus-only is fine
  assertEquals(isAcceptablePlantEnrichment("Rosemary", "Salvia rosmarinus").ok, true);
});

Deno.test("rejects a bare generic-category common_name (the Root vegetable bug)", () => {
  const v = isAcceptablePlantEnrichment("Root vegetable", "Daucus carota");
  assertEquals(v.ok, false);
  assertEquals(v.reason?.includes("generic-category"), true);
  for (const cat of ["Herb", "Vegetable", "Legume", "Fern", "Cactus", "Tree", "Shrub", "Succulent", "Fruit", "Flower"]) {
    assertEquals(isAcceptablePlantEnrichment(cat, "Daucus carota").ok, false, `${cat} should be rejected`);
  }
});

Deno.test("rejects garbage scientific names", () => {
  assertEquals(isAcceptablePlantEnrichment("Vegetable stew", "Edible plant").ok, false); // prose first token
  assertEquals(isAcceptablePlantEnrichment("Some plant", "Herbs are").ok, false);        // prose first token
  assertEquals(isAcceptablePlantEnrichment("Some plant", "Unlike herbaceous").ok, false);
  assertEquals(isAcceptablePlantEnrichment("Portal:Trees", "Portal:Trees").ok, false);   // colon
  assertEquals(isAcceptablePlantEnrichment("Bristle Sedge", "carexτης").ok, false);       // non-ASCII
  assertEquals(isAcceptablePlantEnrichment("Herb", "Herb").ok, false);                    // sci is a category
  assertEquals(isAcceptablePlantEnrichment("Something", "").ok, false);                   // empty sci
  assertEquals(isAcceptablePlantEnrichment("", "Daucus carota").ok, false);               // empty common
});

Deno.test("accepts a hybrid × and hyphenated names", () => {
  assertEquals(isAcceptablePlantEnrichment("Pelargonium", "Pelargonium × hortorum").ok, true);
  assertEquals(isAcceptablePlantEnrichment("Lavender 'Hidcote'", "Lavandula angustifolia").ok, true);
});
