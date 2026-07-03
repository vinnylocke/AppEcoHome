import { describe, test, expect } from "vitest";
import {
  parseAilmentListLocal,
  classifyAilmentType,
} from "../../../src/lib/parseAilmentList";

describe("parseAilmentListLocal (RHO-4 Phase 2 regex fallback)", () => {
  test("empty / whitespace input returns empty array", () => {
    expect(parseAilmentListLocal("")).toEqual([]);
    expect(parseAilmentListLocal("   \n\n\t")).toEqual([]);
  });

  test("single bare name → no symptoms", () => {
    const [a] = parseAilmentListLocal("Aphids");
    expect(a.name).toBe("Aphids");
    expect(a.symptoms).toEqual([]);
    expect(a.notes).toBeNull();
  });

  test("dash detail splits into symptom titles", () => {
    const [a] = parseAilmentListLocal("Aphids - sticky leaves, curled shoots");
    expect(a.name).toBe("Aphids");
    expect(a.symptoms).toEqual(["sticky leaves", "curled shoots"]);
  });

  test("colon detail also splits (on , and ;)", () => {
    const [a] = parseAilmentListLocal("Black spot: yellowing; leaf drop");
    expect(a.name).toBe("Black spot");
    expect(a.symptoms).toEqual(["yellowing", "leaf drop"]);
  });

  test("parenthesised detail becomes a symptom title", () => {
    const [a] = parseAilmentListLocal("Powdery mildew (white dusty coating)");
    expect(a.name).toBe("Powdery mildew");
    expect(a.symptoms).toEqual(["white dusty coating"]);
  });

  test("one ailment per line, blank lines skipped", () => {
    const rows = parseAilmentListLocal("Aphids\n\nSlugs\nBlack spot");
    expect(rows.map((r) => r.name)).toEqual(["Aphids", "Slugs", "Black spot"]);
  });

  test("caps at 200 rows", () => {
    const text = Array.from({ length: 250 }, (_, i) => `Ailment ${i}`).join("\n");
    expect(parseAilmentListLocal(text)).toHaveLength(200);
  });
});

describe("classifyAilmentType", () => {
  test("pest keywords → pest", () => {
    expect(classifyAilmentType("Aphids")).toBe("pest");
    expect(classifyAilmentType("Vine weevil grubs")).toBe("pest");
    expect(classifyAilmentType("Slugs and snails")).toBe("pest");
  });

  test("invasive keywords → invasive_plant", () => {
    expect(classifyAilmentType("Japanese knotweed")).toBe("invasive_plant");
    expect(classifyAilmentType("Bindweed")).toBe("invasive_plant");
  });

  test("unknown / disease keywords → disease default", () => {
    expect(classifyAilmentType("Powdery mildew")).toBe("disease");
    expect(classifyAilmentType("Something ambiguous")).toBe("disease");
  });

  test("regex parser classifies each row via name + detail", () => {
    const rows = parseAilmentListLocal(
      "Aphids\nJapanese knotweed\nPowdery mildew (white coating)",
    );
    expect(rows[0].type).toBe("pest");
    expect(rows[1].type).toBe("invasive_plant");
    expect(rows[2].type).toBe("disease");
  });
});
