import { assertEquals } from "@std/assert";
import {
  selectConfidentImages,
  parseScores,
  MIN_PLANT_PHOTO_CONFIDENCE,
} from "@shared/plantImageVet.ts";

const imgs = ["a", "b", "c"];

Deno.test("selectConfidentImages keeps photos at/above the threshold", () => {
  assertEquals(
    selectConfidentImages(imgs, [0.9, 0.2, 0.55], 0.55),
    ["a", "c"],
  );
});

Deno.test("selectConfidentImages can legitimately drop everything", () => {
  assertEquals(selectConfidentImages(imgs, [0.1, 0.2, 0.3], 0.55), []);
});

Deno.test("selectConfidentImages fails open on a length mismatch", () => {
  // Model returned the wrong number of scores — keep all rather than guess.
  assertEquals(selectConfidentImages(imgs, [0.9, 0.9], 0.55), imgs);
});

Deno.test("selectConfidentImages fails open when scores are missing", () => {
  assertEquals(selectConfidentImages(imgs, null, 0.55), imgs);
  assertEquals(selectConfidentImages(imgs, undefined, 0.55), imgs);
});

Deno.test("selectConfidentImages treats NaN scores as failing", () => {
  assertEquals(selectConfidentImages(imgs, [0.9, NaN, 0.8], 0.55), ["a", "c"]);
});

Deno.test("selectConfidentImages uses the default threshold", () => {
  assertEquals(MIN_PLANT_PHOTO_CONFIDENCE, 0.55);
  assertEquals(selectConfidentImages(["x", "y"], [0.6, 0.5]), ["x"]);
});

Deno.test("parseScores reads a valid scores array", () => {
  assertEquals(parseScores('{"scores":[0.9,0.1,0.7]}'), [0.9, 0.1, 0.7]);
});

Deno.test("parseScores coerces stringified numbers", () => {
  assertEquals(parseScores('{"scores":["0.8","0.2"]}'), [0.8, 0.2]);
});

Deno.test("parseScores returns null on bad shape or invalid JSON", () => {
  assertEquals(parseScores('{"nope":1}'), null);
  assertEquals(parseScores("not json"), null);
});

Deno.test("parseScores maps non-numeric entries to NaN", () => {
  const out = parseScores('{"scores":[0.9,"abc"]}');
  assertEquals(out !== null, true);
  assertEquals(out![0], 0.9);
  assertEquals(Number.isNaN(out![1]), true);
});
