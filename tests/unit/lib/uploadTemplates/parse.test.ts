import { describe, test, expect } from "vitest";
import {
  PLANT_TEMPLATE,
  SEED_PACKET_TEMPLATE,
  parseCsv,
  parseFlexibleDate,
  MAX_DATA_ROWS,
} from "../../../../src/lib/uploadTemplates";

/** Convenience: parse a plant CSV and return the first data row. */
function firstRow(csv: string) {
  const { rows } = parseCsv(csv, PLANT_TEMPLATE);
  return rows[0];
}

describe("parseCsv — required + basics", () => {
  test("a valid minimal row is valid with no issues", () => {
    const r = firstRow("common_name\nTomato\n");
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect((r.payload as any).common_name).toBe("Tomato");
  });

  test("missing required common_name is a per-field error blocking the row", () => {
    const { rows } = parseCsv("common_name,variety\n,Sungold\n", PLANT_TEMPLATE);
    const r = rows[0];
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.field === "common_name" && i.severity === "error")).toBe(true);
  });

  test("empty file → file-level error, no rows", () => {
    const { rows, issues } = parseCsv("", PLANT_TEMPLATE);
    expect(rows).toHaveLength(0);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  test("header row with no recognised columns → clear file error", () => {
    const { rows, issues } = parseCsv("wibble,wobble\n1,2\n", PLANT_TEMPLATE);
    expect(rows).toHaveLength(0);
    expect(issues.some((i) => /header row/i.test(i.message))).toBe(true);
  });

  test("unknown column produces a warning but doesn't block", () => {
    const { rows, issues } = parseCsv("common_name,bogus\nTomato,x\n", PLANT_TEMPLATE);
    expect(rows[0].valid).toBe(true);
    expect(issues.some((i) => i.rowNumber === 0 && i.severity === "warning" && /bogus/i.test(i.message))).toBe(true);
  });
});

describe("parseCsv — EXAMPLE row skip + row cap", () => {
  test("a row whose first cell starts with EXAMPLE is skipped", () => {
    const csv = "common_name,variety\nEXAMPLE — Tomato,Sungold\nBasil,\n";
    const { rows } = parseCsv(csv, PLANT_TEMPLATE);
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as any).common_name).toBe("Basil");
  });

  test(`the ${MAX_DATA_ROWS}-row cap is enforced with a file-level error`, () => {
    const body = Array.from({ length: MAX_DATA_ROWS + 5 }, (_, i) => `Plant${i}`).join("\n");
    const { rows, issues } = parseCsv(`common_name\n${body}\n`, PLANT_TEMPLATE);
    expect(rows.length).toBe(MAX_DATA_ROWS);
    expect(issues.some((i) => /limit is/i.test(i.message))).toBe(true);
  });
});

describe("parseCsv — numeric + range validation", () => {
  test("non-numeric quantity is a per-field error", () => {
    const r = firstRow("common_name,quantity\nTomato,lots\n");
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.field === "quantity")).toBe(true);
  });

  test("quantity out of range (>999) blocks the row", () => {
    const r = firstRow("common_name,quantity\nTomato,5000\n");
    expect(r.valid).toBe(false);
  });

  test("watering min > max is a cross-field error", () => {
    const r = firstRow("common_name,watering_min_days,watering_max_days\nTomato,10,3\n");
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => /watering_max_days/i.test(i.message))).toBe(true);
  });

  test("watering min <= max is fine", () => {
    const r = firstRow("common_name,watering_min_days,watering_max_days\nTomato,2,5\n");
    expect(r.valid).toBe(true);
    expect((r.payload as any).watering_min_days).toBe(2);
    expect((r.payload as any).watering_max_days).toBe(5);
  });
});

describe("parseCsv — enum + multi-value cells", () => {
  test("enum matches case-insensitively with normalisation", () => {
    const r = firstRow("common_name,care_level\nTomato,BEGINNER\n");
    expect(r.valid).toBe(true);
    expect((r.payload as any).care_level).toBe("Beginner");
  });

  test("bad enum value is a per-field error", () => {
    const r = firstRow("common_name,care_level\nTomato,Wizard\n");
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.field === "care_level")).toBe(true);
  });

  test("enum-multi splits on ; and drops unknown values with a warning (non-blocking)", () => {
    const r = firstRow("common_name,sunlight\nTomato,full sun; wobble; part shade\n");
    expect(r.valid).toBe(true);
    expect((r.payload as any).sunlight).toEqual(["full sun", "part shade"]);
    expect(r.issues.some((i) => i.severity === "warning" && /wobble/i.test(i.message))).toBe(true);
  });

  test("enum-multi normalises partial-shade underscore/casing", () => {
    const r = firstRow("common_name,sunlight\nTomato,Part_Shade\n");
    expect((r.payload as any).sunlight).toEqual(["part shade"]);
  });

  test("list field splits on ; into a string array", () => {
    const r = firstRow("common_name,scientific_name\nTomato,Solanum lycopersicum; Lycopersicon esculentum\n");
    expect((r.payload as any).scientific_name).toEqual([
      "Solanum lycopersicum",
      "Lycopersicon esculentum",
    ]);
  });
});

describe("parseCsv — booleans + favourite column", () => {
  test.each([
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["y", true],
    ["1", true],
    ["false", false],
    ["no", false],
    ["0", false],
  ])("bool cell %s → %s", (cell, expected) => {
    const r = firstRow(`common_name,is_edible\nTomato,${cell}\n`);
    expect(r.valid).toBe(true);
    expect((r.payload as any).is_edible).toBe(expected);
  });

  test("invalid bool is a per-field error", () => {
    const r = firstRow("common_name,is_edible\nTomato,maybe\n");
    expect(r.valid).toBe(false);
  });

  test("favourite=true surfaces on the row, off the payload", () => {
    const r = firstRow("common_name,favourite\nTomato,true\n");
    expect(r.favourite).toBe(true);
    expect(r.payload).not.toHaveProperty("favourite");
  });

  test("favourite defaults to false when column absent", () => {
    const r = firstRow("common_name\nTomato\n");
    expect(r.favourite).toBe(false);
  });

  test("favourite=false keeps the row un-favourited", () => {
    const r = firstRow("common_name,favourite\nTomato,false\n");
    expect(r.favourite).toBe(false);
  });
});

describe("parseFlexibleDate — RHO-4 Phase 3 (round up/down)", () => {
  test("full ISO YYYY-MM-DD is used verbatim, regardless of round direction", () => {
    expect(parseFlexibleDate("2027-06-15", "down")).toBe("2027-06-15");
    expect(parseFlexibleDate("2027-06-15", "up")).toBe("2027-06-15");
  });

  test("YYYY-MM rounds down to first of month for purchased/opened-style fields", () => {
    expect(parseFlexibleDate("2026-03", "down")).toBe("2026-03-01");
    expect(parseFlexibleDate("2026-02", "down")).toBe("2026-02-01");
  });

  test("YYYY-MM rounds up to last of month for a sow-by deadline", () => {
    expect(parseFlexibleDate("2028-12", "up")).toBe("2028-12-31");
    expect(parseFlexibleDate("2024-02", "up")).toBe("2024-02-29"); // leap year
    expect(parseFlexibleDate("2025-02", "up")).toBe("2025-02-28");
  });

  test("Month YYYY / YYYY Month resolves both orderings, rounded by direction", () => {
    expect(parseFlexibleDate("May 2024", "down")).toBe("2024-05-01");
    expect(parseFlexibleDate("December 2027", "up")).toBe("2027-12-31");
    expect(parseFlexibleDate("2027 Sep", "up")).toBe("2027-09-30");
  });

  test("bare year is only accepted when rounding up (a deadline), else null", () => {
    expect(parseFlexibleDate("2027", "up")).toBe("2027-12-31");
    expect(parseFlexibleDate("2027", "down")).toBeNull();
  });

  test("garbage returns null", () => {
    expect(parseFlexibleDate("not a date", "down")).toBeNull();
    expect(parseFlexibleDate("2026-13", "down")).toBeNull();
    expect(parseFlexibleDate("", "up")).toBeNull();
  });
});

describe("date FieldSpec — flexible dates through the parser", () => {
  test("purchased_on (round down) accepts YYYY-MM → first of month", () => {
    const { rows } = parseCsv("plant_name,purchased_on\nTomato,2026-03\n", SEED_PACKET_TEMPLATE);
    expect(rows[0].valid).toBe(true);
    expect((rows[0].payload as any).purchased_on).toBe("2026-03-01");
  });

  test("sow_by (round up) accepts YYYY-MM → last of month, and Month YYYY", () => {
    const { rows } = parseCsv("plant_name,sow_by\nTomato,2028-12\n", SEED_PACKET_TEMPLATE);
    expect((rows[0].payload as any).sow_by).toBe("2028-12-31");
    const { rows: r2 } = parseCsv("plant_name,sow_by\nTomato,May 2027\n", SEED_PACKET_TEMPLATE);
    expect((r2[0].payload as any).sow_by).toBe("2027-05-31");
  });

  test("full ISO date still parses on a date field", () => {
    const { rows } = parseCsv("plant_name,opened_on\nTomato,2026-04-10\n", SEED_PACKET_TEMPLATE);
    expect((rows[0].payload as any).opened_on).toBe("2026-04-10");
  });

  test("an unparseable date is a per-field error blocking the row", () => {
    const { rows } = parseCsv("plant_name,sow_by\nTomato,someday\n", SEED_PACKET_TEMPLATE);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].issues.some((i) => i.field === "sow_by" && i.severity === "error")).toBe(true);
  });
});

describe("parseCsv — hardening", () => {
  test("leading apostrophe is stripped from a text cell", () => {
    const r = firstRow("common_name\n'Tomato\n");
    expect((r.payload as any).common_name).toBe("Tomato");
  });

  test("text cell starting with = warns (formula injection guard) but keeps value", () => {
    const r = firstRow("common_name,description\nTomato,=SUM(A1:A9)\n");
    expect(r.valid).toBe(true);
    expect(r.issues.some((i) => i.severity === "warning" && i.field === "description")).toBe(true);
  });

  test("over-long text is truncated with a warning", () => {
    const long = "x".repeat(200);
    const r = firstRow(`common_name,plant_type\nTomato,${long}\n`);
    expect(((r.payload as any).plant_type as string).length).toBe(60);
    expect(r.issues.some((i) => /truncated/i.test(i.message))).toBe(true);
  });
});
