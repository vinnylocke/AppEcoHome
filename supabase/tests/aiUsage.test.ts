import { assertEquals, assertExists } from "@std/assert";
import { logAiUsage } from "@shared/aiUsage.ts";
import type { GeminiUsage } from "@shared/gemini.ts";

// ---------------------------------------------------------------------------
// Mock DB that captures the insert payload
// ---------------------------------------------------------------------------

function makeInsertCapture() {
  let captured: Record<string, unknown> | null = null;
  const chain = {
    insert: (row: Record<string, unknown>) => {
      captured = row;
      return Promise.resolve({ error: null });
    },
  };
  const db = { from: (_table: string) => chain };
  return { db, getCaptured: () => captured };
}

function makeUsage(overrides: Partial<GeminiUsage> = {}): GeminiUsage {
  return {
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    cachedContentTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 150,
    model: "gemini-3.1-flash-lite",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

Deno.test("logAiUsage — calculates cost correctly for gemini-3.1-flash-lite", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    userId: "user-1",
    homeId: "home-1",
    functionName: "optimise-area-ai",
    usage: makeUsage({ model: "gemini-3.1-flash-lite", totalTokenCount: 1000 }),
  });
  const row = getCaptured()!;
  assertExists(row);
  // 0.00000015 * 1000 = 0.00015
  assertEquals(row.estimated_cost_usd, 0.00000015 * 1000);
});

Deno.test("logAiUsage — calculates cost correctly for gemini-3.1-pro-preview", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    userId: "user-1",
    functionName: "optimise-area-ai",
    usage: makeUsage({ model: "gemini-3.1-pro-preview", totalTokenCount: 2000 }),
  });
  const row = getCaptured()!;
  // 0.000003 * 2000 = 0.006
  assertEquals(row.estimated_cost_usd, 0.000003 * 2000);
});

Deno.test("logAiUsage — uses default cost rate for unknown model", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    userId: "user-1",
    functionName: "optimise-area-ai",
    usage: makeUsage({ model: "gemini-unknown-model", totalTokenCount: 500 }),
  });
  const row = getCaptured()!;
  // Default rate: 0.0000003 * 500 = 0.00015
  assertEquals(row.estimated_cost_usd, 0.0000003 * 500);
});

// ---------------------------------------------------------------------------
// Row field mapping
// ---------------------------------------------------------------------------

Deno.test("logAiUsage — maps all fields into the insert row", async () => {
  const usage = makeUsage({
    model: "gemini-2.5-flash-lite",
    promptTokenCount: 200,
    candidatesTokenCount: 80,
    totalTokenCount: 280,
  });
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    userId: "u-abc",
    homeId: "h-abc",
    functionName: "optimise-area-ai",
    action: "optimise_area",
    usage,
  });
  const row = getCaptured()!;
  assertEquals(row.user_id, "u-abc");
  assertEquals(row.home_id, "h-abc");
  assertEquals(row.function_name, "optimise-area-ai");
  assertEquals(row.action, "optimise_area");
  assertEquals(row.model, "gemini-2.5-flash-lite");
  assertEquals(row.prompt_tokens, 200);
  assertEquals(row.candidates_tokens, 80);
  assertEquals(row.total_tokens, 280);
});

Deno.test("logAiUsage — null homeId and action are passed through as null", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    userId: "u-1",
    functionName: "optimise-area-ai",
    usage: makeUsage(),
  });
  const row = getCaptured()!;
  assertEquals(row.home_id, null);
  assertEquals(row.action, null);
});

Deno.test("logAiUsage — null userId is passed through as null", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    homeId: "h-1",
    functionName: "optimise-area-ai",
    usage: makeUsage(),
  });
  const row = getCaptured()!;
  assertEquals(row.user_id, null);
});

// ---------------------------------------------------------------------------
// Handles gemini-3-flash-preview cost tier
// ---------------------------------------------------------------------------

Deno.test("logAiUsage — calculates cost correctly for gemini-3-flash-preview", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    functionName: "plant-doctor",
    usage: makeUsage({ model: "gemini-3-flash-preview", totalTokenCount: 4000 }),
  });
  const row = getCaptured()!;
  // 0.0000003 * 4000 = 0.0012
  assertEquals(row.estimated_cost_usd, 0.0000003 * 4000);
});
