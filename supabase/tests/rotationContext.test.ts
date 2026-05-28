import { assertEquals, assert } from "@std/assert";
import {
  ROTATION_FAMILY_RULES,
  normaliseFamilyKey,
  getRotationRule,
} from "../functions/_shared/rotationFamilies.ts";
import {
  buildAreaRotationBlock,
  renderRotationBlock,
  type InventoryRowForRotation,
} from "../functions/_shared/rotationContext.ts";

// ─────────────────────────────────────────────────────────────────────────
// Parity with the browser-side family map
// ─────────────────────────────────────────────────────────────────────────

Deno.test("ROTATION_FAMILY_RULES has the expected 12 canonical families", () => {
  const keys = Object.keys(ROTATION_FAMILY_RULES).sort();
  assertEquals(keys, [
    "alliaceae",
    "amaranthaceae",
    "apiaceae",
    "asteraceae",
    "brassicaceae",
    "cucurbitaceae",
    "fabaceae",
    "lamiaceae",
    "liliaceae",
    "poaceae",
    "polygonaceae",
    "solanaceae",
  ]);
});

Deno.test("ROTATION_FAMILY_RULES — every partner key resolves to a known family", () => {
  for (const rule of Object.values(ROTATION_FAMILY_RULES)) {
    for (const partner of rule.partners) {
      assert(
        ROTATION_FAMILY_RULES[partner],
        `Dangling partner reference: ${partner}`,
      );
    }
  }
});

Deno.test("normaliseFamilyKey — common aliases resolve", () => {
  assertEquals(normaliseFamilyKey("Solanaceae"), "solanaceae");
  assertEquals(normaliseFamilyKey("Nightshades"), "solanaceae");
  assertEquals(normaliseFamilyKey("Compositae"), "asteraceae");
  assertEquals(normaliseFamilyKey("Chenopodiaceae"), "amaranthaceae");
  assertEquals(normaliseFamilyKey("Pinaceae"), null);
});

// ─────────────────────────────────────────────────────────────────────────
// buildAreaRotationBlock — the same logic as src/lib/rotationEngine.ts
// ─────────────────────────────────────────────────────────────────────────

function row(overrides: Partial<InventoryRowForRotation>): InventoryRowForRotation {
  return {
    area_id: "area-1",
    plant_name: "Plant",
    planted_at: null,
    ended_at: null,
    created_at: null,
    family: null,
    ...overrides,
  };
}

Deno.test("buildAreaRotationBlock — empty when no rows", () => {
  const b = buildAreaRotationBlock("area-1", []);
  assertEquals(b.history, []);
  assertEquals(b.avoid, []);
  assertEquals(b.prefer, []);
});

Deno.test("buildAreaRotationBlock — flags solanaceae when grown last year", () => {
  const b = buildAreaRotationBlock(
    "area-1",
    [row({ family: "Solanaceae", planted_at: "2025-05-01" })],
    2026,
  );
  assertEquals(b.avoid, ["Solanaceae"]);
  assert(b.prefer.includes("Fabaceae"));
  assert(b.prefer.includes("Brassicaceae"));
});

Deno.test("buildAreaRotationBlock — partner avoided when also in avoid set", () => {
  const b = buildAreaRotationBlock(
    "area-1",
    [
      row({ family: "Solanaceae", planted_at: "2025-05-01" }),
      row({ family: "Brassicaceae", planted_at: "2025-08-01" }),
    ],
    2026,
  );
  assertEquals(b.avoid.sort(), ["Brassicaceae", "Solanaceae"]);
  // Brassicaceae shouldn't appear in prefer even though Solanaceae lists it as a partner.
  assert(!b.prefer.includes("Brassicaceae"));
  assert(!b.prefer.includes("Solanaceae"));
});

Deno.test("buildAreaRotationBlock — unknown family is excluded from avoid/prefer", () => {
  const b = buildAreaRotationBlock(
    "area-1",
    [row({ family: "Cactaceae", planted_at: "2025-05-01" })],
    2026,
  );
  assertEquals(b.history.length, 0); // Cactaceae has no canonical mapping, dropped
  assertEquals(b.avoid, []);
  assertEquals(b.prefer, []);
});

Deno.test("buildAreaRotationBlock — respects avoid window length", () => {
  // Solanaceae avoidYears=3, so planted 3 years ago should clear.
  const b = buildAreaRotationBlock(
    "area-1",
    [row({ family: "Solanaceae", planted_at: "2023-05-01" })],
    2026,
  );
  assertEquals(b.avoid, []);
});

Deno.test("buildAreaRotationBlock — Lamiaceae (1-year avoid) clears quickly", () => {
  const b = buildAreaRotationBlock(
    "area-1",
    [row({ family: "Lamiaceae", planted_at: "2025-05-01" })],
    2026,
  );
  assertEquals(b.avoid, []);
});

// ─────────────────────────────────────────────────────────────────────────
// renderRotationBlock — prompt formatting
// ─────────────────────────────────────────────────────────────────────────

Deno.test("renderRotationBlock — empty string when no history", () => {
  assertEquals(renderRotationBlock("Area X", { history: [], avoid: [], prefer: [] }), "");
});

Deno.test("renderRotationBlock — includes area name, history, and rule lines", () => {
  const out = renderRotationBlock("South Bed", {
    history: [
      { year: 2026, families: ["Solanaceae"] },
      { year: 2025, families: ["Brassicaceae"] },
    ],
    avoid: ["Solanaceae"],
    prefer: ["Fabaceae", "Brassicaceae"],
  });
  assert(out.includes(`"South Bed"`));
  assert(out.includes("2026: Solanaceae"));
  assert(out.includes("2025: Brassicaceae"));
  assert(out.includes("AVOID this year: Solanaceae"));
  assert(out.includes("PREFER this year: Fabaceae, Brassicaceae"));
});

Deno.test("renderRotationBlock — caps history at 5 seasons", () => {
  const history = Array.from({ length: 10 }, (_, i) => ({
    year: 2026 - i,
    families: ["Solanaceae"],
  }));
  const out = renderRotationBlock("Bed", { history, avoid: [], prefer: [] });
  const seasonLines = out
    .split("\n")
    .filter((l) => l.match(/^\s*-\s+\d{4}:/));
  assertEquals(seasonLines.length, 5);
});
