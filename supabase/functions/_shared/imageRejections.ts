// Shared rejection-awareness for the image-search edge functions (plant +
// ailment). A home records that an image URL is WRONG for a subject (a plant or
// ailment, keyed by its normalised name); these functions then exclude those
// URLs from every candidate pool served to that home — persisting across the
// shared caches' 90-day TTL.
//
// The reject itself is a plain client INSERT into `image_rejections`
// (docs/plans/image-judge-and-replace.md). This module only READS the table
// (via the service role) and verifies caller membership. The filtering MUST
// stay per-home and in-memory — the caller must never mutate the cross-user
// shared image caches when a rejection is applied, or one home's reject would
// change the image for every home.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type SubjectKind = "plant" | "ailment";

interface UrlPair {
  thumb_url?: string | null;
  full_url?: string | null;
}

/**
 * Verify the caller (from the request's Authorization JWT) is a member of
 * `homeId`, returning the homeId when valid, else null. Defence-in-depth so a
 * client can't hide images from a home it can't see: the anon-key client +
 * getUser() validates the JWT signature, then the service client confirms
 * membership. Fails closed (returns null) on any error / missing auth.
 */
export async function resolveMemberHome(
  req: Request,
  db: SupabaseClient,
  supabaseUrl: string,
  anonKey: string | undefined,
  homeId: string | null | undefined,
): Promise<string | null> {
  if (!homeId || !anonKey) return null;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return null;
    const { data } = await db
      .from("home_members")
      .select("home_id")
      .eq("home_id", homeId)
      .eq("user_id", user.id)
      .maybeSingle();
    return data ? homeId : null;
  } catch {
    return null;
  }
}

/** Load the set of URLs this home has rejected for a subject (both thumb + full). */
export async function loadRejectedUrls(
  db: SupabaseClient,
  homeId: string,
  subjectKind: SubjectKind,
  subjectKey: string,
): Promise<Set<string>> {
  const { data } = await db
    .from("image_rejections")
    .select("rejected_url")
    .eq("home_id", homeId)
    .eq("subject_kind", subjectKind)
    .eq("subject_key", subjectKey);
  return new Set(
    (data ?? [])
      .map((r: { rejected_url: string | null }) => r.rejected_url)
      .filter((u): u is string => !!u),
  );
}

/** True when either the thumb or full URL of an image is in the rejected set. */
export function isRejected(img: UrlPair, rejected: Set<string>): boolean {
  if (rejected.size === 0) return false;
  return (
    (img.thumb_url != null && rejected.has(img.thumb_url)) ||
    (img.full_url != null && rejected.has(img.full_url))
  );
}

/** Filter a candidate pool by the rejected set, preserving order. */
export function filterRejected<T extends UrlPair>(images: T[], rejected: Set<string>): T[] {
  if (rejected.size === 0) return images;
  return images.filter((img) => !isRejected(img, rejected));
}
