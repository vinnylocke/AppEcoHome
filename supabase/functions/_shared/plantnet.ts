// ─── Pl@ntNet identify helper ────────────────────────────────────────────────
//
// Wraps the Pl@ntNet `v2/identify/{project}` endpoint so the plant-doctor edge
// function can run a curated botanical ID before reaching for Gemini. Pl@ntNet
// is trained on millions of curated plant photos and is more accurate than a
// general vision LLM for species ID — but it does *only* identification, no
// disease / pest / care guidance. So we treat it as the ID step and let Gemini
// do everything else, optionally cross-checking the two for confidence.
//
// Docs: https://my.plantnet.org/doc/api/identify
// Endpoint: POST https://my-api.plantnet.org/v2/identify/{project}?api-key=…
// Auth:     api-key query param
// Body:     multipart/form-data with up to 5 `images` parts and one `organs`
//           part per image (leaf / flower / fruit / bark / auto)
// Response: { bestMatch, results: [ { score, species: { … }, gbif: { id } } ],
//             remainingIdentificationRequests, … }
//
// Failures are deliberately *typed* so the caller can fall back to AI-only ID
// when the key is missing, the quota is exhausted, or the image was rejected
// as non-plant — without losing the identify_vision call entirely.

import { log, warn } from "./logger.ts";

export type PlantOrgan = "leaf" | "flower" | "fruit" | "bark" | "auto";

export interface PlantNetImageInput {
  /** Raw base64 (no `data:image/…;base64,` prefix). */
  base64: string;
  mimeType: string;
  /** Optional organ hint. `auto` is the default Pl@ntNet uses when absent. */
  organ?: PlantOrgan;
}

export interface PlantNetMatch {
  score: number;                  // 0–1
  commonName: string | null;      // species.commonNames[0] when present
  scientificName: string;         // species.scientificNameWithoutAuthor
  scientificNameAuthored: string | null; // species.scientificName (with author)
  genus: string | null;
  family: string | null;
  gbifId: string | null;
}

export interface PlantNetResult {
  bestMatch: PlantNetMatch | null;
  /** Up to 5 ranked descending by score. */
  topMatches: PlantNetMatch[];
  remainingRequests: number | null;
  query: { project: string; imageCount: number; organs: string[] };
}

export interface PlantNetErrorReason {
  kind:
    | "no_key"            // PLANTNET_API_KEY missing — fall back silently
    | "quota_exhausted"   // 429 from upstream
    | "not_a_plant"       // 404 from upstream (image rejected)
    | "auth"              // 401 / 403
    | "network"           // fetch failed / 5xx
    | "bad_response";     // 2xx body we can't parse
  message: string;
  /** When upstream included it (rare on errors). */
  remainingRequests?: number | null;
}

export class PlantNetError extends Error {
  reason: PlantNetErrorReason;
  constructor(reason: PlantNetErrorReason) {
    super(reason.message);
    this.name = "PlantNetError";
    this.reason = reason;
  }
}

const FN = "_shared/plantnet";
const ENDPOINT = "https://my-api.plantnet.org/v2/identify";
const PROJECT = "all"; // global multilingual project — best general coverage
const TIMEOUT_MS = 15_000;

/** Convert a base64 string to a Blob without first decoding into a string. */
function base64ToBlob(b64: string, mimeType: string): Blob {
  const byteString = atob(b64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function extOf(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function pickCommonName(commonNames: unknown): string | null {
  if (!Array.isArray(commonNames)) return null;
  const first = commonNames.find((n) => typeof n === "string" && n.trim().length > 0);
  return typeof first === "string" ? first.trim() : null;
}

function mapMatch(raw: any): PlantNetMatch | null {
  const score = typeof raw?.score === "number" ? raw.score : null;
  const scientificName = raw?.species?.scientificNameWithoutAuthor;
  if (score == null || typeof scientificName !== "string" || !scientificName.trim()) {
    return null;
  }
  return {
    score,
    commonName: pickCommonName(raw?.species?.commonNames),
    scientificName: scientificName.trim(),
    scientificNameAuthored:
      typeof raw?.species?.scientificName === "string" ? raw.species.scientificName : null,
    genus: raw?.species?.genus?.scientificNameWithoutAuthor ?? null,
    family: raw?.species?.family?.scientificNameWithoutAuthor ?? null,
    gbifId: raw?.gbif?.id ? String(raw.gbif.id) : null,
  };
}

/**
 * Identify a plant from up to 5 images. Throws `PlantNetError` on any failure
 * the caller may want to branch on — keep this typed so the edge function can
 * choose between "fall back to AI" and "report the error".
 */
export async function identifyWithPlantNet(input: {
  images: PlantNetImageInput[];
  apiKey: string | undefined;
  lang?: string;
}): Promise<PlantNetResult> {
  if (!input.apiKey) {
    throw new PlantNetError({ kind: "no_key", message: "PLANTNET_API_KEY not configured" });
  }
  if (!Array.isArray(input.images) || input.images.length === 0) {
    throw new PlantNetError({ kind: "bad_response", message: "No images supplied" });
  }
  if (input.images.length > 5) {
    // Belt-and-braces — the caller already enforces the cap, but Pl@ntNet
    // returns 400 if we go over.
    input.images = input.images.slice(0, 5);
  }

  const lang = input.lang ?? "en";
  const params = new URLSearchParams({ "api-key": input.apiKey, lang });
  const url = `${ENDPOINT}/${PROJECT}?${params.toString()}`;

  const form = new FormData();
  for (let i = 0; i < input.images.length; i++) {
    const img = input.images[i];
    const blob = base64ToBlob(img.base64, img.mimeType);
    form.append("images", blob, `image_${i}.${extOf(img.mimeType)}`);
    form.append("organs", img.organ ?? "auto");
  }

  log(FN, "identify_request", {
    project: PROJECT,
    imageCount: input.images.length,
    organs: input.images.map((i) => i.organ ?? "auto"),
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new PlantNetError({
      kind: "network",
      message: `Pl@ntNet fetch failed: ${(err as Error).message}`,
    });
  }

  // Quota header — Pl@ntNet returns it as a response body field for v2.
  if (res.status === 401 || res.status === 403) {
    throw new PlantNetError({
      kind: "auth",
      message: `Pl@ntNet rejected the API key (HTTP ${res.status})`,
    });
  }
  if (res.status === 404) {
    // 404 is "the model didn't accept this as a plant".
    return { bestMatch: null, topMatches: [], remainingRequests: null, query: { project: PROJECT, imageCount: input.images.length, organs: input.images.map((i) => i.organ ?? "auto") } };
  }
  if (res.status === 429) {
    throw new PlantNetError({
      kind: "quota_exhausted",
      message: "Pl@ntNet daily quota exhausted (HTTP 429)",
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PlantNetError({
      kind: "network",
      message: `Pl@ntNet HTTP ${res.status}: ${text.slice(0, 200)}`,
    });
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err) {
    throw new PlantNetError({
      kind: "bad_response",
      message: `Pl@ntNet returned invalid JSON: ${(err as Error).message}`,
    });
  }

  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const topMatches = results
    .map(mapMatch)
    .filter((m): m is PlantNetMatch => m !== null)
    .slice(0, 5);
  const bestMatch = topMatches[0] ?? mapMatch(data?.bestMatch);

  const remainingRequests =
    typeof data?.remainingIdentificationRequests === "number"
      ? data.remainingIdentificationRequests
      : null;

  if (!bestMatch) {
    warn(FN, "no_matches", {
      raw_result_count: results.length,
      had_best_match: !!data?.bestMatch,
    });
  } else {
    log(FN, "identify_success", {
      best_score: bestMatch.score,
      species: bestMatch.scientificName,
      match_count: topMatches.length,
      remainingRequests,
    });
  }

  return {
    bestMatch,
    topMatches,
    remainingRequests,
    query: {
      project: PROJECT,
      imageCount: input.images.length,
      organs: input.images.map((i) => i.organ ?? "auto"),
    },
  };
}

// ─── Decision helper ─────────────────────────────────────────────────────────
//
// Encapsulates the routing logic the edge function uses so the thresholds are
// in one place + unit-testable. See the plan doc:
//   - score ≥ 0.4  → trust Pl@ntNet, feed name into Gemini as grounded ID
//   - 0.15 ≤ < 0.4 → cross-check: run Gemini too, surface disagreement note
//   - score < 0.15 or no match → AI fallback
//
export type IdentificationSource =
  | "plantnet"                         // High-confidence; Gemini skipped ID
  | "plantnet+ai_confirmed"            // Cross-check, both agreed
  | "plantnet_vs_ai_disagreement"      // Cross-check, names differed
  | "ai_fallback";                     // No Pl@ntNet result usable

export interface RoutingDecision {
  source: IdentificationSource;
  /** When `crossCheck === true`, the caller must still run a Gemini ID and
   *  pass the result to `resolveCrossCheck` below to finalise the source. */
  crossCheck: boolean;
  /** Hand to Gemini as `confirmedSpecies` for downstream prompts when set. */
  confirmedSpecies: string | null;
  /** Convenience: common name, when Pl@ntNet provided one. */
  confirmedCommonName: string | null;
}

export const TRUST_THRESHOLD = 0.4;
export const CROSS_CHECK_FLOOR = 0.15;

export function decideRouting(best: PlantNetMatch | null): RoutingDecision {
  if (!best || best.score < CROSS_CHECK_FLOOR) {
    return {
      source: "ai_fallback",
      crossCheck: false,
      confirmedSpecies: null,
      confirmedCommonName: null,
    };
  }
  if (best.score >= TRUST_THRESHOLD) {
    return {
      source: "plantnet",
      crossCheck: false,
      confirmedSpecies: best.scientificName,
      confirmedCommonName: best.commonName,
    };
  }
  return {
    source: "plantnet+ai_confirmed", // placeholder; finalised by resolveCrossCheck
    crossCheck: true,
    confirmedSpecies: best.scientificName,
    confirmedCommonName: best.commonName,
  };
}

/**
 * Case-insensitive comparison of scientific names. Pl@ntNet returns the form
 * without authorship ("Rosa rugosa"); Gemini may return either ("Rosa rugosa"
 * or "Rosa rugosa Thunb."). We compare on the first two whitespace-delimited
 * tokens (genus + species), which is what botanists expect.
 */
export function speciesNamesAgree(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.trim().toLowerCase().split(/\s+/).slice(0, 2).join(" ");
  return norm(a) === norm(b) && norm(a).length > 0;
}

export function resolveCrossCheck(
  plantnetSpecies: string,
  aiSpecies: string | null,
): IdentificationSource {
  if (!aiSpecies?.trim()) return "plantnet"; // AI offered nothing — keep Pl@ntNet
  return speciesNamesAgree(plantnetSpecies, aiSpecies)
    ? "plantnet+ai_confirmed"
    : "plantnet_vs_ai_disagreement";
}
