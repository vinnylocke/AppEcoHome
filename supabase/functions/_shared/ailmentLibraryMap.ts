// Maps an AI-generated ailment (the watchlist-payload shape the client already
// holds from `generate-ailment-suggestions`) into an `ailment_library` row, so
// the Watchlist "Search with Rhozly AI" tier can persist its result to the
// shared library for every future user. Pure + tested.

export interface AiAilmentInput {
  name?: string | null;
  scientific_name?: string | null;
  type?: string | null; // "pest" | "disease" | "invasive_plant" | "invasive" | "disorder"
  description?: string | null;
  symptoms?: Array<{ title?: string | null; description?: string | null } | string> | null;
  affected_plants?: string[] | null;
  prevention_steps?: Array<{ title?: string | null; description?: string | null }> | null;
  remedy_steps?: Array<{ title?: string | null; description?: string | null }> | null;
  thumbnail_url?: string | null;
}

export type AilmentKind = "pest" | "disease" | "invasive" | "disorder";

export interface AilmentLibraryRow {
  name: string;
  kind: AilmentKind;
  scientific_name: string | null;
  aliases: string[];
  description: string | null;
  symptoms: string[];
  causes: string | null;
  treatment: string | null;
  prevention: string | null;
  severity: null;
  affected_plant_types: string[];
  affected_families: string[];
  season: string[];
  organic_friendly: null;
  image_url: string | null;
  thumbnail_url: string | null;
  source: "ai";
}

export function typeToKind(t?: string | null): AilmentKind {
  switch ((t ?? "").toLowerCase()) {
    case "pest": return "pest";
    case "invasive_plant":
    case "invasive": return "invasive";
    case "disorder": return "disorder";
    default: return "disease";
  }
}

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

function stepText(steps: AiAilmentInput["prevention_steps"]): string | null {
  const parts = (steps ?? [])
    .map((s) => (typeof s === "string" ? s : (s?.description || s?.title || "")))
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

function symptomStrings(syms: AiAilmentInput["symptoms"]): string[] {
  return (syms ?? [])
    .map((s) => (typeof s === "string" ? s : (s?.title || s?.description || "")))
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
}

/** The generated `ailment_library.name_key`: lower, collapse whitespace, trim. */
export function ailmentNameKey(name: string): string {
  return (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** AI suggestion → `ailment_library` insert row (excludes generated columns). */
export function aiResultToLibraryRow(a: AiAilmentInput): AilmentLibraryRow {
  const thumb = clean(a.thumbnail_url);
  return {
    name: (a.name ?? "").trim(),
    kind: typeToKind(a.type),
    scientific_name: clean(a.scientific_name),
    aliases: [],
    description: clean(a.description),
    symptoms: symptomStrings(a.symptoms),
    causes: null,
    treatment: stepText(a.remedy_steps),
    prevention: stepText(a.prevention_steps),
    severity: null,
    affected_plant_types: (a.affected_plants ?? []).map((p) => (p ?? "").trim()).filter(Boolean),
    affected_families: [],
    season: [],
    organic_friendly: null,
    image_url: thumb,
    thumbnail_url: thumb,
    source: "ai",
  };
}
