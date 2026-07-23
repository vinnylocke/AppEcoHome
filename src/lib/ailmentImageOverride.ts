// Ailment side of the image tap → right/wrong → replace feature
// (docs/plans/image-judge-and-replace.md). Unlike plants (which fork via the
// edit modal's save), an ailment image is written directly: the home `ailments`
// row is home-scoped + writable, and — because `ailment_library` is global
// read-only — a per-home `ailment_image_overrides` row is the source of truth
// for library / field-guide / favourite surfaces. We write BOTH.

import { supabase } from "./supabase";
import { normaliseSubjectKey, rejectImage, fetchReplacementImage } from "./imageRejections";

/** Best-effort resolve the global ailment_library id by name_key (mirrors the
 * favourites resolver). Null when no catalogue row matches (manual ailments). */
async function resolveAilmentLibraryId(name: string): Promise<number | null> {
  const { data } = await supabase
    .from("ailment_library")
    .select("id")
    .eq("name_key", normaliseSubjectKey(name))
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

export interface AilmentImageResult {
  imageUrl: string;
  thumbUrl: string;
}

/**
 * "Wrong photo → replace" for an ailment: reject the current image (if any) so
 * it's never re-served for this home, fetch the next candidate (rejection-aware,
 * via ailment-image-search), then persist it into the home `ailments` row AND
 * the per-home `ailment_image_overrides`. Returns the new image, or null when
 * the candidate pool is exhausted (the caller keeps the current image).
 */
export async function replaceAilmentImage(params: {
  homeId: string;
  ailmentId: string;
  name: string;
  scientificName?: string | null;
  currentUrl?: string | null;
  userId?: string | null;
}): Promise<AilmentImageResult | null> {
  const { homeId, ailmentId, name, scientificName, currentUrl, userId } = params;

  if (currentUrl) {
    await rejectImage({
      homeId,
      subjectKind: "ailment",
      name,
      rejectedUrl: currentUrl,
      subjectId: ailmentId,
      userId,
    });
  }

  const replacement = await fetchReplacementImage({
    functionName: "ailment-image-search",
    name,
    homeId,
    subjectKind: "ailment",
    extraBody: scientificName ? { scientific_name: scientificName } : undefined,
  });
  if (!replacement) return null;

  const imageUrl = replacement.full_url;
  const thumbUrl = replacement.thumb_url;

  // 1. Mirror into the writable home ailments row (the visible card render).
  //    This is the write the user sees — if it fails (transient / RLS), throw so
  //    the caller shows an error toast rather than a false "Photo replaced". The
  //    reject already persisted, so a retry self-heals to the next candidate.
  const { error: mirrorErr } = await supabase
    .from("ailments")
    .update({ thumbnail_url: imageUrl })
    .eq("id", ailmentId)
    .eq("home_id", homeId);
  if (mirrorErr) throw new Error(mirrorErr.message);

  // 2. Upsert the per-home override — source of truth for library/field-guide
  //    surfaces with no home row. find-then-upsert because the two partial
  //    uniques (by library id vs identity_key) can't be disambiguated by
  //    PostgREST on_conflict.
  const libraryId = await resolveAilmentLibraryId(name);
  const identityKey = normaliseSubjectKey(name);
  const row: Record<string, unknown> = {
    home_id: homeId,
    ailment_library_id: libraryId,
    identity_key: identityKey,
    image_url: imageUrl,
    thumb_url: thumbUrl,
    image_credit: (replacement.image_credit ?? null) as unknown,
    source: replacement.source ?? null,
    created_by: userId ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } =
    libraryId != null
      ? await supabase
          .from("ailment_image_overrides")
          .select("id")
          .eq("home_id", homeId)
          .eq("ailment_library_id", libraryId)
          .maybeSingle()
      : await supabase
          .from("ailment_image_overrides")
          .select("id")
          .eq("home_id", homeId)
          .eq("identity_key", identityKey)
          .is("ailment_library_id", null)
          .maybeSingle();
  if (existing?.id) {
    await supabase.from("ailment_image_overrides").update(row).eq("id", existing.id);
  } else {
    await supabase.from("ailment_image_overrides").insert(row);
  }

  return { imageUrl, thumbUrl };
}
