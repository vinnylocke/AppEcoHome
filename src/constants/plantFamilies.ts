// Plant family lookup — common vegetable / herb / flower families used for the
// crop rotation warning (Wave 10B follow-up). Pattern-matches by lowercased
// substring so plurals and minor name variations resolve correctly.

export type PlantFamily =
  | "Solanaceae"     // tomatoes, peppers, potatoes, aubergines
  | "Brassicaceae"   // cabbage, broccoli, kale, mustard, radish, turnip
  | "Cucurbitaceae"  // cucumber, squash, pumpkin, melon, courgette
  | "Fabaceae"       // beans, peas, lentils
  | "Alliaceae"      // onion, garlic, leek, chive, shallot
  | "Apiaceae"       // carrot, celery, parsley, fennel, dill, coriander
  | "Asteraceae"     // lettuce, artichoke, sunflower, marigold
  | "Chenopodiaceae" // spinach, chard, beetroot
  | "Lamiaceae"      // basil, mint, oregano, rosemary, sage, thyme
  | "Rosaceae"       // strawberry, apple, pear, plum, raspberry
  | "Other";

interface FamilyRule {
  family: PlantFamily;
  /** Lowercase substring or word to match against plant name. */
  match: string[];
}

const RULES: FamilyRule[] = [
  { family: "Solanaceae", match: ["tomato", "pepper", "chilli", "potato", "aubergine", "eggplant"] },
  { family: "Brassicaceae", match: ["cabbage", "broccoli", "cauliflower", "kale", "mustard", "radish", "turnip", "rocket", "arugula", "pak choi", "bok choy"] },
  { family: "Cucurbitaceae", match: ["cucumber", "squash", "pumpkin", "melon", "courgette", "zucchini", "gourd"] },
  { family: "Fabaceae", match: ["bean", "pea", "lentil", "chickpea", "lupin"] },
  { family: "Alliaceae", match: ["onion", "garlic", "leek", "chive", "shallot"] },
  { family: "Apiaceae", match: ["carrot", "celery", "parsley", "fennel", "dill", "coriander", "cilantro", "parsnip"] },
  { family: "Asteraceae", match: ["lettuce", "artichoke", "sunflower", "marigold", "calendula", "dahlia"] },
  { family: "Chenopodiaceae", match: ["spinach", "chard", "beetroot", "beet"] },
  { family: "Lamiaceae", match: ["basil", "mint", "oregano", "rosemary", "sage", "thyme", "lavender"] },
  { family: "Rosaceae", match: ["strawberry", "apple", "pear", "plum", "raspberry", "rose", "blackberry"] },
];

export function getPlantFamily(name: string | null | undefined): PlantFamily {
  if (!name) return "Other";
  const lower = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.match.some(m => lower.includes(m))) return rule.family;
  }
  return "Other";
}

const ROTATION_GUIDANCE: Partial<Record<PlantFamily, string>> = {
  Solanaceae:    "Solanaceae (tomato, pepper, potato) deplete the soil — rotate away for 2–3 years.",
  Brassicaceae:  "Brassicas (cabbage family) build up club-root if planted year after year.",
  Cucurbitaceae: "Cucurbits (squash, cucumber) share powdery mildew risk and exhaust nutrients.",
  Fabaceae:      "Legumes fix nitrogen — usually safe to repeat, but rotation still helps soil structure.",
  Alliaceae:     "Alliums (onion, garlic) attract onion fly — best rotated annually.",
  Apiaceae:      "Apiaceae (carrot, celery, parsley) share carrot fly — rotate annually.",
};

export function getRotationWarning(family: PlantFamily): string | null {
  return ROTATION_GUIDANCE[family] ?? null;
}
