// Ailment Library (browse) — read the global catalogue + map an entry into a
// home watchlist row. The catalogue is small, so we fetch all and filter
// client-side. The library→watchlist mapping is pure + unit-tested.

import { supabase } from "../lib/supabase";
import type { AilmentType, AilmentSymptom, AilmentStep } from "../components/AilmentWatchlist";
import { favouriteAilment, type AilmentFavouriteInput } from "./favouritesService";

export type AilmentKind = "pest" | "disease" | "invasive" | "disorder";
export type AilmentSeverity = "low" | "moderate" | "high" | "critical";

export interface LibraryAilment {
  id: number;
  name: string;
  kind: AilmentKind;
  scientific_name: string | null;
  aliases: string[];
  description: string | null;
  symptoms: string[];
  causes: string | null;
  treatment: string | null;
  prevention: string | null;
  severity: AilmentSeverity | null;
  affected_plant_types: string[];
  affected_families: string[];
  season: string[];
  organic_friendly: boolean | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

/** Pure: filter library rows by a search query (name / scientific / aliases). */
export function filterAilmentLibrary(rows: LibraryAilment[], query: string): LibraryAilment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return rows.filter((r) =>
    r.name.toLowerCase().includes(q) ||
    (r.scientific_name ?? "").toLowerCase().includes(q) ||
    (r.aliases ?? []).some((a) => (a ?? "").toLowerCase().includes(q)),
  );
}

/**
 * Persist an AI-generated ailment to the shared `ailment_library` (best-effort,
 * service-role write via the edge fn) so future users find it in the library
 * tier. Returns the library row (new or pre-existing) or null on failure.
 */
export async function persistAiAilmentToLibrary(aiData: Record<string, unknown>): Promise<LibraryAilment | null> {
  try {
    const { data, error } = await supabase.functions.invoke("add-ailment-to-library", { body: { ailment: aiData } });
    if (error) return null;
    return (data?.ailment ?? null) as LibraryAilment | null;
  } catch {
    return null;
  }
}

export async function fetchAilmentLibrary(): Promise<LibraryAilment[]> {
  const { data, error } = await supabase
    .from("ailment_library")
    .select("id, name, kind, scientific_name, aliases, description, symptoms, causes, treatment, prevention, severity, affected_plant_types, affected_families, season, organic_friendly, image_url, thumbnail_url")
    .order("name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as LibraryAilment[];
}

// ── library → watchlist mapping (pure) ───────────────────────────────────────

export function kindToWatchlistType(kind: AilmentKind): AilmentType {
  if (kind === "pest") return "pest";
  if (kind === "invasive") return "invasive_plant";
  return "disease"; // disease + disorder both surface as "disease" in the watchlist
}

export function severityToWatchlist(sev: AilmentSeverity | null): "mild" | "moderate" | "severe" {
  if (sev === "critical" || sev === "high") return "severe";
  if (sev === "low") return "mild";
  return "moderate";
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/**
 * Split a library `treatment` / `prevention` TEXT blob into discrete steps (#11).
 * The persisted shape is newline-joined (`ailmentLibraryMap.ts` `stepText()`), so
 * a pest like aphids stores ~6 control steps in ONE field — collapsing that to a
 * single step made the watchlist "N treatments" count read 0–1. Newlines split
 * first; a single-blob fallback splits on numbered / bulleted markers or
 * semicolons; leading list markers are stripped. Pure.
 */
export function splitStepsText(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.trim();
  if (!t) return [];
  let parts = t.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) {
    const byMarker = parts[0]
      .split(/\s*(?:\d+[.)]\s+|;\s+|•\s+|\s-\s+)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (byMarker.length > 1) parts = byMarker;
  }
  return parts
    .map((s) => s.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, "").trim())
    .filter(Boolean);
}

export interface WatchlistInsert {
  home_id: string;
  name: string;
  scientific_name: string | null;
  type: AilmentType;
  description: string;
  symptoms: AilmentSymptom[];
  affected_plants: string[];
  prevention_steps: AilmentStep[];
  remedy_steps: AilmentStep[];
  source: "library";
  perenual_id: null;
  thumbnail_url: string | null;
}

/** Map a catalogue entry into a home `ailments` insert payload. Pure. */
export function mapLibraryToWatchlistPayload(a: LibraryAilment, homeId: string): WatchlistInsert {
  const sev = severityToWatchlist(a.severity);
  const symptoms: AilmentSymptom[] = (a.symptoms ?? []).map((s) => ({
    id: uid(), title: s, description: "", severity: sev, location: "",
  }));
  const remedy_steps: AilmentStep[] = splitStepsText(a.treatment).map((description, i) => ({
    id: uid(), step_order: i, title: "Treatment", description, task_type: "other", frequency_type: "once",
  }));
  const prevention_steps: AilmentStep[] = splitStepsText(a.prevention).map((description, i) => ({
    id: uid(), step_order: i, title: "Prevention", description, task_type: "inspect", frequency_type: "once",
  }));
  return {
    home_id: homeId,
    name: a.name,
    scientific_name: a.scientific_name ?? null,
    type: kindToWatchlistType(a.kind),
    description: a.description ?? "",
    symptoms,
    affected_plants: a.affected_plant_types ?? [],
    prevention_steps,
    remedy_steps,
    source: "library",
    perenual_id: null,
    thumbnail_url: a.thumbnail_url ?? a.image_url ?? null,
  };
}

/** Insert a catalogue entry into the home watchlist; returns the new row. */
export async function addLibraryAilmentToWatchlist(a: LibraryAilment, homeId: string) {
  const payload = mapLibraryToWatchlistPayload(a, homeId);
  const { data, error } = await supabase.from("ailments").insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ── library → favourite (Stage 1, ailment-library overhaul) ──────────────────

/**
 * Pure: shape a catalogue row into the `AilmentFavouriteInput` favouriteAilment
 * expects (which was built for home watchlist rows). Source is always
 * `'library'` — tier-open on every plan, matching the watchlist's library adds.
 */
export function libraryRowToFavouriteInput(a: LibraryAilment): AilmentFavouriteInput {
  return {
    id: String(a.id),
    name: a.name,
    type: kindToWatchlistType(a.kind),
    source: "library",
    thumbnail_url: a.thumbnail_url ?? a.image_url ?? null,
    scientific_name: a.scientific_name ?? null,
    description: a.description ?? null,
    symptoms: a.symptoms ?? [],
    affected_plants: a.affected_plant_types ?? [],
    prevention_steps: splitStepsText(a.prevention).map((description) => ({ title: "Prevention", description })),
    remedy_steps: splitStepsText(a.treatment).map((description) => ({ title: "Treatment", description })),
    perenual_id: null,
  };
}

/**
 * Favourite a catalogue entry directly from the library page. Passes the row's
 * own id as the pre-resolved canonical reference — no name-ilike round trip,
 * and the favourite is "always live" (renders the library row, not a tombstone).
 */
export async function favouriteLibraryAilment(a: LibraryAilment, homeId: string | null) {
  return favouriteAilment(libraryRowToFavouriteInput(a), homeId, a.id);
}
