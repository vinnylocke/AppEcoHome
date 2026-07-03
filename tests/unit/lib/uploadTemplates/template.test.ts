import { describe, test, expect } from "vitest";
import {
  PLANT_TEMPLATE,
  TEMPLATES,
  buildTemplateCsv,
  parseCsv,
} from "../../../../src/lib/uploadTemplates";

describe("buildTemplateCsv", () => {
  test("emits a BOM + the canonical header row for the plant template", () => {
    const csv = buildTemplateCsv(PLANT_TEMPLATE);
    expect(csv.startsWith("﻿")).toBe(true);
    const firstLine = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(firstLine.split(",")).toEqual(PLANT_TEMPLATE.fields.map((f) => f.header));
  });

  test("the example row's first cell is EXAMPLE-marked so re-upload skips it", () => {
    const csv = buildTemplateCsv(PLANT_TEMPLATE);
    const secondLine = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(secondLine.startsWith("EXAMPLE")).toBe(true);
  });

  test("round-trip: parsing a template yields zero data rows (example skipped, no errors)", () => {
    // The only data row IS the EXAMPLE row, which the parser skips — so a fresh
    // template has zero importable rows and, crucially, zero validation errors.
    for (const template of Object.values(TEMPLATES)) {
      const csv = buildTemplateCsv(template);
      const { rows, issues } = parseCsv(csv, template);
      expect(rows).toHaveLength(0);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    }
  });

  test("stripping the EXAMPLE marker makes the example row import cleanly", () => {
    // Prove the example values themselves are valid against the template: strip
    // the "EXAMPLE — " prefix and the row parses with no errors.
    const csv = buildTemplateCsv(PLANT_TEMPLATE).replace(/^﻿/, "");
    const deExampled = csv.replace("EXAMPLE — ", "");
    const { rows } = parseCsv(deExampled, PLANT_TEMPLATE);
    expect(rows).toHaveLength(1);
    expect(rows[0].valid).toBe(true);
    expect((rows[0].payload as any).common_name).toBe("Tomato");
  });
});
