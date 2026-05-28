// Crop-rotation rules map — covers the 12 well-known edible-rotation
// families. The map is intentionally NOT a filter for what shows in the
// history timeline (we display every family the user has grown); it's
// purely the source of "avoid X for Y years" + "prefer Y after X" rules
// that drive the recommendation chips.
//
// Unknown / ornamental families fall through with no rotation rule:
// they're shown in the timeline but produce no avoid/prefer chip.

export type RotationFamilyKey =
  | "solanaceae"
  | "brassicaceae"
  | "fabaceae"
  | "alliaceae"
  | "cucurbitaceae"
  | "apiaceae"
  | "asteraceae"
  | "amaranthaceae"
  | "lamiaceae"
  | "poaceae"
  | "polygonaceae"
  | "liliaceae";

export interface RotationFamilyRule {
  /** Canonical Latin family name shown to expert gardeners. */
  family: string;
  /** Friendly name shown to new gardeners ("Tomato family"). */
  commonName: string;
  /** How many years to leave before replanting the same family. Drives the
   *  "avoid" rule: family grown within the last `avoidYears` calendar
   *  years triggers an avoid recommendation. */
  avoidYears: number;
  /** Family keys that pair well AFTER this family. Drives the prefer rule. */
  partners: RotationFamilyKey[];
  /** Hard-coded reasoning shown on the AVOID chip on non-AI tiers. */
  avoidReason: string;
  /** Hard-coded reasoning shown on the PREFER chip on non-AI tiers,
   *  inserted into "{thisFamily} after {avoidedFamily}". */
  preferReason: string;
}

/**
 * Aliases and historical / colloquial names that map onto a canonical
 * RotationFamilyKey. Lookup uses normalised lowercase input so input
 * "Solanaceae" / "solanaceae (Nightshade family)" / "nightshades" all
 * resolve to "solanaceae".
 */
const FAMILY_ALIASES: Record<string, RotationFamilyKey> = {
  // Solanaceae
  solanaceae: "solanaceae",
  nightshade: "solanaceae",
  nightshades: "solanaceae",
  // Brassicaceae
  brassicaceae: "brassicaceae",
  cruciferae: "brassicaceae",
  cabbage: "brassicaceae",
  brassicas: "brassicaceae",
  mustard: "brassicaceae",
  // Fabaceae
  fabaceae: "fabaceae",
  leguminosae: "fabaceae",
  legumes: "fabaceae",
  beans: "fabaceae",
  pea: "fabaceae",
  // Alliaceae (merged into Amaryllidaceae but commonly kept separate for rotation)
  alliaceae: "alliaceae",
  amaryllidaceae: "alliaceae",
  alliums: "alliaceae",
  onion: "alliaceae",
  onions: "alliaceae",
  // Cucurbitaceae
  cucurbitaceae: "cucurbitaceae",
  cucurbits: "cucurbitaceae",
  gourd: "cucurbitaceae",
  squash: "cucurbitaceae",
  // Apiaceae
  apiaceae: "apiaceae",
  umbelliferae: "apiaceae",
  umbellifers: "apiaceae",
  carrot: "apiaceae",
  // Asteraceae
  asteraceae: "asteraceae",
  compositae: "asteraceae",
  daisy: "asteraceae",
  composites: "asteraceae",
  // Amaranthaceae (modern; absorbs Chenopodiaceae)
  amaranthaceae: "amaranthaceae",
  chenopodiaceae: "amaranthaceae",
  goosefoot: "amaranthaceae",
  // Lamiaceae
  lamiaceae: "lamiaceae",
  labiatae: "lamiaceae",
  mint: "lamiaceae",
  // Poaceae
  poaceae: "poaceae",
  gramineae: "poaceae",
  grass: "poaceae",
  grasses: "poaceae",
  cereals: "poaceae",
  // Polygonaceae
  polygonaceae: "polygonaceae",
  knotweed: "polygonaceae",
  // Liliaceae
  liliaceae: "liliaceae",
  lily: "liliaceae",
  lilies: "liliaceae",
};

export const ROTATION_FAMILY_RULES: Record<RotationFamilyKey, RotationFamilyRule> = {
  solanaceae: {
    family: "Solanaceae",
    commonName: "Tomato family",
    avoidYears: 3,
    partners: ["fabaceae", "brassicaceae", "alliaceae"],
    avoidReason: "Heavy feeders and prone to soil-borne pathogens like blight that linger for years.",
    preferReason: "Replenishes nitrogen and breaks the pest cycle left by the previous tomato family.",
  },
  brassicaceae: {
    family: "Brassicaceae",
    commonName: "Cabbage family",
    avoidYears: 3,
    partners: ["fabaceae", "alliaceae", "cucurbitaceae"],
    avoidReason: "Club root and cabbage root fly persist in the soil for several seasons.",
    preferReason: "Different root depth and pest profile — breaks the club-root cycle.",
  },
  fabaceae: {
    family: "Fabaceae",
    commonName: "Bean & pea family",
    avoidYears: 2,
    partners: ["solanaceae", "brassicaceae", "cucurbitaceae", "poaceae"],
    avoidReason: "Soil-borne legume fungi build up with repeated planting.",
    preferReason: "Uses the nitrogen the legumes left behind — heavy feeders thrive here.",
  },
  alliaceae: {
    family: "Alliaceae",
    commonName: "Onion family",
    avoidYears: 3,
    partners: ["solanaceae", "cucurbitaceae", "apiaceae"],
    avoidReason: "White rot can persist in soil for 8+ years; rotation slows but doesn't eliminate it.",
    preferReason: "Different root profile resets the soil microbe community.",
  },
  cucurbitaceae: {
    family: "Cucurbitaceae",
    commonName: "Squash & cucumber family",
    avoidYears: 3,
    partners: ["fabaceae", "brassicaceae", "alliaceae"],
    avoidReason: "Heavy feeders and prone to powdery mildew + bacterial wilt.",
    preferReason: "Lighter feeders that let the soil recover.",
  },
  apiaceae: {
    family: "Apiaceae",
    commonName: "Carrot family",
    avoidYears: 3,
    partners: ["fabaceae", "brassicaceae"],
    avoidReason: "Carrot fly and root-knot nematodes accumulate.",
    preferReason: "Different rooting depth + nitrogen boost help the soil recover.",
  },
  asteraceae: {
    family: "Asteraceae",
    commonName: "Daisy family",
    avoidYears: 2,
    partners: ["fabaceae", "alliaceae", "cucurbitaceae"],
    avoidReason: "Lettuce drop / sclerotinia can persist a season or two.",
    preferReason: "Most families work after the daisies — pick what fits the space.",
  },
  amaranthaceae: {
    family: "Amaranthaceae",
    commonName: "Beet & spinach family",
    avoidYears: 3,
    partners: ["fabaceae", "alliaceae", "brassicaceae"],
    avoidReason: "Beet cyst nematode can persist for years.",
    preferReason: "Different host families resist beet nematodes.",
  },
  lamiaceae: {
    family: "Lamiaceae",
    commonName: "Mint family",
    avoidYears: 1,
    partners: ["solanaceae", "fabaceae", "cucurbitaceae"],
    avoidReason: "Most mints are perennial — short rotation is enough when grown as annuals.",
    preferReason: "Most families work after the mints — pick what fits the space.",
  },
  poaceae: {
    family: "Poaceae",
    commonName: "Grass family",
    avoidYears: 2,
    partners: ["fabaceae", "cucurbitaceae"],
    avoidReason: "Heavy nitrogen feeders that strip the soil.",
    preferReason: "Nitrogen-fixers replenish what the grasses took out.",
  },
  polygonaceae: {
    family: "Polygonaceae",
    commonName: "Buckwheat & rhubarb family",
    avoidYears: 2,
    partners: ["fabaceae", "alliaceae", "brassicaceae"],
    avoidReason: "Light feeders but worth giving the soil variety.",
    preferReason: "Most families work after — pick what fits the space.",
  },
  liliaceae: {
    family: "Liliaceae",
    commonName: "Lily family",
    avoidYears: 2,
    partners: ["solanaceae", "fabaceae"],
    avoidReason: "Bulb crops accumulate fungal issues with repeat planting.",
    preferReason: "Different families reset the soil microbe community.",
  },
};

/**
 * Normalise a free-text family value (which may have casing, trailing
 * "family", parenthetical notes, etc.) into its canonical lookup key.
 * Returns null for empty, unmappable, or unknown inputs.
 */
export function normaliseFamilyKey(
  raw: string | null | undefined,
): RotationFamilyKey | null {
  if (!raw) return null;
  // Strip parenthetical context: "Solanaceae (nightshade family)" → "solanaceae"
  let cleaned = raw.toLowerCase().replace(/\([^)]*\)/g, "").trim();
  // Strip trailing "family" / "famille" mentions some sources add.
  cleaned = cleaned.replace(/\s+family$/i, "").trim();
  if (!cleaned) return null;
  // Direct alias hit
  if (cleaned in FAMILY_ALIASES) return FAMILY_ALIASES[cleaned];
  // Fall through: split first word and try (handles "solanaceae nightshades")
  const firstWord = cleaned.split(/[\s,;/]/)[0];
  if (firstWord && firstWord in FAMILY_ALIASES) return FAMILY_ALIASES[firstWord];
  return null;
}

/**
 * Look up the rotation rule for a family by free-text input. Returns
 * null for families we don't have rules for (which still appear in the
 * history timeline but produce no avoid/prefer recommendation).
 */
export function getRotationRule(
  family: string | null | undefined,
): RotationFamilyRule | null {
  const key = normaliseFamilyKey(family);
  return key ? ROTATION_FAMILY_RULES[key] : null;
}

/**
 * Display label for a family — prefers the friendly common name with
 * the Latin in tow, falls back to the raw value, then "Unknown family".
 */
export function familyDisplayLabel(
  family: string | null | undefined,
): { common: string; latin: string | null } {
  const rule = getRotationRule(family);
  if (rule) return { common: rule.commonName, latin: rule.family };
  if (family && family.trim().length > 0) return { common: family.trim(), latin: null };
  return { common: "Unknown family", latin: null };
}
