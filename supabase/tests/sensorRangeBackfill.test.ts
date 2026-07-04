import { assertEquals } from "@std/assert";
import {
  needsRangeBackfill,
  buildRangePatch,
  selectBackfillRows,
} from "@shared/sensorRangeBackfill.ts";

const FULL = {
  soil_moisture_min: 30, soil_moisture_max: 60,
  soil_ec_min: 800, soil_ec_max: 1800,
  soil_temp_min: 12, soil_temp_max: 24,
};

Deno.test("SRB-001: needsRangeBackfill true when any column is null/missing", () => {
  assertEquals(needsRangeBackfill(FULL), false);
  assertEquals(needsRangeBackfill({ ...FULL, soil_ec_min: null }), true);
  assertEquals(needsRangeBackfill({ soil_moisture_min: 30 }), true); // most missing
  assertEquals(needsRangeBackfill(null), false); // nothing to do for a null row
});

Deno.test("SRB-002: buildRangePatch fills ONLY null columns, never overwrites existing", () => {
  const row = { ...FULL, soil_ec_min: null, soil_ec_max: null };
  const generated = {
    soil_moisture_min: 99, soil_moisture_max: 99, // must be ignored (row already has them)
    soil_ec_min: 900, soil_ec_max: 1900,          // fill these
    soil_temp_min: 99, soil_temp_max: 99,          // ignored
  };
  const patch = buildRangePatch(row, generated);
  assertEquals(patch, { soil_ec_min: 900, soil_ec_max: 1900 });
});

Deno.test("SRB-003: buildRangePatch returns {} when the row is already full", () => {
  assertEquals(buildRangePatch(FULL, { soil_ec_min: 1 }), {});
});

Deno.test("SRB-004: buildRangePatch ignores non-finite generated values", () => {
  const row = { soil_moisture_min: null } as Record<string, unknown>;
  assertEquals(buildRangePatch(row, { soil_moisture_min: Number.NaN }), {});
  assertEquals(buildRangePatch(row, { soil_moisture_min: 42 }), { soil_moisture_min: 42 });
});

Deno.test("SRB-005: selectBackfillRows filters to needy rows and caps at batchSize", () => {
  const rows = [
    { id: 1, ...FULL },                         // complete — skipped
    { id: 2, soil_moisture_min: 10 },           // needy
    { id: 3, ...FULL, soil_temp_max: null },    // needy
    { id: 4 },                                  // needy
  ];
  const picked = selectBackfillRows(rows as any[], 2);
  assertEquals(picked.map((r) => r.id), [2, 3]);
  assertEquals(selectBackfillRows(rows as any[], 10).length, 3);
  assertEquals(selectBackfillRows(rows as any[], 0).length, 0);
});
