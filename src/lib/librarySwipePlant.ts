// Pure mappers for the Discover deck (#10): a plant_library row (from the
// plant_library_swipe_sample RPC) and a Verdantly search result → the SwipePlant
// card shape. Tags + tagline are derived from the library's structured columns
// so internal-library cards read like the old AI/Perenual ones. No side effects.

export interface SwipePlant {
  id: string;
  name: string;
  scientific_name: string;
  tagline: string;
  tags: string[];
  image_query: string;
  source: "ai" | "perenual" | "library" | "verdantly";
  thumbnail?: string | null;
}

export interface LibraryRow {
  id: number | string;
  common_name: string;
  scientific_name?: unknown; // jsonb array
  image_url?: string | null;
  thumbnail_url?: string | null;
  cycle?: string | null;
  watering?: string | null;
  sunlight?: unknown; // jsonb array
  care_level?: string | null;
  maintenance?: string | null;
  description?: string | null;
  is_edible?: boolean | null;
  drought_tolerant?: boolean | null;
  attracts?: unknown; // jsonb array
}

function firstOfJsonbArray(v: unknown): string {
  if (Array.isArray(v)) {
    const f = v[0];
    return typeof f === "string" ? f : "";
  }
  return "";
}

function jsonbStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function libraryRowToSwipePlant(row: LibraryRow): SwipePlant {
  const sunlight = jsonbStringArray(row.sunlight);
  const attracts = jsonbStringArray(row.attracts);
  const watering = (row.watering ?? "").toLowerCase();
  const care = (row.care_level ?? row.maintenance ?? "").toLowerCase();

  const tags: string[] = [];
  if (row.drought_tolerant) tags.push("drought-tolerant");
  if (watering === "frequent") tags.push("water-hungry");
  if (sunlight.some((s) => /full sun/i.test(s))) tags.push("full-sun");
  if (sunlight.some((s) => /part(ial)? (shade|sun)/i.test(s))) tags.push("partial-shade");
  if (sunlight.some((s) => /full shade/i.test(s))) tags.push("full-shade");
  if (/^perennial$/i.test(row.cycle ?? "")) tags.push("perennial");
  if (/^annual$/i.test(row.cycle ?? "")) tags.push("annual");
  if (row.is_edible) tags.push("edible");
  if (care === "low" || care === "minimum") tags.push("low-maintenance");
  if (care === "high") tags.push("high-maintenance");
  if (attracts.some((a) => /bee|butterfl|pollinat/i.test(a))) tags.push("pollinator-friendly");

  // Tagline: prefer the library description's first sentence, else build from care.
  const desc = (row.description ?? "").trim();
  let tagline: string;
  if (desc) {
    const first = desc.split(/(?<=[.!?])\s/)[0] ?? desc;
    tagline = first.length > 140 ? first.slice(0, 137) + "…" : first;
  } else {
    const cyc = (row.cycle ?? "").toLowerCase();
    const wat = watering || "moderate";
    tagline = `A ${cyc ? cyc + " " : ""}plant that needs ${wat} watering.`.replace(/\s+/g, " ").trim();
  }

  return {
    id: `lib-${row.id}`,
    name: row.common_name,
    scientific_name: firstOfJsonbArray(row.scientific_name),
    tagline,
    tags: Array.from(new Set(tags)).slice(0, 6),
    image_query: row.common_name,
    source: "library",
    thumbnail: row.thumbnail_url ?? row.image_url ?? null,
  };
}

export interface VerdantlyResult {
  id?: string | number;
  common_name?: string;
  scientific_name?: unknown; // array (from mapToSearchResult) or string
  thumbnail_url?: string | null;
  image_url?: string | null;
}

export function verdantlyResultToSwipePlant(r: VerdantlyResult): SwipePlant {
  const name = r.common_name || "Unknown plant";
  const sci =
    typeof r.scientific_name === "string" ? r.scientific_name : firstOfJsonbArray(r.scientific_name);
  return {
    id: `verdantly-${r.id ?? name}`,
    name,
    scientific_name: sci,
    tagline: "From the Verdantly plant library.",
    tags: [],
    image_query: name,
    source: "verdantly",
    thumbnail: r.thumbnail_url ?? r.image_url ?? null,
  };
}
