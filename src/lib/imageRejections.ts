// Client half of the image tap → right/wrong → replace feature
// (docs/plans/image-judge-and-replace.md). A "wrong" verdict on an owned
// plant/ailment image records the URL in `image_rejections` (home-scoped); the
// image-search edge functions then exclude it from every future candidate pool
// for that home. The "serve the next candidate" call re-invokes the relevant
// image-search function WITH the home_id so the edge function applies the
// rejection filter.

import { supabase } from "./supabase";

export type ImageSubjectKind = "plant" | "ailment";

export interface ReplacementImage {
  thumb_url: string;
  full_url: string;
  image_credit?: unknown;
  source?: string;
}

/**
 * MUST mirror the edge functions' `normaliseQuery` (plant-image-search /
 * ailment-image-search) exactly — the `subject_key` a rejection is stored under
 * has to match the key the edge function loads rejections by, or the reject
 * silently won't filter. Keep the two in lockstep.
 */
export function normaliseSubjectKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Record that `rejectedUrl` is the wrong image for this subject in this home.
 * Idempotent (INSERT … ON CONFLICT DO NOTHING via the dedup unique index).
 * Returns the raw supabase `{ error }` so the caller can toast on failure.
 */
export async function rejectImage(params: {
  homeId: string;
  subjectKind: ImageSubjectKind;
  name: string;
  rejectedUrl: string;
  subjectId?: string | number | null;
  userId?: string | null;
}) {
  const { homeId, subjectKind, name, rejectedUrl, subjectId, userId } = params;
  return supabase.from("image_rejections").upsert(
    {
      home_id: homeId,
      subject_kind: subjectKind,
      subject_key: normaliseSubjectKey(name),
      rejected_url: rejectedUrl,
      subject_id: subjectId != null ? String(subjectId) : null,
      rejected_by: userId ?? null,
    },
    { onConflict: "home_id,subject_kind,subject_key,rejected_url", ignoreDuplicates: true },
  );
}

/**
 * Fetch the next replacement candidate for a subject, with this home's
 * rejections excluded server-side. Returns null when the pool is exhausted (the
 * UI should then keep the current image and say "no other photos found").
 */
export async function fetchReplacementImage(params: {
  functionName: "plant-image-search" | "ailment-image-search";
  name: string;
  homeId: string;
  subjectKind: ImageSubjectKind;
  extraBody?: Record<string, unknown>;
}): Promise<ReplacementImage | null> {
  const { functionName, name, homeId, subjectKind, extraBody } = params;
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { query: name, count: 1, home_id: homeId, subject_kind: subjectKind, ...extraBody },
  });
  if (error) return null;
  const first = data?.images?.[0];
  return first && first.thumb_url ? (first as ReplacementImage) : null;
}
