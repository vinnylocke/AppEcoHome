import { supabase } from "../lib/supabase";

export interface OverhaulSubmitInput {
  homeId: string;
  photoBase64: string;
  mimeType: string;
  likes: string;
  dislikes: string;
  wants: string;
  aesthetic?: string;
  imagenTier?: "fast" | "standard";
  conceptCount?: number;
  /** When supplied, the user painted highlights onto their photo to
   *  mark regions where the AI should focus changes. The edge fn
   *  uploads this image alongside the original and uses it as the
   *  reference fed to gemini-2.5-flash-image. */
  annotatedPhotoBase64?: string;
}

export interface OverhaulSubmitResponse {
  plan_id: string;
  status: string;
  message: string;
}

export interface OverhaulConcept {
  id: string;
  plan_id: string;
  image_url: string;
  prompt: string;
  aesthetic: string;
  imagen_model: string;
  cost_usd: number | string;
  selected_by_user: boolean;
  created_at: string;
}

export interface OverhaulInput {
  id: string;
  plan_id: string;
  original_photo_url: string;
  /** Signed URL of the user-marked photo, when they painted on it
   *  during step 2 of the wizard. Null = no highlights, full-garden
   *  redesign. */
  annotated_photo_url: string | null;
  likes: string | null;
  dislikes: string | null;
  wants: string | null;
  aesthetic: string | null;
  context_used: Record<string, unknown>;
  created_at: string;
}

export interface OverhaulFeedback {
  id: string;
  plan_id: string;
  user_id: string;
  rating: "positive" | "negative";
  comment: string | null;
  created_at: string;
}

/**
 * Submit an overhaul request. Edge fn returns 202 immediately with
 * a plan_id; the background pipeline drops concepts into
 * plan_overhaul_concepts as they generate. Caller polls those rows
 * + the plans.status until concepts appear or status flips to
 * "Failed".
 */
export async function generateGardenOverhaul(
  input: OverhaulSubmitInput,
): Promise<OverhaulSubmitResponse> {
  const { data, error } = await supabase.functions.invoke("generate-garden-overhaul", {
    body: {
      homeId: input.homeId,
      photoBase64: input.photoBase64,
      mimeType: input.mimeType,
      likes: input.likes,
      dislikes: input.dislikes,
      wants: input.wants,
      aesthetic: input.aesthetic,
      imagenTier: input.imagenTier ?? "fast",
      conceptCount: input.conceptCount ?? 3,
      ...(input.annotatedPhotoBase64
        ? { annotatedPhotoBase64: input.annotatedPhotoBase64 }
        : {}),
    },
  });
  if (error) throw error;
  return data as OverhaulSubmitResponse;
}

/** Concepts for a single overhaul plan, oldest-first. */
export async function fetchOverhaulConcepts(planId: string): Promise<OverhaulConcept[]> {
  const { data, error } = await supabase
    .from("plan_overhaul_concepts")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OverhaulConcept[];
}

/** The original user input + context snapshot for one overhaul plan. */
export async function fetchOverhaulInput(planId: string): Promise<OverhaulInput | null> {
  const { data, error } = await supabase
    .from("plan_overhaul_inputs")
    .select("*")
    .eq("plan_id", planId)
    .maybeSingle();
  if (error) throw error;
  return (data as OverhaulInput | null) ?? null;
}

/**
 * Toggle which concept the user selected. Atomically clears any
 * previous selection on the same plan so the UI radio behaviour is
 * preserved server-side. Also promotes the chosen concept's image
 * to the plan's `cover_image_url` so the staging engine renders
 * it as the cover throughout phases 2–5.
 */
export async function selectOverhaulConcept(
  planId: string,
  conceptId: string,
): Promise<void> {
  // Clear all selections on the plan first…
  const { error: clearErr } = await supabase
    .from("plan_overhaul_concepts")
    .update({ selected_by_user: false })
    .eq("plan_id", planId);
  if (clearErr) throw clearErr;
  // …then mark the chosen one.
  const { error: setErr } = await supabase
    .from("plan_overhaul_concepts")
    .update({ selected_by_user: true })
    .eq("id", conceptId);
  if (setErr) throw setErr;
  // Promote the chosen concept's image to the plan's cover image so
  // PlanStaging's header reflects the user's pick.
  const { data: chosen, error: fetchErr } = await supabase
    .from("plan_overhaul_concepts")
    .select("image_url")
    .eq("id", conceptId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (chosen?.image_url) {
    const { error: planErr } = await supabase
      .from("plans")
      .update({ cover_image_url: chosen.image_url })
      .eq("id", planId);
    if (planErr) throw planErr;
  }
}

/**
 * Submit thumbs/comment feedback on an overhaul result. Upserts on
 * (user_id, plan_id) so calling twice replaces the previous rating.
 */
export async function submitOverhaulFeedback(input: {
  planId: string;
  userId: string;
  rating: "positive" | "negative";
  comment?: string;
}): Promise<void> {
  const { error } = await supabase
    .from("plan_overhaul_feedback")
    .upsert({
      plan_id: input.planId,
      user_id: input.userId,
      rating: input.rating,
      comment: input.comment ?? null,
    }, { onConflict: "user_id,plan_id" });
  if (error) throw error;
}

/** Read the caller's own feedback for a plan, if any. */
export async function fetchOwnOverhaulFeedback(
  planId: string,
  userId: string,
): Promise<OverhaulFeedback | null> {
  const { data, error } = await supabase
    .from("plan_overhaul_feedback")
    .select("*")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as OverhaulFeedback | null) ?? null;
}
