import { assertEquals } from "@std/assert";
import { aiResultToLibraryRow, typeToKind, ailmentNameKey } from "@shared/ailmentLibraryMap.ts";

Deno.test("typeToKind maps watchlist types to library kinds", () => {
  assertEquals(typeToKind("pest"), "pest");
  assertEquals(typeToKind("invasive_plant"), "invasive");
  assertEquals(typeToKind("disorder"), "disorder");
  assertEquals(typeToKind("disease"), "disease");
  assertEquals(typeToKind(undefined), "disease");
});

Deno.test("ailmentNameKey lowercases + collapses whitespace", () => {
  assertEquals(ailmentNameKey("  Black   Spot "), "black spot");
});

Deno.test("aiResultToLibraryRow maps the watchlist payload into a library row", () => {
  const row = aiResultToLibraryRow({
    name: "Black Spot",
    scientific_name: "Diplocarpon rosae",
    type: "disease",
    description: "A fungal disease of roses.",
    symptoms: [{ title: "Black blotches" }, "Yellowing leaves", { description: "Leaf drop" }],
    affected_plants: ["Roses", " ", "Apples"],
    prevention_steps: [{ description: "Improve airflow" }, { title: "Avoid wetting leaves" }],
    remedy_steps: [{ description: "Remove infected leaves" }],
    thumbnail_url: "https://x/y.jpg",
  });
  assertEquals(row.name, "Black Spot");
  assertEquals(row.kind, "disease");
  assertEquals(row.scientific_name, "Diplocarpon rosae");
  assertEquals(row.symptoms, ["Black blotches", "Yellowing leaves", "Leaf drop"]);
  assertEquals(row.affected_plant_types, ["Roses", "Apples"]);
  assertEquals(row.prevention, "Improve airflow\nAvoid wetting leaves");
  assertEquals(row.treatment, "Remove infected leaves");
  assertEquals(row.image_url, "https://x/y.jpg");
  assertEquals(row.severity, null);
  assertEquals(row.source, "ai");
});

Deno.test("aiResultToLibraryRow tolerates sparse input", () => {
  const row = aiResultToLibraryRow({ name: "Aphids", type: "pest" });
  assertEquals(row.kind, "pest");
  assertEquals(row.symptoms, []);
  assertEquals(row.prevention, null);
  assertEquals(row.treatment, null);
  assertEquals(row.thumbnail_url, null);
});
