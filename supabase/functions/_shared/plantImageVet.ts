/**
 * Confidence filtering for plant-image-search's AI relevance vetting.
 *
 * The chat gallery asks Gemini to score each candidate photo 0–1 for how
 * clearly it shows the requested plant. These pure helpers parse that response
 * and drop low-confidence photos — kept side-effect free so they can be
 * unit-tested without a model call.
 */

/** Default minimum confidence a photo must reach to stay in the gallery. */
export const MIN_PLANT_PHOTO_CONFIDENCE = 0.55;

/**
 * Parse the model's JSON response (`{ "scores": [...] }`) into a numeric array,
 * or null if the shape is unusable. Non-numeric entries become NaN so they fail
 * the threshold rather than silently passing.
 */
export function parseScores(raw: string): number[] | null {
  try {
    const parsed = JSON.parse(raw);
    const scores = parsed?.scores;
    if (!Array.isArray(scores)) return null;
    return scores.map((s) => {
      const n = typeof s === "number" ? s : Number(s);
      return Number.isFinite(n) ? n : NaN;
    });
  } catch {
    return null;
  }
}

/**
 * Keep only images whose confidence score meets the threshold.
 *
 * Fails OPEN: if we don't have exactly one finite score per image (model error,
 * shape mismatch), return every image unchanged — a vetting glitch should never
 * silently empty the gallery. When scores ARE valid, low-confidence photos are
 * dropped (which may legitimately leave zero, e.g. nothing actually matched).
 */
export function selectConfidentImages<T>(
  images: T[],
  scores: number[] | null | undefined,
  threshold: number = MIN_PLANT_PHOTO_CONFIDENCE,
): T[] {
  if (!Array.isArray(scores) || scores.length !== images.length) return images;
  return images.filter((_, i) => Number.isFinite(scores[i]) && (scores[i] as number) >= threshold);
}
