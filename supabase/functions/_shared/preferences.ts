import { callGeminiCascade } from "./gemini.ts";

/**
 * Canonical entity_type vocabulary shared by all functions that read/write
 * planner_preferences.  Keeping this in one place prevents drift between
 * the chat AI, the landscape planner, and any future preference producer.
 */
export const ENTITY_TYPES = [
  "plant",
  "aesthetic",
  "feature",
  "maintenance",
  "difficulty",
  "wildlife",
  "colour",
  "pest_management",
  "soil",
  "climate",
  "water_usage",
] as const;

export type EntityType = typeof ENTITY_TYPES[number];

export interface Preference {
  entity_type: string;
  entity_name: string;
  sentiment: "positive" | "negative" | string;
  reason: string | null;
  recorded_at?: string;
}

export interface PreferenceRow {
  home_id: string;
  user_id?: string | null;
  entity_type: string;
  entity_name: string;
  sentiment: string;
  reason?: string | null;
}

/**
 * Load preferences for a home or user, deduped so the most recent entry per
 * entity_type:entity_name key wins (query is ordered DESC by recorded_at).
 */
export async function loadPreferences(
  supabase: any,
  opts: { homeId?: string; userId?: string },
): Promise<Preference[]> {
  // Guard: if neither identity is provided there is no safe WHERE clause.
  // Return empty rather than accidentally querying the entire table.
  if (!opts.userId && !opts.homeId) return [];

  let query = supabase
    .from("planner_preferences")
    .select("entity_type, entity_name, sentiment, reason, recorded_at")
    .order("recorded_at", { ascending: false });

  if (opts.userId) {
    query = query.eq("user_id", opts.userId);
  } else {
    query = query.eq("home_id", opts.homeId);
  }

  const { data } = await query;
  const raw: Preference[] = data || [];

  const seen = new Set<string>();
  return raw.filter((p) => {
    const key = `${p.entity_type}:${p.entity_name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format preferences for injection into an AI prompt.
 *
 * "rich"   — sectioned LIKES / DISLIKES block with timestamps; for planning prompts
 * "simple" — flat bulleted list; for chat prompts
 */
export function formatPreferencesBlock(
  prefs: Preference[],
  style: "rich" | "simple" = "simple",
): string {
  if (prefs.length === 0) return "None recorded yet.";

  const positives = prefs.filter((p) => p.sentiment === "positive");
  const negatives = prefs.filter((p) => p.sentiment === "negative");

  if (style === "rich") {
    const fmt = (p: Preference) => {
      const date = p.recorded_at
        ? ` (recorded ${new Date(p.recorded_at).toLocaleDateString("en-GB")})`
        : "";
      return `• [${p.entity_type}] ${p.entity_name}${p.reason ? ` — "${p.reason}"` : ""}${date}`;
    };
    return [
      "USER PERSONAL MEMORY (Date-stamped — newer entries override older ones):",
      "LIKES / WANTS:",
      positives.length > 0 ? positives.map(fmt).join("\n") : "  None recorded.",
      "",
      "DISLIKES / AVOID:",
      negatives.length > 0 ? negatives.map(fmt).join("\n") : "  None recorded.",
      "",
      "Apply this as soft guidance. If the current request explicitly includes or excludes anything, that always takes priority over memory.",
    ].join("\n");
  }

  return prefs
    .map(
      (p) =>
        `- ${p.sentiment === "positive" ? "LIKES" : "DISLIKES"} [${p.entity_type}]: "${p.entity_name}"${p.reason ? ` — ${p.reason}` : ""}`,
    )
    .join("\n");
}

/**
 * Filter detected preferences down to only those not already recorded,
 * so we never write duplicates.
 */
export function filterNewPreferences(
  detected: Preference[],
  existing: Preference[],
): Preference[] {
  return detected.filter(
    (d) =>
      !existing.some(
        (e) =>
          e.entity_type === d.entity_type &&
          e.entity_name.toLowerCase() === d.entity_name.toLowerCase() &&
          e.sentiment === d.sentiment,
      ),
  );
}

const PREF_EXTRACTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      entity_type: { type: "STRING" },
      entity_name: { type: "STRING" },
      sentiment: { type: "STRING" },
      reason: { type: "STRING", nullable: true },
    },
    required: ["entity_type", "entity_name", "sentiment"],
  },
};

/**
 * Mine free-text feedback (e.g. a plan rejection reason, or an initial brief)
 * for structured preferences so future AI plans reflect the user's evolving
 * taste. Returns [] on any failure so the calling flow is never interrupted.
 * `fnName` is just for AI-usage attribution.
 */
export async function extractPreferencesFromFeedback(
  apiKey: string,
  feedbackText: string,
  fnName: string,
): Promise<Array<{ entity_type: string; entity_name: string; sentiment: string; reason: string | null }>> {
  try {
    const { text } = await callGeminiCascade(
      apiKey,
      fnName,
      [{
        role: "user",
        parts: [{
          text: `You are a preference extraction engine for a gardening app. Extract structured preferences from this user feedback about their garden plan.\n\nFeedback: "${feedbackText}"\n\nRules:\n- entity_type must be one of: ${ENTITY_TYPES.map((t) => `"${t}"`).join(", ")}\n- entity_name: normalise to title case (e.g. "Rose", "Tropical", "Water Feature", "Low Maintenance")\n- sentiment: "positive" if the user likes or wants it, "negative" if they dislike or don't want it\n- reason: the user's stated reason in their own words, concise, or null if not given\n- Mapping hints: style/look -> aesthetic; water feature/budget/raised bed -> feature; preferred colours -> colour; organic/chemical-free -> pest_management; drought/frost -> climate; sandy/clay -> soil; watering habits -> water_usage\n- Return an empty array [] if no extractable preferences exist`,
        }],
      }],
      { temperature: 0, maxOutputTokens: 400, responseSchema: PREF_EXTRACTION_SCHEMA, logContext: { step: "pref_extraction", fn: fnName } },
    );
    return JSON.parse(text) || [];
  } catch {
    return [];
  }
}

/**
 * Persist preference rows. Returns the count actually saved.
 * Silently ignores duplicate-key errors (23505).
 */
export async function savePreferences(
  supabase: any,
  rows: PreferenceRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("planner_preferences").insert(rows);
  if (error && error.code !== "23505") throw error;
  return rows.length;
}
