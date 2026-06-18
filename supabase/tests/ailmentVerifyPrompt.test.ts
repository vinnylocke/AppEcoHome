import { assert, assertEquals } from "@std/assert";
import {
  buildAilmentVerifyPrompt, applyVerifyResult, parseVerify, AILMENT_VERIFY_SCHEMA,
  type AilmentRowForVerify,
} from "@shared/ailmentVerifyPrompt.ts";

const row: AilmentRowForVerify = {
  name: "Aphids", kind: "pest", scientific_name: "Aphidoidea", description: "Sap-suckers.",
  symptoms: ["curled leaves"], causes: "Warm weather", treatment: "Blast with water.",
  prevention: "Companion planting", severity: null, affected_plant_types: ["roses"], organic_friendly: true,
};

Deno.test("buildAilmentVerifyPrompt — includes the entry + safety rule", () => {
  const p = buildAilmentVerifyPrompt(row);
  assert(p.includes("Aphids"));
  assert(p.includes("SAFETY RULES"));
  assert(p.includes("cultural/organic"));
  assert(AILMENT_VERIFY_SCHEMA.required.includes("verdict"));
});

Deno.test("applyVerifyResult — matched marks valid + verified_at", () => {
  const patch = applyVerifyResult({ verdict: "matched" });
  assertEquals(patch.valid, true);
  assert(typeof patch.verified_at === "string");
});

Deno.test("applyVerifyResult — amended writes allowed fields + valid=false", () => {
  const patch = applyVerifyResult({
    verdict: "amended",
    amendments: { severity: "moderate", treatment: "  Hose off; encourage ladybirds.  ", symptoms: ["curled leaves", "honeydew"], bogus: "x" },
  });
  assertEquals(patch.valid, false);
  assertEquals(patch.severity, "moderate");
  assertEquals(patch.treatment, "Hose off; encourage ladybirds.");
  assertEquals(patch.symptoms, ["curled leaves", "honeydew"]);
  assertEquals((patch as Record<string, unknown>).bogus, undefined);
});

Deno.test("applyVerifyResult — amended with bad severity dropped + empty amendments → pass", () => {
  assertEquals(applyVerifyResult({ verdict: "amended", amendments: { severity: "nope" } }).valid, true);
  assertEquals(applyVerifyResult({ verdict: "amended", amendments: {} }).valid, true);
});

Deno.test("parseVerify — valid / garbage", () => {
  assertEquals(parseVerify(JSON.stringify({ verdict: "matched" }))!.verdict, "matched");
  assertEquals(parseVerify("not json"), null);
  assertEquals(parseVerify(JSON.stringify({ verdict: "weird" })), null);
});
