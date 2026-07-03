import { describe, test, expect } from "vitest";
import {
  parseCsvRows,
  serializeCsv,
  serializeCell,
  sniffDelimiter,
  stripBom,
} from "../../../../src/lib/uploadTemplates/csv";

describe("csv tokenizer", () => {
  test("basic comma-delimited rows", () => {
    const rows = parseCsvRows("a,b,c\n1,2,3");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("quoted field with embedded comma", () => {
    const rows = parseCsvRows('name,notes\nTomato,"sweet, red"');
    expect(rows[1]).toEqual(["Tomato", "sweet, red"]);
  });

  test("quoted field with embedded newline", () => {
    const rows = parseCsvRows('name,notes\nTomato,"line one\nline two"\nBasil,x');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["Tomato", "line one\nline two"]);
    expect(rows[2]).toEqual(["Basil", "x"]);
  });

  test("doubled quotes inside a quoted field", () => {
    const rows = parseCsvRows('name\n"Rose ""Munstead"""');
    expect(rows[1]).toEqual(['Rose "Munstead"']);
  });

  test("CRLF line endings", () => {
    const rows = parseCsvRows("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("leading BOM is stripped", () => {
    const rows = parseCsvRows("﻿name,qty\nTomato,3");
    expect(rows[0]).toEqual(["name", "qty"]);
  });

  test("blank physical lines are skipped", () => {
    const rows = parseCsvRows("a,b\n\n1,2\n\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("smart quotes normalised to ASCII", () => {
    // “Munstead” with curly quotes should tokenise as a quoted field.
    const rows = parseCsvRows("name\n“Munstead”");
    expect(rows[1]).toEqual(["Munstead"]);
  });

  test("stripBom helper", () => {
    expect(stripBom("﻿hi")).toBe("hi");
    expect(stripBom("hi")).toBe("hi");
  });
});

describe("delimiter sniffing (header row only)", () => {
  test("comma wins for comma-delimited header", () => {
    expect(sniffDelimiter("common_name,variety,quantity")).toBe(",");
  });

  test("semicolon wins for European-locale header", () => {
    expect(sniffDelimiter("common_name;variety;quantity")).toBe(";");
  });

  test("tab wins for TSV header", () => {
    expect(sniffDelimiter("common_name\tvariety\tquantity")).toBe("\t");
  });

  test("semicolon-delimited file parses into columns", () => {
    const rows = parseCsvRows("common_name;variety\nTomato;Sungold");
    expect(rows).toEqual([
      ["common_name", "variety"],
      ["Tomato", "Sungold"],
    ]);
  });

  test("single-column header defaults to comma (no delimiter present)", () => {
    expect(sniffDelimiter("common_name")).toBe(",");
  });
});

describe("csv serialiser", () => {
  test("cells needing quoting are wrapped and quotes doubled", () => {
    expect(serializeCell("plain")).toBe("plain");
    expect(serializeCell("a,b")).toBe('"a,b"');
    expect(serializeCell('say "hi"')).toBe('"say ""hi"""');
    expect(serializeCell("line\nbreak")).toBe('"line\nbreak"');
  });

  test("serializeCsv emits CRLF and optional BOM", () => {
    const out = serializeCsv([["a", "b"], ["1", "2"]], { withBom: true });
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("\r\n");
  });

  test("round-trips a value with a comma and newline through parse", () => {
    const original = [["name", "notes"], ["Tomato", "sweet, red\nripe"]];
    const csv = serializeCsv(original);
    const parsed = parseCsvRows(csv);
    expect(parsed).toEqual(original);
  });
});
