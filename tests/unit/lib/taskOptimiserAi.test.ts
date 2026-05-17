import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the module under test
vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
}));

import { analyseAreaAi, fetchNegativeFeedback } from "../../../src/lib/taskOptimiserAi";
import { supabase } from "../../../src/lib/supabase";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChain(data: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  for (const m of ["select", "eq", "gte", "order", "limit", "neq", "not"]) chain[m] = noop;
  chain.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve({ data, error }).then(onFulfilled, onRejected);
  chain.catch = (onRejected: any) =>
    Promise.resolve({ data, error }).catch(onRejected);
  return chain as any;
}

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockInvoke = (supabase.functions as any).invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// analyseAreaAi
// ---------------------------------------------------------------------------

describe("analyseAreaAi", () => {
  test("calls the edge function with the right body and returns proposals", async () => {
    const fakeProposals = [
      { id: "ai-retire-Watering-area-1-0", scenario: "retire", source: "ai" },
    ];
    mockInvoke.mockResolvedValueOnce({ data: { proposals: fakeProposals }, error: null });

    const result = await analyseAreaAi({ homeId: "home-1", areaId: "area-1" });

    expect(mockInvoke).toHaveBeenCalledWith("optimise-area-ai", {
      body: { homeId: "home-1", areaId: "area-1" },
    });
    expect(result).toEqual(fakeProposals);
  });

  test("returns empty array when data.proposals is undefined", async () => {
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    const result = await analyseAreaAi({ homeId: "home-1", areaId: "area-1" });
    expect(result).toEqual([]);
  });

  test("throws when the edge function returns an error", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "Rate limit exceeded" },
    });
    await expect(analyseAreaAi({ homeId: "home-1", areaId: "area-1" })).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  test("passes regenerateReason and previousNegativeFeedback in the body", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { proposals: [] }, error: null });
    const negFeedback = [{ proposalId: "p1", displayText: "Too frequent", reasoning: "8 postponed" }];

    await analyseAreaAi({
      homeId: "home-1",
      areaId: "area-1",
      regenerateReason: "Focus on watering",
      previousNegativeFeedback: negFeedback,
    });

    expect(mockInvoke).toHaveBeenCalledWith("optimise-area-ai", {
      body: {
        homeId: "home-1",
        areaId: "area-1",
        regenerateReason: "Focus on watering",
        previousNegativeFeedback: negFeedback,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// fetchNegativeFeedback
// ---------------------------------------------------------------------------

describe("fetchNegativeFeedback", () => {
  test("returns mapped feedback items from DB rows", async () => {
    const rows = [
      {
        proposal_id: "ai-retire-Watering-area-1-0",
        proposal_snapshot: {
          displayText: "Retire Watering blueprint",
          reasoning: "Postponed 10 times, completed 0",
        },
      },
      {
        proposal_id: "ai-frequency-change-Pruning-area-1-1",
        proposal_snapshot: {
          displayText: "Reduce Pruning frequency",
          reasoning: "High postpone rate",
        },
      },
    ];
    mockFrom.mockReturnValueOnce(makeChain(rows));

    const result = await fetchNegativeFeedback("user-1", "area-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      proposalId: "ai-retire-Watering-area-1-0",
      displayText: "Retire Watering blueprint",
      reasoning: "Postponed 10 times, completed 0",
    });
    expect(result[1].proposalId).toBe("ai-frequency-change-Pruning-area-1-1");
  });

  test("returns empty array when no rows", async () => {
    mockFrom.mockReturnValueOnce(makeChain([]));
    const result = await fetchNegativeFeedback("user-1", "area-1");
    expect(result).toEqual([]);
  });

  test("returns empty array on DB error", async () => {
    mockFrom.mockReturnValueOnce(makeChain([], { message: "connection failed" }));
    const result = await fetchNegativeFeedback("user-1", "area-1");
    expect(result).toEqual([]);
  });

  test("handles missing reasoning in proposal_snapshot gracefully", async () => {
    const rows = [
      {
        proposal_id: "ai-new-blueprint-Watering-area-1-0",
        proposal_snapshot: { displayText: "Add Watering blueprint" },
      },
    ];
    mockFrom.mockReturnValueOnce(makeChain(rows));

    const result = await fetchNegativeFeedback("user-1", "area-1");
    expect(result[0].reasoning).toBe("");
    expect(result[0].displayText).toBe("Add Watering blueprint");
  });

  test("handles missing displayText in proposal_snapshot gracefully", async () => {
    const rows = [
      {
        proposal_id: "ai-retire-Watering-area-1-0",
        proposal_snapshot: { reasoning: "Zero completions" },
      },
    ];
    mockFrom.mockReturnValueOnce(makeChain(rows));

    const result = await fetchNegativeFeedback("user-1", "area-1");
    expect(result[0].displayText).toBe("");
    expect(result[0].reasoning).toBe("Zero completions");
  });
});
