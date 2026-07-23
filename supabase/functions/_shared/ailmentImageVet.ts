// Ailment-aware image vetting for ailment-image-search (2026-07-23). The plant
// image vet (_shared/plantImageVet.ts) scores "is this the living, growing
// PLANT", which actively downranks a correct insect macro or a leaf-lesion —
// exactly the images an ailment search needs. This vet asks the opposite: does
// the photo clearly show the PEST/DISEASE organism or its damage. The numeric
// parsing + selection stay shared with plantImageVet (parseScores /
// selectConfidentImages — they are provider-agnostic).

// Slightly more lenient than the plant threshold: correct organism macros are
// harder for the model to be maximally confident about than a whole plant.
export const AILMENT_PHOTO_CONFIDENCE = 0.5;

/** Build the batched vet instruction for `count` ailment candidate photos. */
export function buildAilmentVetInstruction(query: string, count: number): string {
  return (
    `A gardener is looking at photos of the pest / disease / weed "${query}". ` +
    `You are shown ${count} candidate photos, in order. For EACH photo, rate 0–1 how clearly ` +
    `it shows THAT pest/disease organism OR its damage/symptom on a plant — NOT an unrelated ` +
    `healthy ornamental plant, a seed packet, a diagram, a logo, a map, or a person. A close-up ` +
    `of the insect / mite / mould / lesion, or a clear photo of the invasive weed itself, all ` +
    `count as clearly showing it. Return JSON {"scores":[...]} with exactly ${count} numbers in ` +
    `the SAME order as the photos.`
  );
}
