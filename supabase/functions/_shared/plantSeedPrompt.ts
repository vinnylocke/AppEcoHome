// Shared prompt + schema for plant_library enrichment, used by:
//   - seed-plant-library/index.ts (synchronous, self-chunking)
//   - submit-plant-library-batch/index.ts (Gemini Batch API)
//   - poll-plant-library-batches/index.ts (parses the same response shape)
//
// Kept here so the prompt + schema can't drift between the two
// paths — when we tweak the prompt to ask for better data, both
// flows benefit.

/** Plants per Gemini call. The batch flow packs this many per
 *  batch-line; the sync flow uses it as the per-call batch size
 *  inside a chunk. */
export const SEED_PROMPT_BATCH_SIZE = 10;

/** Output schema Gemini returns verbatim. */
export const SEED_BATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    plants: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          common_name:         { type: "STRING" },
          scientific_name:     { type: "ARRAY", items: { type: "STRING" } },
          family:              { type: "STRING" },
          plant_type:          { type: "STRING" },
          cycle:               { type: "STRING" },
          care_level:          { type: "STRING" },
          watering:            { type: "STRING" },
          watering_min_days:   { type: "NUMBER" },
          watering_max_days:   { type: "NUMBER" },
          sunlight:            { type: "ARRAY", items: { type: "STRING" } },
          hardiness_min:       { type: "STRING" },
          hardiness_max:       { type: "STRING" },
          growth_rate:         { type: "STRING" },
          growth_habit:        { type: "STRING" },
          maintenance:         { type: "STRING" },
          is_edible:           { type: "BOOLEAN" },
          is_toxic_pets:       { type: "BOOLEAN" },
          is_toxic_humans:     { type: "BOOLEAN" },
          attracts:            { type: "ARRAY", items: { type: "STRING" } },
          description:         { type: "STRING" },
          drought_tolerant:    { type: "BOOLEAN" },
          salt_tolerant:       { type: "BOOLEAN" },
          flowers:             { type: "BOOLEAN" },
          fruits:              { type: "BOOLEAN" },
          indoor:              { type: "BOOLEAN" },
          invasive:            { type: "BOOLEAN" },
          flowering_season:    { type: "ARRAY", items: { type: "STRING" } },
          harvest_season:      { type: "ARRAY", items: { type: "STRING" } },
          propagation:         { type: "ARRAY", items: { type: "STRING" } },
          pest_susceptibility: { type: "ARRAY", items: { type: "STRING" } },
          soil:                { type: "ARRAY", items: { type: "STRING" } },
          soil_ph_min:         { type: "NUMBER" },
          soil_ph_max:         { type: "NUMBER" },
          soil_moisture_min:   { type: "NUMBER" },
          soil_moisture_max:   { type: "NUMBER" },
          soil_ec_min:         { type: "NUMBER" },
          soil_ec_max:         { type: "NUMBER" },
          soil_temp_min:       { type: "NUMBER" },
          soil_temp_max:       { type: "NUMBER" },
          days_to_harvest_min: { type: "NUMBER" },
          days_to_harvest_max: { type: "NUMBER" },
        },
        required: ["common_name", "scientific_name"],
      },
    },
  },
  required: ["plants"],
};

/** A single plant row in the AI response. All fields nullable
 *  because the schema only requires the two identity fields; the
 *  rest are best-effort. */
export interface SeedRow {
  common_name?: string | null;
  scientific_name?: string[] | null;
  family?: string | null;
  plant_type?: string | null;
  cycle?: string | null;
  care_level?: string | null;
  watering?: string | null;
  watering_min_days?: number | null;
  watering_max_days?: number | null;
  sunlight?: string[] | null;
  hardiness_min?: string | null;
  hardiness_max?: string | null;
  growth_rate?: string | null;
  growth_habit?: string | null;
  maintenance?: string | null;
  is_edible?: boolean | null;
  is_toxic_pets?: boolean | null;
  is_toxic_humans?: boolean | null;
  attracts?: string[] | null;
  description?: string | null;
  drought_tolerant?: boolean | null;
  salt_tolerant?: boolean | null;
  flowers?: boolean | null;
  fruits?: boolean | null;
  indoor?: boolean | null;
  invasive?: boolean | null;
  flowering_season?: string[] | null;
  harvest_season?: string[] | null;
  propagation?: string[] | null;
  pest_susceptibility?: string[] | null;
  soil?: string[] | null;
  soil_ph_min?: number | null;
  soil_ph_max?: number | null;
  soil_moisture_min?: number | null;
  soil_moisture_max?: number | null;
  soil_ec_min?: number | null;
  soil_ec_max?: number | null;
  soil_temp_min?: number | null;
  soil_temp_max?: number | null;
  days_to_harvest_min?: number | null;
  days_to_harvest_max?: number | null;
}

/** Enrichment prompt for a specific list of plant names. The AI
 *  fills in care data for each — it never proposes plants.
 *
 *  Names may be plain ("Tomato") OR decorated with a pre-resolved
 *  scientific name in brackets ("Wonderberry [Solanum nigrum]").
 *  When the bracket form is used, the AI MUST use the bracketed
 *  binomial verbatim — our database is keyed on it and any
 *  substitution silently collides with existing rows. */
export function buildEnrichmentPrompt(plantNames: string[]): string {
  return `You are enriching entries in a global plant knowledge base.

Below is a list of ${plantNames.length} specific plants — pulled from multiple botanical sources. Return care data for EACH plant, ONE entry per name, in the order given.

═══════════════════════════════════════════════════════════════
PLANT NAME FORMAT (CRITICAL):
═══════════════════════════════════════════════════════════════

Names may appear in TWO forms:

1. "Common Name [Scientific name]" — bracketed scientific name supplied.
   - USE the bracketed scientific name VERBATIM as scientific_name[0].
   - The common name (before the bracket) is what the user knows the
     plant as; use it as common_name. Strip the brackets — they MUST
     NOT appear in your response.
   - DO NOT substitute a different scientific name. Our database is
     keyed on the bracketed name; any change causes a silent
     duplicate-row collision and the entire row is dropped.

2. "Common Name" (no brackets) — no scientific name supplied.
   - Determine scientific_name[0] yourself, applying the disambiguation
     rules below.

═══════════════════════════════════════════════════════════════

PLANTS TO ENRICH:
${plantNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

General rules:
- DO NOT add plants that weren't on the list. DO NOT skip a plant just because you're unsure — fill in with the most likely values for the species you can identify.
- If a supplied name is genuinely NOT a plant (source contamination — e.g. a person, an album, a place), OMIT it from the response entirely. Better to skip than fabricate.
- If a supplied name is ambiguous (e.g. "Pepper", "Sage", "Mint") AND no scientific name is bracketed, pick the most common garden interpretation and proceed.
- For cultivars (names with quotes like "Tomato 'Sungold'") provide care that reflects the cultivar's known traits (size, flavour, days-to-harvest) where you know them; otherwise inherit from the parent species. Don't invent differences you're not confident about.
- If a name is a bare scientific binomial (e.g. "Lavandula angustifolia") without a bracketed scientific name, treat it as the scientific name and provide the standard English common name in common_name (e.g. "English Lavender").

CRITICAL — scientific_name disambiguation (only when no bracketed name supplied):
When a common name represents a distinct horticultural TYPE that shares a base species name with another type (cherry tomato vs garden tomato, sweet pepper vs hot pepper, etc), include a botanical variety / form qualifier in \`scientific_name[0]\` so each type has a unique scientific name:
- "Tomato" → "Solanum lycopersicum"
- "Cherry Tomato" → "Solanum lycopersicum var. cerasiforme"
- "Sweet Pepper" → "Capsicum annuum var. grossum"
- "Hot Pepper" → "Capsicum annuum var. annuum"
The qualifier doesn't have to be a formally-published botanical name — \`var. <descriptor>\` is acceptable to disambiguate.

POPULATE EVERY APPLICABLE FIELD. The database does NOT inherit values between rows — every row must stand alone. Empty arrays / null values are only acceptable when the field is genuinely irrelevant:

- Skip \`harvest_season\` / \`days_to_harvest_*\` / \`fruits\` ONLY for ornamentals with no edible parts.
- Skip \`flowering_season\` / \`flowers\` / \`attracts\` ONLY for non-flowering plants (ferns, most succulents, conifers).

All other fields MUST be populated. EVERY row needs:
- cycle, plant_type, family, care_level
- watering (frequent/average/minimum), watering_min_days, watering_max_days
- sunlight (at least one of: full sun, part sun, part shade, full shade)
- hardiness_min, hardiness_max (USDA zone numbers as strings)
- growth_rate, growth_habit, maintenance
- soil (at least one), soil_ph_min, soil_ph_max
- soil_moisture_min, soil_moisture_max (ideal volumetric soil moisture for healthy growth, as whole-number percentages 0–100, e.g. 30–60 for most veg)
- soil_ec_min, soil_ec_max (ideal nutrient/salinity range in µS/cm, e.g. 800–1800 for fruiting veg; use realistic agronomic values)
- soil_temp_min, soil_temp_max (ideal root-zone soil temperature range in °C)
- propagation (every plant has propagation methods — seed at minimum)
- description (2-3 sentences in your own words)
- is_edible, is_toxic_pets, is_toxic_humans (decisive booleans)
- drought_tolerant, salt_tolerant, indoor, invasive (decisive booleans)

For varieties/cultivars: REPEAT the parent species' values explicitly. A "Tomato 'Sungold'" row needs its own watering / sunlight / propagation values even if they match the base Tomato row. Don't say "inherits from parent" — copy the values.

CRITICAL — array fields must have SEPARATE ELEMENTS:
Every field typed as an array (\`scientific_name\`, \`sunlight\`, \`flowering_season\`, \`harvest_season\`, \`pruning_month\`, \`propagation\`, \`pest_susceptibility\`, \`soil\`, \`attracts\`) MUST contain one value per element. NEVER comma-join multiple values into a single string element.
- ✅ Correct:   "harvest_season": ["autumn", "summer"]
- ❌ Forbidden: "harvest_season": ["autumn,summer"]
- ✅ Correct:   "sunlight": ["full sun", "part shade"]
- ❌ Forbidden: "sunlight": ["full sun, part shade"]
This breaks downstream consumers that filter on individual values.

PREFERRED VALUES for constrained fields. Use ONE of these where applicable:
- plant_type: Shrub, Tree, Flower, Vegetable, Houseplant, Herb, Succulent, Climber, Grass, Fern, Cactus, Bulb, Vine, Groundcover, Aquatic
- cycle: Perennial, Annual, Biennial, Herbaceous Perennial
- watering: frequent, average, minimum
- care_level: low, medium, high
- growth_rate: slow, moderate, fast
- maintenance: low, moderate, high

Write the \`description\` in your own words — a 2-3 sentence horticultural summary. Do not copy from Wikipedia or any other source.

Be especially careful with safety fields: \`is_toxic_pets\` and \`is_toxic_humans\` should ONLY be true when you are confident the plant is toxic. False positives on toxicity damage the user's trust.

Return JSON matching the schema. No prose, no markdown, just the JSON.`;
}

/**
 * Defensive split for string-array fields where the AI has occasionally
 * returned a single-element array containing a comma-joined string
 * (e.g. `["autumn,summer"]`) instead of separate elements. Splits any
 * such elements on commas, trims, drops empties. Idempotent — running
 * on already-correct data is a no-op.
 *
 * Applied to every string-array column in the insert path so the DB
 * always has clean, individually-filterable values.
 */
export function splitJoinedStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    if (entry.includes(",")) {
      for (const piece of entry.split(",")) {
        const trimmed = piece.trim();
        if (trimmed) out.push(trimmed);
      }
    } else {
      const trimmed = entry.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

/**
 * Walks a possibly-truncated JSON response and pulls out the
 * complete plant objects from the leading `plants` array. Returns
 * null if even partial salvage fails. Useful when Gemini hits its
 * output cap mid-batch — the plants BEFORE the cut are still
 * perfectly valid and worth keeping.
 */
export function salvageTruncatedPlants(text: string): { plants: SeedRow[] } | null {
  const arrayStartIdx = text.indexOf('"plants"');
  if (arrayStartIdx === -1) return null;
  const openBracketIdx = text.indexOf("[", arrayStartIdx);
  if (openBracketIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteObjectEnd = -1;

  for (let i = openBracketIdx + 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) lastCompleteObjectEnd = i;
    }
  }

  if (lastCompleteObjectEnd === -1) return null;
  const salvaged = text.slice(0, lastCompleteObjectEnd + 1) + "]}";
  try {
    return JSON.parse(salvaged) as { plants: SeedRow[] };
  } catch {
    return null;
  }
}

/**
 * Turn an AI-returned SeedRow into the column shape `plant_library`
 * expects. Trims strings, coerces booleans, defaults missing arrays.
 * Caller supplies the run/batch attribution.
 */
/**
 * Coerce any AI-returned numeric into a real integer suitable for
 * a Postgres `integer` column. AI sometimes returns fractional
 * values from internal float math (`365.00000000000006`) or stringy
 * numbers ("90"). Without this, the insert fails with
 * "invalid input syntax for type integer".
 */
function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

export function seedRowToColumnShape(
  p: SeedRow,
  attribution: { seeded_by_run_id: string | null },
): Record<string, unknown> | null {
  if (!p.common_name?.trim()) return null;
  // Defensive: if AI carried the [Scientific name] bracket form into
  // common_name despite the prompt instruction, strip it. Keeps the
  // common name clean even when the model mis-parses.
  const commonName = p.common_name.trim().replace(/\s*\[[^\]]*\]\s*$/g, "").trim();
  if (!commonName) return null;
  return {
    common_name:         commonName,
    // All string-array fields use splitJoinedStringArray to defend
    // against AI returning comma-joined single-element arrays like
    // ["autumn,summer"] instead of ["autumn", "summer"].
    scientific_name:     splitJoinedStringArray(p.scientific_name),
    family:              p.family ?? null,
    plant_type:          p.plant_type ?? null,
    cycle:               p.cycle ?? null,
    care_level:          p.care_level ?? null,
    watering:            p.watering ?? null,
    watering_min_days:   toInt(p.watering_min_days),
    watering_max_days:   toInt(p.watering_max_days),
    sunlight:            splitJoinedStringArray(p.sunlight),
    hardiness_min:       p.hardiness_min ?? null,
    hardiness_max:       p.hardiness_max ?? null,
    growth_rate:         p.growth_rate ?? null,
    growth_habit:        p.growth_habit ?? null,
    maintenance:         p.maintenance ?? null,
    is_edible:           !!p.is_edible,
    is_toxic_pets:       !!p.is_toxic_pets,
    is_toxic_humans:     !!p.is_toxic_humans,
    attracts:            splitJoinedStringArray(p.attracts),
    description:         p.description ?? null,
    drought_tolerant:    !!p.drought_tolerant,
    salt_tolerant:       !!p.salt_tolerant,
    flowers:             !!p.flowers,
    fruits:              !!p.fruits,
    indoor:              !!p.indoor,
    invasive:            !!p.invasive,
    flowering_season:    splitJoinedStringArray(p.flowering_season),
    harvest_season:      splitJoinedStringArray(p.harvest_season),
    propagation:         splitJoinedStringArray(p.propagation),
    pest_susceptibility: splitJoinedStringArray(p.pest_susceptibility),
    soil:                splitJoinedStringArray(p.soil),
    soil_ph_min:         p.soil_ph_min ?? null,
    soil_ph_max:         p.soil_ph_max ?? null,
    soil_moisture_min:   p.soil_moisture_min ?? null,
    soil_moisture_max:   p.soil_moisture_max ?? null,
    soil_ec_min:         p.soil_ec_min ?? null,
    soil_ec_max:         p.soil_ec_max ?? null,
    soil_temp_min:       p.soil_temp_min ?? null,
    soil_temp_max:       p.soil_temp_max ?? null,
    days_to_harvest_min: toInt(p.days_to_harvest_min),
    days_to_harvest_max: toInt(p.days_to_harvest_max),
    thumbnail_url:       null,
    image_url:           null,
    seeded_by_run_id:    attribution.seeded_by_run_id,
    valid:               null as boolean | null,
  };
}
