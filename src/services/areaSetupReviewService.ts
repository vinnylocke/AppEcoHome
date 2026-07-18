// Add-Area wizard — AI setup review client (2026-07-18). Thin invoke
// wrapper following the companionCache error-mapping pattern: the edge
// function's structured failures surface as typed outcomes the wizard
// renders distinctly (tier gate / rate limit / unreadable output).

import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

export type FitVerdict = "great" | "ok" | "poor" | "unknown";
export type CompatibilityVerdict = "well" | "minor" | "poor" | "unknown";

export interface ReviewSuggestedTask {
  title: string;
  description: string;
  task_type: "Planting" | "Watering" | "Harvesting" | "Maintenance";
  due_in_days: number;
  is_recurring: boolean;
  frequency_days: number | null;
}

export interface AreaSetupReview {
  score: number;
  headline: string;
  summary: string;
  plant_fit: Array<{ name: string; verdict: FitVerdict; note: string }>;
  compatibility: { verdict: CompatibilityVerdict; note: string };
  recommendations: {
    plants: Array<{ name: string; reason: string; search_query: string }>;
    tasks: ReviewSuggestedTask[];
    automations: Array<{ title: string; description: string }>;
  };
}

export type ReviewOutcome =
  | { kind: "ok"; review: AreaSetupReview }
  | { kind: "ai_required" }
  | { kind: "rate_limited" }
  | { kind: "error"; message: string };

export async function fetchAreaSetupReview(
  homeId: string,
  areaId: string,
): Promise<ReviewOutcome> {
  const { data, error } = await supabase.functions.invoke("area-setup-review", {
    body: { homeId, areaId },
  });

  if (error) {
    // The real reason is in the response body, not error.message.
    const ctx = (error as { context?: { json?: () => Promise<unknown>; status?: number } }).context;
    let body: { error?: string } | null = null;
    try {
      body = ctx?.json ? ((await ctx.json()) as { error?: string }) : null;
    } catch {
      body = null;
    }
    const status = ctx?.status;
    if (status === 403 || body?.error === "AI tier required") return { kind: "ai_required" };
    if (status === 429) return { kind: "rate_limited" };
    Logger.error("fetchAreaSetupReview failed", error, { areaId });
    return { kind: "error", message: body?.error ?? "Couldn't run the review — try again." };
  }

  if (data && typeof data === "object" && "score" in data) {
    return { kind: "ok", review: data as AreaSetupReview };
  }
  return { kind: "error", message: "Couldn't run the review — try again." };
}
