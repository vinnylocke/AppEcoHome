import { supabase } from "./supabase";
import type { OptimisationProposal } from "./taskOptimiser";

export interface NegativeFeedbackItem {
  proposalId: string;
  displayText: string;
  reasoning: string;
}

export interface AiAnalyseOptions {
  homeId: string;
  areaId: string;
  regenerateReason?: string;
  previousNegativeFeedback?: NegativeFeedbackItem[];
}

export async function analyseAreaAi(opts: AiAnalyseOptions): Promise<OptimisationProposal[]> {
  const { data, error } = await supabase.functions.invoke("optimise-area-ai", {
    body: opts,
  });
  if (error) throw new Error(error.message ?? "AI analysis failed");
  return (data?.proposals ?? []) as OptimisationProposal[];
}

export async function fetchNegativeFeedback(
  userId: string,
  areaId: string,
): Promise<NegativeFeedbackItem[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("optimiser_proposal_feedback")
    .select("proposal_id, proposal_snapshot")
    .eq("user_id", userId)
    .eq("area_id", areaId)
    .eq("rating", "negative")
    .gte("created_at", cutoff);

  if (error || !data) return [];
  return data.map((row) => ({
    proposalId: row.proposal_id as string,
    displayText: (row.proposal_snapshot as any)?.displayText ?? "",
    reasoning: (row.proposal_snapshot as any)?.reasoning ?? "",
  }));
}
