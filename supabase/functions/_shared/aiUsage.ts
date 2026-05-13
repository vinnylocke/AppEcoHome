import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { GeminiUsage } from "./gemini.ts";

const COST_PER_TOKEN: Record<string, number> = {
  "gemini-3.1-flash-lite": 0.00000015,
  "gemini-2.5-flash-lite": 0.00000015,
  "gemini-3-flash-preview": 0.0000003,
  "gemini-3.1-pro-preview": 0.000003,
};

export async function logAiUsage(
  db: SupabaseClient,
  opts: {
    homeId?: string | null;
    userId?: string | null;
    functionName: string;
    action?: string | null;
    usage: GeminiUsage;
  },
): Promise<void> {
  const costPerToken = COST_PER_TOKEN[opts.usage.model] ?? 0.0000003;
  await db.from("ai_usage_log").insert({
    home_id: opts.homeId ?? null,
    user_id: opts.userId ?? null,
    function_name: opts.functionName,
    action: opts.action ?? null,
    model: opts.usage.model,
    prompt_tokens: opts.usage.promptTokenCount,
    candidates_tokens: opts.usage.candidatesTokenCount,
    total_tokens: opts.usage.totalTokenCount,
    estimated_cost_usd: costPerToken * opts.usage.totalTokenCount,
  });
}
