import { assertEquals } from "@std/assert";
import {
  stripPropagationMethod,
  bestLibraryMatch,
  type LibraryCandidate,
} from "../functions/_shared/plantNameMatch.ts";

Deno.test("stripPropagationMethod — removes trailing propagation methods", () => {
  assertEquals(stripPropagationMethod("Geranium softwood cuttings"), "Geranium");
  assertEquals(stripPropagationMethod("Lavender 'Hidcote' cuttings"), "Lavender 'Hidcote'");
  assertEquals(stripPropagationMethod("Rosemary hardwood cuttings"), "Rosemary");
  assertEquals(stripPropagationMethod("Hosta division"), "Hosta");
  assertEquals(stripPropagationMethod("Sweet Pea from seed"), "Sweet Pea");
  assertEquals(stripPropagationMethod("Lettuce seeds"), "Lettuce");
  assertEquals(stripPropagationMethod("Strawberry offsets"), "Strawberry");
});

Deno.test("stripPropagationMethod — leaves real names + cultivars intact", () => {
  assertEquals(stripPropagationMethod("Radish 'French Breakfast'"), "Radish 'French Breakfast'");
  assertEquals(stripPropagationMethod("Carrot 'Autumn King'"), "Carrot 'Autumn King'");
  assertEquals(stripPropagationMethod("Tomato"), "Tomato");
  assertEquals(stripPropagationMethod("Cutting Celery"), "Cutting Celery"); // "cutting" is a leading word, not the suffix
  assertEquals(stripPropagationMethod(""), "");
});

const LETTUCE: LibraryCandidate[] = [{ id: 13498, common_name: "Daisy Lambert Butterhead Lettuce" }];
const RADISH: LibraryCandidate[] = [{ id: 655, common_name: "Radish" }];

Deno.test("bestLibraryMatch — exact match wins", () => {
  assertEquals(bestLibraryMatch("Radish", RADISH), 655);
  assertEquals(bestLibraryMatch("radish", RADISH), 655); // case/space-insensitive
});

Deno.test("bestLibraryMatch — generic species the pick extends", () => {
  assertEquals(bestLibraryMatch("Radish 'French Breakfast'", RADISH), 655);
  assertEquals(bestLibraryMatch("Radish 'Cherry Belle'", RADISH), 655);
});

Deno.test("bestLibraryMatch — a DIFFERENT cultivar is NOT a match (→ null → AI path)", () => {
  // "Lettuce 'Lollo Rossa'" must NOT attach to "Daisy Lambert Butterhead Lettuce".
  assertEquals(bestLibraryMatch("Lettuce 'Lollo Rossa'", LETTUCE), null);
  // A different-cultivar row alongside the generic species → prefer the species.
  assertEquals(
    bestLibraryMatch("Radish 'French Breakfast'", [
      { id: 655, common_name: "Radish" },
      { id: 999, common_name: "Radish 'Cherry Belle'" },
    ]),
    655,
  );
  // Only a different cultivar exists → null.
  assertEquals(
    bestLibraryMatch("Radish 'French Breakfast'", [{ id: 999, common_name: "Radish 'Cherry Belle'" }]),
    null,
  );
});

Deno.test("bestLibraryMatch — empty inputs → null", () => {
  assertEquals(bestLibraryMatch("", RADISH), null);
  assertEquals(bestLibraryMatch("Radish", []), null);
});
