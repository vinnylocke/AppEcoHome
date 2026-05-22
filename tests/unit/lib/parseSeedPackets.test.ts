import { describe, test, expect } from "vitest";
import { parseSeedPacketsLocal } from "../../../src/lib/parseSeedPackets";

describe("parseSeedPacketsLocal", () => {
  test("empty / whitespace-only input returns empty array", () => {
    expect(parseSeedPacketsLocal("")).toEqual([]);
    expect(parseSeedPacketsLocal("   \n\n\t")).toEqual([]);
  });

  test("paren-style line with ISO sow-by + vendor", () => {
    const [pkt] = parseSeedPacketsLocal(
      "Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)",
    );
    expect(pkt.common_name).toBe("Tomato");
    expect(pkt.variety).toBe("Sungold");
    expect(pkt.vendor).toBe("Suttons");
    expect(pkt.sow_by).toBe("2028-12-31");
    expect(pkt.quantity_remaining).toBe("~30 seeds");
  });

  test("year-month sow-by uses the last day of the month", () => {
    const [pkt] = parseSeedPacketsLocal(
      "Carrot Autumn King (Real Seeds, sow-by 2027-09)",
    );
    expect(pkt.sow_by).toBe("2027-09-30");
  });

  test("year-only sow-by becomes Dec 31", () => {
    const [pkt] = parseSeedPacketsLocal("Beetroot Boltardy (Suttons, sow-by 2027)");
    expect(pkt.sow_by).toBe("2027-12-31");
  });

  test("opened-on with month name uses first of the month", () => {
    const [pkt] = parseSeedPacketsLocal(
      "Sunflower Russian Giant (Sainsbury's, opened May 2024)",
    );
    expect(pkt.opened_on).toBe("2024-05-01");
    expect(pkt.vendor).toBe("Sainsbury's");
  });

  test("multiple lines yield multiple packets", () => {
    const text = `
      Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)
      Beetroot Boltardy (Real Seeds, sow-by 2027-09, ~100 seeds)
      Sweet Pea Cupani (allotment swap)
    `;
    const out = parseSeedPacketsLocal(text);
    expect(out).toHaveLength(3);
    expect(out[0].common_name).toBe("Tomato");
    expect(out[1].common_name).toBe("Beetroot");
    expect(out[2].common_name).toBe("Sweet Pea");
    expect(out[2].variety).toBe("Cupani");
  });

  test("quoted variety stays whole even with multi-word common name", () => {
    const [pkt] = parseSeedPacketsLocal(
      "Pak Choi 'Joi Choi' (Real Seeds, sow-by 2027-06)",
    );
    expect(pkt.common_name).toBe("Pak Choi");
    expect(pkt.variety).toBe("Joi Choi");
  });

  test("compound common name without quotes — Pak Choi stays paired", () => {
    const [pkt] = parseSeedPacketsLocal("Pak Choi Glacier (Suttons)");
    expect(pkt.common_name).toBe("Pak Choi");
    expect(pkt.variety).toBe("Glacier");
  });

  test("name only (no parens) extracts species + variety on 2 words", () => {
    const [pkt] = parseSeedPacketsLocal("Tomato Brandywine");
    expect(pkt.common_name).toBe("Tomato");
    expect(pkt.variety).toBe("Brandywine");
    expect(pkt.vendor).toBeNull();
  });

  test("name only single-word stays as common_name with null variety", () => {
    const [pkt] = parseSeedPacketsLocal("Sunflower");
    expect(pkt.common_name).toBe("Sunflower");
    expect(pkt.variety).toBeNull();
  });

  test("dash-separator line parses details after the dash", () => {
    // 3-word name without quoted variety stays whole — variety extraction
    // is intentionally conservative for free-text. AI handles the ambiguous
    // cases. Details after the dash still parse correctly.
    const [pkt] = parseSeedPacketsLocal(
      "Lettuce Lollo Rossa - Real Seeds, sow-by 2026-07",
    );
    expect(pkt.common_name).toBe("Lettuce Lollo Rossa");
    expect(pkt.variety).toBeNull();
    expect(pkt.vendor).toBe("Real Seeds");
    expect(pkt.sow_by).toBe("2026-07-31");
  });

  test("invalid year is rejected (no date returned)", () => {
    const [pkt] = parseSeedPacketsLocal(
      "Tomato Sungold (Suttons, sow-by 1850-01)",
    );
    expect(pkt.sow_by).toBeNull();
  });

  test("quantity heuristics catch '30 seeds', 'half a packet'", () => {
    const [a] = parseSeedPacketsLocal("Pea Hurst Greenshaft (Suttons, 30 seeds)");
    expect(a.quantity_remaining).toBe("30 seeds");

    const [b] = parseSeedPacketsLocal("Pea Hurst Greenshaft (Suttons, half a packet)");
    expect(b.quantity_remaining).toBe("half a packet");
  });

  test("unrecognised tokens land in notes", () => {
    const [pkt] = parseSeedPacketsLocal(
      "Tomato Sungold (Suttons, sow-by 2028-12, heirloom yellow cherry)",
    );
    expect(pkt.notes).toBe("heirloom yellow cherry");
  });

  test("cap at 60 candidates", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Carrot Variety${i}`).join("\n");
    const out = parseSeedPacketsLocal(lines);
    expect(out).toHaveLength(60);
  });

  test("blank lines between entries are tolerated", () => {
    const out = parseSeedPacketsLocal("Tomato\n\n\nSunflower\n\n");
    expect(out).toHaveLength(2);
    expect(out[0].common_name).toBe("Tomato");
    expect(out[1].common_name).toBe("Sunflower");
  });
});
