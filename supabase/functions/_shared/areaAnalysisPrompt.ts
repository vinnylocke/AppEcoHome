/**
 * AI Area Coach — pure prompt + schema helpers for `area-sensor-analysis`.
 *
 * Kept pure (no Deno/DB) so the prompt shape, persona branching and the
 * cache-staleness decision are unit-testable in isolation.
 */

export type Persona = "new" | "experienced" | null;

export interface SensorLatest {
  soil_moisture: number;
  soil_temp: number;
  soil_ec: number;
  ec_source: "calibrated_us_cm" | "raw_adc";
  recorded_at: string;
}

export interface AreaAnalysisInput {
  persona: Persona;
  area: {
    name: string;
    isOutside: boolean;
    growingMedium: string | null;
    mediumPh: number | null;
    climateZone: string | null;
  };
  home: { hardinessZone: number | string | null };
  /** Current per-sensor latest + the multi-sensor average. */
  summary: {
    avgMoisture: number | null;
    avgTemp: number | null;
    avgEc: number | null;
    ecSource: "calibrated_us_cm" | "raw_adc";
    sensorsWithData: number;
  };
  sensors: Array<{ name: string; provider: string; latest: SensorLatest | null }>;
  /** Aggregate stats over the history window (null when no history). */
  history: {
    windowDays: number;
    readings: number;
    moisture: { min: number; max: number; avg: number } | null;
    temp: { min: number; max: number; avg: number } | null;
    ec: { min: number; max: number; avg: number } | null;
  } | null;
  plants: Array<{
    name: string; health: string | null;
    soilPhMin: number | null; soilPhMax: number | null;
    // Stored authoritative care ranges (from the plant library). Null = unknown.
    moistureMin?: number | null; moistureMax?: number | null;
    ecMin?: number | null; ecMax?: number | null;
    tempMin?: number | null; tempMax?: number | null;
  }>;
  automations: Array<{
    name: string;
    isActive: boolean;
    /** "time_scheduled" | "sensor_threshold" | "weather" | ... */
    triggerKind: string | null;
    moistureThresholdPct: number | null;
    valveDurationSeconds: number | null;
    /** How many recurring care tasks (blueprints) this automation drives. */
    linkedTaskCount: number;
    /** "off" | "skip" | "defer" — how the automation reacts to rain (legacy). */
    weatherMode: string | null;
    /** Plain-English summary of the condition tree (unified automations). */
    conditionSummary?: string | null;
  }>;
}

/**
 * Should the cached insight be regenerated?
 *  - `force` always regenerates (user tapped Re-analyse).
 *  - No readings at all → keep whatever we have (nothing new to say).
 *  - Cache had no readings but we now have some → regenerate.
 *  - Otherwise regenerate only when the latest reading is newer than the
 *    reading the cached insight was based on.
 * Pure — unit-tested.
 */
export function shouldRegenerate(
  cachedBasedOnReadingAt: string | null,
  latestReadingAt: string | null,
  force = false,
): boolean {
  if (force) return true;
  if (latestReadingAt === null) return false;
  if (cachedBasedOnReadingAt === null) return true;
  return new Date(latestReadingAt).getTime() > new Date(cachedBasedOnReadingAt).getTime();
}

/** Gemini JSON-mode response schema. */
export const AREA_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    metrics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string", enum: ["moisture", "ec", "temperature"] },
          current: { type: "number" },
          unit: { type: "string" },
          ideal_min: { type: "number" },
          ideal_max: { type: "number" },
          status: { type: "string", enum: ["good", "low", "high", "unknown"] },
          meaning: { type: "string" },
          why_for_these_plants: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["metric", "unit", "ideal_min", "ideal_max", "status", "meaning", "why_for_these_plants", "recommendation"],
      },
    },
    automation_review: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["ok", "notes"],
    },
    automation_suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          suggested_moisture_threshold_pct: { type: "number" },
        },
        required: ["title", "description"],
      },
    },
    confidence_note: { type: "string" },
  },
  required: ["headline", "summary", "metrics"],
} as const;

export const AREA_ANALYSIS_SYSTEM_PROMPT =
  "You are Rhozly's AI Area Coach — an expert horticulturist analysing live soil-sensor data for one " +
  "garden area and coaching the gardener on whether conditions suit the plants growing there. " +
  "Reason from the sensor readings, the plants and their needs, and any automations. Return ONLY the " +
  "JSON object matching the schema — no markdown, no preamble.";

function personaInstruction(persona: Persona): string {
  if (persona === "new") {
    return [
      "AUDIENCE: a beginner ('rookie') gardener.",
      "- Explain every metric in plain language; avoid jargon or define it in one clause.",
      "- Use simple whole-number target ranges.",
      "- Reassure rather than alarm; frame problems as easy fixes.",
      "- Each `recommendation` must start with a clear one-line 'what to do right now'.",
    ].join("\n");
  }
  if (persona === "experienced") {
    return [
      "AUDIENCE: an experienced grower.",
      "- Be concise and technical: VWC %, µS/cm, agronomic ranges with tolerances.",
      "- Use the history stats to note EC drift / salinity trends and temperature-moisture interplay.",
      "- For automations, give exact threshold values to set.",
      "- Flag possible sensor drift or anomalies (e.g. a flat-lining or wildly diverging sensor).",
    ].join("\n");
  }
  return [
    "AUDIENCE: a general gardener — balance plain explanation with useful specifics.",
    "- Explain each metric briefly and give concrete target ranges and actions.",
  ].join("\n");
}

function ecLabel(src: "calibrated_us_cm" | "raw_adc"): string {
  return src === "calibrated_us_cm" ? "µS/cm" : "raw ADC (uncalibrated — relative only)";
}

/** Build the user prompt. Pure. */
export function buildAreaAnalysisPrompt(input: AreaAnalysisInput): string {
  const { area, home, summary, sensors, history, plants, automations } = input;

  const currentLines = summary.sensorsWithData > 0
    ? [
        `  Moisture (avg): ${summary.avgMoisture?.toFixed(1) ?? "—"}%`,
        `  Soil temp (avg): ${summary.avgTemp?.toFixed(1) ?? "—"}°C`,
        `  EC (avg): ${summary.avgEc?.toFixed(0) ?? "—"} ${ecLabel(summary.ecSource)}`,
      ].join("\n")
    : "  (no current readings yet)";

  const sensorLines = sensors.length > 0
    ? sensors.map((s) => `  - ${s.name} (${s.provider}): ${
        s.latest
          ? `${s.latest.soil_moisture.toFixed(1)}% / ${s.latest.soil_temp.toFixed(1)}°C / ${s.latest.soil_ec.toFixed(0)} ${ecLabel(s.latest.ec_source)} @ ${s.latest.recorded_at}`
          : "awaiting first reading"
      }`).join("\n")
    : "  (no sensors linked)";

  const historyLines = history
    ? [
        `  Window: last ${history.windowDays} days, ${history.readings} readings`,
        history.moisture ? `  Moisture: min ${history.moisture.min.toFixed(1)}%, max ${history.moisture.max.toFixed(1)}%, avg ${history.moisture.avg.toFixed(1)}%` : "  Moisture: (no data)",
        history.temp ? `  Soil temp: min ${history.temp.min.toFixed(1)}°C, max ${history.temp.max.toFixed(1)}°C, avg ${history.temp.avg.toFixed(1)}°C` : "  Soil temp: (no data)",
        history.ec ? `  EC: min ${history.ec.min.toFixed(0)}, max ${history.ec.max.toFixed(0)}, avg ${history.ec.avg.toFixed(0)}` : "  EC: (no data)",
      ].join("\n")
    : "  (no history available)";

  const range = (lo: number | null | undefined, hi: number | null | undefined, unit: string) =>
    (lo != null && hi != null) ? `${lo}-${hi}${unit}` : null;
  const plantLines = plants.length > 0
    ? plants.map((p) => {
        const stored = [
          range(p.soilPhMin, p.soilPhMax, " pH") && `pH ${p.soilPhMin}-${p.soilPhMax}`,
          range(p.moistureMin, p.moistureMax, "%") && `moisture ${p.moistureMin}-${p.moistureMax}%`,
          range(p.ecMin, p.ecMax, "") && `EC ${p.ecMin}-${p.ecMax}µS/cm`,
          range(p.tempMin, p.tempMax, "°C") && `soil temp ${p.tempMin}-${p.tempMax}°C`,
        ].filter(Boolean);
        const careStr = stored.length ? ` [ideal: ${stored.join(", ")}]` : "";
        return `  - ${p.name}${p.health ? ` (health: ${p.health})` : ""}${careStr}`;
      }).join("\n")
    : "  (no plants recorded in this area)";

  // Stored ranges are authoritative — the model must use them, not invent.
  const hasStored = plants.some((p) => p.moistureMin != null || p.ecMin != null || p.tempMin != null);

  const automationLines = automations.length > 0
    ? automations.map((a) => {
        // Prefer the unified condition-tree summary when present.
        if (a.conditionSummary) {
          const t = a.linkedTaskCount > 0 ? ` · drives ${a.linkedTaskCount} care task${a.linkedTaskCount === 1 ? "" : "s"}` : "";
          return `  - ${a.name}${a.isActive ? "" : " (inactive)"}: runs when ${a.conditionSummary}${t}`;
        }
        const dur = a.valveDurationSeconds
          ? ` for ${a.valveDurationSeconds >= 60 ? `${Math.round(a.valveDurationSeconds / 60)} min` : `${a.valveDurationSeconds} s`}`
          : "";
        const trig = a.moistureThresholdPct != null
          ? `waters when soil moisture < ${a.moistureThresholdPct}%`
          : a.triggerKind === "time_scheduled"
          ? "waters on a fixed schedule"
          : a.triggerKind
          ? `trigger: ${a.triggerKind}`
          : "waters the area";
        const tasks = a.linkedTaskCount > 0 ? ` · drives ${a.linkedTaskCount} care task${a.linkedTaskCount === 1 ? "" : "s"}` : "";
        const weather = a.weatherMode === "defer"
          ? " · rain: smart (waits for forecast rain, rechecks)"
          : a.weatherMode === "skip"
          ? " · rain: skips the run if rain forecast"
          : " · rain: ignores forecast";
        return `  - ${a.name}${a.isActive ? "" : " (inactive)"}: ${trig}${dur}${weather}${tasks}`;
      }).join("\n")
    : "  (none configured)";

  return `${personaInstruction(input.persona)}

== AREA ==
  Name: ${area.name}
  Setting: ${area.isOutside ? "outdoor" : "indoor"}
  Growing medium: ${area.growingMedium ?? "unknown"}
  Soil pH (area): ${area.mediumPh ?? "unknown"}
  Climate zone: ${area.climateZone ?? "unknown"} · Hardiness zone: ${home.hardinessZone ?? "unknown"}

== CURRENT READINGS (averaged across ${summary.sensorsWithData} sensor${summary.sensorsWithData === 1 ? "" : "s"}) ==
${currentLines}

== LINKED SENSORS ==
${sensorLines}

== HISTORY STATS ==
${historyLines}

== PLANTS IN THIS AREA ==
${plantLines}

== EXISTING AUTOMATIONS (watering) ==
${automationLines}

== YOUR TASK ==
For THIS area and THESE plants:
1. For each of moisture, EC, and soil temperature, give the ideal range (ideal_min/ideal_max with a unit),
   the current value if known, a status (good/low/high; "unknown" if no reading), a plain "meaning" of the
   metric, "why_for_these_plants" (relate it to the specific plants above), and a "recommendation".
   - ${hasStored
     ? "IMPORTANT: where a plant lists an [ideal: …] range above, those are AUTHORITATIVE stored values — set ideal_min/ideal_max to match them (for multiple plants, use the overlap / tightest sensible combined range). Only estimate a range yourself for a metric that has no stored value."
     : "No stored ideal ranges are provided, so estimate sensible agronomic ranges for these plants."}
   - If EC is raw ADC (uncalibrated), say ranges are relative and recommend a calibrated sensor for absolutes.
2. automation_review: if automations exist, judge whether they suit these plants and the current
   readings — e.g. is the schedule frequent enough, or the moisture threshold appropriate, given the
   moisture trend? Also comment on the rain handling: prefer "smart" (defer-and-recheck) over "skip"
   (which can leave soil dry if forecast rain under-delivers) or "ignores forecast" (wastes water when
   it does rain). (set ok + notes). If NONE exist, set automation_review.ok=false with a short note and
   populate automation_suggestions with 1-3 concrete moisture-triggered watering automations to add
   (title, description, suggested_moisture_threshold_pct).
3. confidence_note: one line on how much data this is based on (e.g. "based on N readings over X days").
Be specific to the plants and the numbers above. Do not invent sensor values not provided.`;
}

export interface AreaInsight {
  headline: string;
  summary: string;
  metrics: Array<Record<string, unknown>>;
  automation_review?: { ok: boolean; notes: string } | null;
  automation_suggestions?: Array<Record<string, unknown>>;
  confidence_note?: string;
}

/** Tolerant parse of the Gemini JSON. Returns null on unrecoverable output. */
export function parseAreaInsight(text: string): AreaInsight | null {
  let raw = text.trim();
  // Strip a ```json fence if the model added one despite JSON mode.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.headline !== "string" || !Array.isArray(obj.metrics)) return null;
    return obj as AreaInsight;
  } catch {
    return null;
  }
}
