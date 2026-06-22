import { assertEquals } from "@std/assert";
import { analyseGaps, type GardenFacts, type PlantFact } from "@shared/gapAnalysis.ts";

const plant = (over: Partial<PlantFact> = {}): PlantFact => ({
  name: "Plant",
  floweringSeasons: [],
  harvestSeasons: [],
  isEdible: false,
  flowers: false,
  attracts: [],
  toxicPets: false,
  toxicHumans: false,
  ...over,
});

const facts = (over: Partial<GardenFacts> = {}): GardenFacts => ({
  goals: [],
  plants: [],
  areaCount: 1,
  plantedCount: 0,
  postponeRate: 0,
  timePerWeek: null,
  ...over,
});

const codes = (gaps: { code: string }[]) => gaps.map((g) => g.code).sort();

Deno.test("no goals → no gaps", () => {
  assertEquals(analyseGaps(facts({ plants: [plant()] })), []);
});

Deno.test("year_round_colour — empty garden flags no_plants", () => {
  const g = analyseGaps(facts({ goals: ["year_round_colour"], plantedCount: 0 }));
  assertEquals(codes(g), ["no_plants"]);
});

Deno.test("year_round_colour — bare seasons detected (case-insensitive)", () => {
  const g = analyseGaps(facts({
    goals: ["year_round_colour"],
    plantedCount: 2,
    plants: [
      plant({ name: "Rose", flowers: true, floweringSeasons: ["summer"] }),
      plant({ name: "Aster", flowers: true, floweringSeasons: ["Autumn"] }),
    ],
  }));
  assertEquals(codes(g), ["bare_seasons"]);
  // Spring + Winter are bare; Summer + Autumn covered.
  assertEquals(g[0].detail.includes("Spring"), true);
  assertEquals(g[0].detail.includes("Winter"), true);
});

Deno.test("year_round_colour — full coverage → no gap", () => {
  const g = analyseGaps(facts({
    goals: ["year_round_colour"],
    plantedCount: 1,
    plants: [plant({ flowers: true, floweringSeasons: ["Spring", "Summer", "Autumn", "Winter"] })],
  }));
  assertEquals(g, []);
});

Deno.test("grow_your_own — nothing edible flags no_edibles", () => {
  const g = analyseGaps(facts({
    goals: ["grow_your_own"],
    plantedCount: 1,
    plants: [plant({ name: "Rose" })],
  }));
  assertEquals(codes(g), ["no_edibles"]);
});

Deno.test("grow_your_own — edible with a productive-season harvest gap", () => {
  const g = analyseGaps(facts({
    goals: ["grow_your_own"],
    plantedCount: 1,
    plants: [plant({ name: "Garlic", isEdible: true, harvestSeasons: ["Summer"] })],
  }));
  assertEquals(codes(g), ["harvest_gap"]);
});

Deno.test("attract_wildlife — no pollinator plants flagged", () => {
  const g = analyseGaps(facts({
    goals: ["attract_wildlife"],
    plantedCount: 1,
    plants: [plant({ name: "Conifer" })],
  }));
  assertEquals(codes(g), ["no_wildlife_plants"]);
});

Deno.test("attract_wildlife — a plant that attracts bees → no gap", () => {
  const g = analyseGaps(facts({
    goals: ["attract_wildlife"],
    plantedCount: 1,
    plants: [plant({ name: "Salvia", attracts: ["bees"] })],
  }));
  assertEquals(g, []);
});

Deno.test("low_maintenance — high postpone rate flags overload", () => {
  const g = analyseGaps(facts({ goals: ["low_maintenance"], postponeRate: 0.6 }));
  assertEquals(codes(g), ["maintenance_overload"]);
  assertEquals(g[0].detail.includes("60%"), true);
});

Deno.test("low_maintenance — low postpone rate → no gap", () => {
  const g = analyseGaps(facts({ goals: ["low_maintenance"], postponeRate: 0.1 }));
  assertEquals(g, []);
});

Deno.test("family_safe — toxic plants flagged separately for pets and people", () => {
  const g = analyseGaps(facts({
    goals: ["family_safe"],
    plantedCount: 2,
    plants: [
      plant({ name: "Lily", toxicPets: true }),
      plant({ name: "Foxglove", toxicHumans: true }),
    ],
  }));
  assertEquals(codes(g), ["toxic_humans", "toxic_pets"]);
});

Deno.test("multiple goals accumulate independent gaps", () => {
  const g = analyseGaps(facts({
    goals: ["grow_your_own", "attract_wildlife"],
    plantedCount: 1,
    plants: [plant({ name: "Hedge" })],
  }));
  assertEquals(codes(g), ["no_edibles", "no_wildlife_plants"]);
});
