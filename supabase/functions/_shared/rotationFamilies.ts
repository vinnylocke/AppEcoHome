// Server-side mirror of `src/lib/rotationFamilies.ts`.
//
// Kept in lockstep with the browser version — `supabase/tests/rotationContext.test.ts`
// asserts the family keys match so a future drift fails CI before it ships.
//
// Why duplicate instead of import? Deno + browser bundling don't share
// a module resolver, and edge functions need pure-Deno imports. The
// duplication is acceptable because the content is data, not behaviour.

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
  family: string;
  commonName: string;
  avoidYears: number;
  partners: RotationFamilyKey[];
  avoidReason: string;
  preferReason: string;
}

const FAMILY_ALIASES: Record<string, RotationFamilyKey> = {
  solanaceae: "solanaceae",
  nightshade: "solanaceae",
  nightshades: "solanaceae",
  brassicaceae: "brassicaceae",
  cruciferae: "brassicaceae",
  cabbage: "brassicaceae",
  brassicas: "brassicaceae",
  mustard: "brassicaceae",
  fabaceae: "fabaceae",
  leguminosae: "fabaceae",
  legumes: "fabaceae",
  beans: "fabaceae",
  pea: "fabaceae",
  alliaceae: "alliaceae",
  amaryllidaceae: "alliaceae",
  alliums: "alliaceae",
  onion: "alliaceae",
  onions: "alliaceae",
  cucurbitaceae: "cucurbitaceae",
  cucurbits: "cucurbitaceae",
  gourd: "cucurbitaceae",
  squash: "cucurbitaceae",
  apiaceae: "apiaceae",
  umbelliferae: "apiaceae",
  umbellifers: "apiaceae",
  carrot: "apiaceae",
  asteraceae: "asteraceae",
  compositae: "asteraceae",
  daisy: "asteraceae",
  composites: "asteraceae",
  amaranthaceae: "amaranthaceae",
  chenopodiaceae: "amaranthaceae",
  goosefoot: "amaranthaceae",
  lamiaceae: "lamiaceae",
  labiatae: "lamiaceae",
  mint: "lamiaceae",
  poaceae: "poaceae",
  gramineae: "poaceae",
  grass: "poaceae",
  grasses: "poaceae",
  cereals: "poaceae",
  polygonaceae: "polygonaceae",
  knotweed: "polygonaceae",
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

export function normaliseFamilyKey(
  raw: string | null | undefined,
): RotationFamilyKey | null {
  if (!raw) return null;
  let cleaned = raw.toLowerCase().replace(/\([^)]*\)/g, "").trim();
  cleaned = cleaned.replace(/\s+family$/i, "").trim();
  if (!cleaned) return null;
  if (cleaned in FAMILY_ALIASES) return FAMILY_ALIASES[cleaned];
  const firstWord = cleaned.split(/[\s,;/]/)[0];
  if (firstWord && firstWord in FAMILY_ALIASES) return FAMILY_ALIASES[firstWord];
  return null;
}

export function getRotationRule(
  family: string | null | undefined,
): RotationFamilyRule | null {
  const key = normaliseFamilyKey(family);
  return key ? ROTATION_FAMILY_RULES[key] : null;
}
