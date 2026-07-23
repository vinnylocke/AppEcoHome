import { assertEquals, assertStringIncludes } from "@std/assert";
import { AILMENT_PHOTO_CONFIDENCE, buildAilmentVetInstruction } from "@shared/ailmentImageVet.ts";

// The ailment vet must ask for the pest/disease ORGANISM (not "the living
// plant"), or ailment-image-search would inherit the plant vet's bias that
// downranks correct insect/lesion macros. Lock the prompt's key properties.

Deno.test("buildAilmentVetInstruction — names the subject and the exact count", () => {
  const out = buildAilmentVetInstruction("Spider Mite", 5);
  assertStringIncludes(out, "Spider Mite");
  assertStringIncludes(out, "5 candidate photos");
  assertStringIncludes(out, "exactly 5 numbers");
});

Deno.test("buildAilmentVetInstruction — asks for the organism/damage, NOT a healthy ornamental", () => {
  const out = buildAilmentVetInstruction("Powdery Mildew", 3).toLowerCase();
  assertStringIncludes(out, "pest/disease organism");
  assertStringIncludes(out, "damage/symptom");
  assertStringIncludes(out, "not an unrelated ");
  assertStringIncludes(out, "healthy ornamental");
});

Deno.test("AILMENT_PHOTO_CONFIDENCE — lenient-but-present threshold", () => {
  // Below the plant threshold (0.55) on purpose; still a real gate (> 0).
  assertEquals(AILMENT_PHOTO_CONFIDENCE, 0.5);
});
