import { assertEquals } from "@std/assert";
import {
  decideRouting,
  resolveCrossCheck,
  speciesNamesAgree,
  TRUST_THRESHOLD,
  CROSS_CHECK_FLOOR,
  type PlantNetMatch,
} from "@shared/plantnet.ts";

const match = (score: number, scientificName = "Rosa rugosa"): PlantNetMatch => ({
  score,
  commonName: "Rugosa Rose",
  scientificName,
  scientificNameAuthored: `${scientificName} Thunb.`,
  genus: scientificName.split(" ")[0],
  family: "Rosaceae",
  gbifId: "abc",
});

// ──────────────────────────────────────────────────────────────────────────
// decideRouting — confidence band routing
// ──────────────────────────────────────────────────────────────────────────

Deno.test("null bestMatch → AI fallback", () => {
  const r = decideRouting(null);
  assertEquals(r.source, "ai_fallback");
  assertEquals(r.crossCheck, false);
  assertEquals(r.confirmedSpecies, null);
});

Deno.test("score below CROSS_CHECK_FLOOR → AI fallback", () => {
  const r = decideRouting(match(CROSS_CHECK_FLOOR - 0.01));
  assertEquals(r.source, "ai_fallback");
  assertEquals(r.crossCheck, false);
});

Deno.test("score in cross-check band → crossCheck=true, species carried through", () => {
  const r = decideRouting(match((CROSS_CHECK_FLOOR + TRUST_THRESHOLD) / 2));
  assertEquals(r.crossCheck, true);
  assertEquals(r.confirmedSpecies, "Rosa rugosa");
  // Provisional source — final is resolved post-Gemini.
  assertEquals(r.source, "plantnet+ai_confirmed");
});

Deno.test("score at trust threshold → trust Pl@ntNet, skip Gemini", () => {
  const r = decideRouting(match(TRUST_THRESHOLD));
  assertEquals(r.source, "plantnet");
  assertEquals(r.crossCheck, false);
  assertEquals(r.confirmedSpecies, "Rosa rugosa");
});

Deno.test("score well above threshold → still trust Pl@ntNet", () => {
  const r = decideRouting(match(0.95));
  assertEquals(r.source, "plantnet");
  assertEquals(r.crossCheck, false);
});

// ──────────────────────────────────────────────────────────────────────────
// speciesNamesAgree — botanist genus+species comparison
// ──────────────────────────────────────────────────────────────────────────

Deno.test("identical strings agree", () => {
  assertEquals(speciesNamesAgree("Rosa rugosa", "Rosa rugosa"), true);
});

Deno.test("ignores authorship suffix", () => {
  assertEquals(speciesNamesAgree("Rosa rugosa", "Rosa rugosa Thunb."), true);
});

Deno.test("case-insensitive", () => {
  assertEquals(speciesNamesAgree("rosa rugosa", "Rosa Rugosa"), true);
});

Deno.test("different species disagree", () => {
  assertEquals(speciesNamesAgree("Rosa rugosa", "Rosa canina"), false);
});

Deno.test("different genera disagree", () => {
  assertEquals(speciesNamesAgree("Rosa rugosa", "Rubus rugosus"), false);
});

Deno.test("empty strings disagree", () => {
  assertEquals(speciesNamesAgree("", ""), false);
});

Deno.test("extra whitespace tolerated", () => {
  assertEquals(speciesNamesAgree("  Rosa   rugosa  ", "Rosa rugosa"), true);
});

// ──────────────────────────────────────────────────────────────────────────
// resolveCrossCheck — final source decision after Gemini ID
// ──────────────────────────────────────────────────────────────────────────

Deno.test("AI gave nothing → keep Pl@ntNet as the source", () => {
  assertEquals(resolveCrossCheck("Rosa rugosa", null), "plantnet");
  assertEquals(resolveCrossCheck("Rosa rugosa", ""), "plantnet");
  assertEquals(resolveCrossCheck("Rosa rugosa", "   "), "plantnet");
});

Deno.test("AI confirmed Pl@ntNet → confirmed source", () => {
  assertEquals(
    resolveCrossCheck("Rosa rugosa", "Rosa rugosa Thunb."),
    "plantnet+ai_confirmed",
  );
});

Deno.test("AI disagreed with Pl@ntNet → disagreement source", () => {
  assertEquals(
    resolveCrossCheck("Rosa rugosa", "Rosa canina"),
    "plantnet_vs_ai_disagreement",
  );
});
