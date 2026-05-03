import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

import {
  validateYieldValue,
  fetchYieldRecords,
  insertYieldRecord,
  deleteYieldRecord,
  updateExpectedHarvestDate,
} from "../../../src/services/yieldService";
import { supabase } from "../../../src/lib/supabase";

// Chainable mock builder identical to taskEngine.test.ts pattern
function makeChain(data: any = null, error: any = null) {
  const chain: any = { data, error };
  const methods = ["select", "insert", "update", "delete", "eq", "order", "single"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any) => resolve({ data, error });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateYieldValue", () => {
  test("YLD-UNIT-001: returns error for 0", () => {
    expect(validateYieldValue(0)).toBeTruthy();
  });

  test("YLD-UNIT-002: returns error for negative", () => {
    expect(validateYieldValue(-1)).toBeTruthy();
  });

  test("YLD-UNIT-003: returns null for valid positive number", () => {
    expect(validateYieldValue(1.5)).toBeNull();
  });
});

describe("fetchYieldRecords", () => {
  test("YLD-UNIT-006: filters by instance_id", async () => {
    const chain = makeChain([]);
    vi.mocked(supabase.from).mockReturnValue(chain);

    await fetchYieldRecords("inst-1");

    expect(chain.eq).toHaveBeenCalledWith("instance_id", "inst-1");
  });

  test("YLD-UNIT-007: orders by harvested_at descending", async () => {
    const chain = makeChain([]);
    vi.mocked(supabase.from).mockReturnValue(chain);

    await fetchYieldRecords("inst-1");

    expect(chain.order).toHaveBeenCalledWith("harvested_at", { ascending: false });
  });
});

describe("insertYieldRecord", () => {
  test("YLD-UNIT-004: inserts into yield_records with correct payload", async () => {
    const yieldChain = makeChain({ id: "yr-1", value: 1.5, unit: "kg", home_id: "home-1", instance_id: "inst-1", notes: null, harvested_at: "2026-05-01" });
    const journalChain = makeChain(null);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "yield_records") return yieldChain;
      return journalChain;
    });

    await insertYieldRecord({ home_id: "home-1", instance_id: "inst-1", value: 1.5, unit: "kg" });

    expect(supabase.from).toHaveBeenCalledWith("yield_records");
    expect(yieldChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1.5, unit: "kg", home_id: "home-1", instance_id: "inst-1" }),
    );
  });

  test("YLD-UNIT-005: also inserts into plant_journals with entry_type yield_logged", async () => {
    const yieldChain = makeChain({ id: "yr-1", value: 1.5, unit: "kg", home_id: "home-1", instance_id: "inst-1", notes: null, harvested_at: "2026-05-01" });
    const journalChain = makeChain(null);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "yield_records") return yieldChain;
      return journalChain;
    });

    await insertYieldRecord({ home_id: "home-1", instance_id: "inst-1", value: 1.5, unit: "kg" });

    expect(supabase.from).toHaveBeenCalledWith("plant_journals");
    expect(journalChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: "yield_logged" }),
    );
  });
});

describe("deleteYieldRecord", () => {
  test("YLD-UNIT-008: calls delete().eq('id', ...)", async () => {
    const chain = makeChain(null);
    vi.mocked(supabase.from).mockReturnValue(chain);

    await deleteYieldRecord("yr-1");

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", "yr-1");
  });
});

describe("updateExpectedHarvestDate", () => {
  test("YLD-UNIT-009: calls update with expected_harvest_date", async () => {
    const chain = makeChain(null);
    vi.mocked(supabase.from).mockReturnValue(chain);

    await updateExpectedHarvestDate("inst-1", "2026-06-01");

    expect(chain.update).toHaveBeenCalledWith({ expected_harvest_date: "2026-06-01" });
    expect(chain.eq).toHaveBeenCalledWith("id", "inst-1");
  });

  test("YLD-UNIT-010: passes null when clearing the date", async () => {
    const chain = makeChain(null);
    vi.mocked(supabase.from).mockReturnValue(chain);

    await updateExpectedHarvestDate("inst-1", null);

    expect(chain.update).toHaveBeenCalledWith({ expected_harvest_date: null });
  });
});
