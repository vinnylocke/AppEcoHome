import { assertEquals, assertExists } from "@std/assert";
import { logAiUsage } from "@shared/aiUsage.ts";
import { estimateGeminiCostUsd } from "@shared/geminiCost.ts";
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
// Cost calculation — must delegate to estimateGeminiCostUsd (accurate,
// input/output/cache/thoughts-aware), NOT a flat per-token rate.
// ---------------------------------------------------------------------------

Deno.test("logAiUsage — accurate cost for gemini-3.1-flash-lite", async () => {
  const { db, getCaptured } = makeInsertCapture();
  const usage = makeUsage({ model: "gemini-3.1-flash-lite", promptTokenCount: 800, candidatesTokenCount: 200 });
  await logAiUsage(db as any, { userId: "user-1", homeId: "home-1", functionName: "optimise-area-ai", usage });
  const row = getCaptured()!;
  assertExists(row);
  assertEquals(row.estimated_cost_usd, estimateGeminiCostUsd("gemini-3.1-flash-lite", usage));
});

Deno.test("logAiUsage — accurate cost for gemini-3.1-pro-preview (input ≠ output rate)", async () => {
  const { db, getCaptured } = makeInsertCapture();
  const usage = makeUsage({ model: "gemini-3.1-pro-preview", promptTokenCount: 1500, candidatesTokenCount: 500 });
  await logAiUsage(db as any, { userId: "user-1", functionName: "plant-doctor", usage });
  const row = getCaptured()!;
  assertEquals(row.estimated_cost_usd, estimateGeminiCostUsd("gemini-3.1-pro-preview", usage));
});

Deno.test("logAiUsage — accounts for cached + thoughts tokens", async () => {
  const { db, getCaptured } = makeInsertCapture();
  const usage = makeUsage({
    model: "gemini-2.5-flash",
    promptTokenCount: 1000,
    cachedContentTokenCount: 400,
    candidatesTokenCount: 200,
    thoughtsTokenCount: 300,
  });
  await logAiUsage(db as any, { functionName: "agent-chat", usage });
  const row = getCaptured()!;
  assertEquals(row.estimated_cost_usd, estimateGeminiCostUsd("gemini-2.5-flash", usage));
  assertEquals(row.cached_tokens, 400);
  assertEquals(row.thoughts_tokens, 300);
});

Deno.test("logAiUsage — unknown model costs 0 (not a flat default)", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    functionName: "optimise-area-ai",
    usage: makeUsage({ model: "gemini-unknown-model" }),
  });
  const row = getCaptured()!;
  assertEquals(row.estimated_cost_usd, 0);
});

Deno.test("logAiUsage — batch discount halves the cost", async () => {
  const { db, getCaptured } = makeInsertCapture();
  const usage = makeUsage({ model: "gemini-2.5-flash-lite", promptTokenCount: 5000, candidatesTokenCount: 1000 });
  await logAiUsage(db as any, { functionName: "seed-plant-library", usage, batch: true });
  const row = getCaptured()!;
  assertEquals(row.estimated_cost_usd, estimateGeminiCostUsd("gemini-2.5-flash-lite", usage, { batch: true }));
});

// ---------------------------------------------------------------------------
// Imagen (image-only) calls
// ---------------------------------------------------------------------------

Deno.test("logAiUsage — image-only call logs image cost + model", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    functionName: "generate-garden-overhaul",
    action: "concept_image",
    imageCount: 2,
    imageCostUsd: 0.08,
    imagenModel: "imagen-4.0-generate-001",
  });
  const row = getCaptured()!;
  assertEquals(row.image_count, 2);
  assertEquals(row.image_cost_usd, 0.08);
  assertEquals(row.estimated_cost_usd, 0.08);
  assertEquals(row.model, "imagen-4.0-generate-001");
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
// Observability — context / prompt / raw result
// ---------------------------------------------------------------------------

Deno.test("logAiUsage — stores context + prompt, defaults status to ok", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    functionName: "plant-doctor",
    usage: makeUsage(),
    contextBlock: "=== GARDENER CONTEXT ===",
    prompt: "Diagnose this plant",
  });
  const row = getCaptured()!;
  assertEquals(row.context_block, "=== GARDENER CONTEXT ===");
  assertEquals(row.prompt, "Diagnose this plant");
  assertEquals(row.status, "ok");
  assertEquals(row.error, null);
});

Deno.test("logAiUsage — strips base64 image bytes from raw_result", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    functionName: "plant-doctor",
    usage: makeUsage(),
    rawResult: { text: "yellowing leaves", bytesBase64Encoded: "AAAABBBBCCCCDDDD" },
  });
  const row = getCaptured()!;
  const raw = row.raw_result as Record<string, unknown>;
  assertEquals(raw.text, "yellowing leaves");
  assertEquals(raw.bytesBase64Encoded, "[stripped]");
});

Deno.test("logAiUsage — records error status", async () => {
  const { db, getCaptured } = makeInsertCapture();
  await logAiUsage(db as any, {
    functionName: "plant-doctor",
    status: "error",
    error: "Gemini 503",
  });
  const row = getCaptured()!;
  assertEquals(row.status, "error");
  assertEquals(row.error, "Gemini 503");
  assertEquals(row.estimated_cost_usd, 0);
});
