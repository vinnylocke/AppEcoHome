// Builds an image-search query biased toward the *growing plant* rather than its
// produce. Stock photo sources (Unsplash/Pixabay) tag a bare crop name like
// "runner bean" mostly to the food/dried seeds, so we append a botanical
// descriptor ("plant") unless the phrase already reads as botanical. Wikipedia's
// OpenSearch still resolves the article fine with the extra word. Pure + tested.

const BOTANICAL_HINTS = [
  "plant",
  "flower",
  "foliage",
  "tree",
  "shrub",
  "vine",
  "leaf",
  "leaves",
  "bush",
  "herb",
  "seedling",
  "blossom",
];

/**
 * @param name         Common name used to label the photo (fallback query).
 * @param searchQuery  Optional better phrase from the model (e.g. scientific name).
 * @returns A trimmed query ending in a botanical descriptor when one is missing.
 */
export function plantPhotoQuery(name: string, searchQuery?: string | null): string {
  const base = (searchQuery && searchQuery.trim()) || (name ?? "").trim();
  if (!base) return "";

  const lower = base.toLowerCase();
  const alreadyBotanical = BOTANICAL_HINTS.some((hint) => lower.includes(hint));
  return alreadyBotanical ? base : `${base} plant`;
}
