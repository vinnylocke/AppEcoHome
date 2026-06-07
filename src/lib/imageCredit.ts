// ─── imageCredit ────────────────────────────────────────────────────────
//
// Single source of truth for image licence + attribution metadata.
// Every image surface in the app eventually renders an <ImageCredit>
// driven by the shape defined here.

export type ImageProvider =
  | "perenual"
  | "verdantly"
  | "wikipedia"
  | "pixabay"
  | "inaturalist"
  | "unsplash"
  | "plantnet"
  | "ai"
  | "user"
  | "unknown";

export interface ImageCredit {
  /** Stable provider id — drives the badge + fallback "via Perenual" labels. */
  provider: ImageProvider;
  /** Short human-readable licence name, e.g. "CC-BY-SA 4.0", "Public Domain",
   *  "Unsplash License", "Pixabay Content License", "AI-generated". */
  license_name?: string | null;
  /** URL to the canonical licence terms. */
  license_url?: string | null;
  /** Free text shown verbatim alongside the image (e.g. "Photo by Jane Doe").
   *  For Unsplash this is the photographer's name. Never reformatted. */
  attribution?: string | null;
  /** Link to the source page so users can click through. */
  source_url?: string | null;
  /** Optional — true when the licence allows unrestricted commercial use. */
  commercial_ok?: boolean | null;
}

export const PROVIDER_LABEL: Record<ImageProvider, string> = {
  perenual:    "Perenual",
  verdantly:   "Verdantly",
  wikipedia:   "Wikimedia",
  pixabay:     "Pixabay",
  inaturalist: "iNaturalist",
  unsplash:    "Unsplash",
  plantnet:    "Pl@ntNet",
  ai:          "Rhozly AI",
  user:        "Your photo",
  unknown:     "Unknown source",
};

/** Brand colour token (Tailwind class fragment) per provider, used to
 *  tint the credit badge so the source is glanceable. */
export const PROVIDER_TINT: Record<ImageProvider, string> = {
  perenual:    "text-emerald-700 bg-emerald-50",
  verdantly:   "text-emerald-700 bg-emerald-50",
  wikipedia:   "text-slate-700  bg-slate-50",
  pixabay:     "text-sky-700    bg-sky-50",
  inaturalist: "text-amber-700  bg-amber-50",
  unsplash:    "text-slate-700  bg-white",
  plantnet:    "text-lime-700   bg-lime-50",
  ai:          "text-violet-700 bg-violet-50",
  user:        "text-rhozly-primary bg-rhozly-primary/10",
  unknown:     "text-rhozly-on-surface/60 bg-rhozly-surface-low",
};

/** Default licence URL fallback when a provider's per-image data didn't
 *  carry an explicit `license_url`. Surfaces the canonical terms page so
 *  users can verify. */
export const PROVIDER_DEFAULT_LICENSE_URL: Partial<Record<ImageProvider, string>> = {
  unsplash:    "https://unsplash.com/license",
  pixabay:     "https://pixabay.com/service/license-summary/",
  wikipedia:   "https://creativecommons.org/licenses/",
  verdantly:   "https://rapidapi.com/Tomaslau/api/verdantly-gardening-api",
  perenual:    "https://perenual.com/docs/api",
  inaturalist: "https://creativecommons.org/about/cclicenses/",
  plantnet:    "https://creativecommons.org/licenses/by-sa/4.0/",
};

/** Normalise a raw value to a known `ImageProvider`. Falls back to
 *  `"unknown"` so the popover gracefully points to /credits. */
export function normaliseProvider(value: unknown): ImageProvider {
  if (typeof value !== "string") return "unknown";
  const v = value.toLowerCase();
  switch (v) {
    case "perenual":    return "perenual";
    case "verdantly":   return "verdantly";
    case "wikipedia":
    case "wikimedia":
    case "wiki":        return "wikipedia";
    case "pixabay":     return "pixabay";
    case "inaturalist":
    case "inat":        return "inaturalist";
    case "unsplash":    return "unsplash";
    case "plantnet":
    case "pl@ntnet":    return "plantnet";
    case "ai":
    case "rhozly_ai":
    case "gemini":
    case "imagen":      return "ai";
    case "user":
    case "self":
    case "you":         return "user";
    default:            return "unknown";
  }
}

/** Coerce any value into a valid `ImageCredit | null`. Accepts the
 *  exact shape we store in jsonb, plus a few legacy shapes that
 *  `plant-image-search` used to emit. Returns null when nothing usable. */
export function coerceImageCredit(value: unknown): ImageCredit | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  // Already the new shape?
  if (typeof v.provider === "string") {
    const provider = normaliseProvider(v.provider);
    return {
      provider,
      license_name:  typeof v.license_name  === "string" ? v.license_name  : null,
      license_url:   typeof v.license_url   === "string" ? v.license_url   : (PROVIDER_DEFAULT_LICENSE_URL[provider] ?? null),
      attribution:   typeof v.attribution   === "string" ? v.attribution   : null,
      source_url:    typeof v.source_url    === "string" ? v.source_url    : null,
      commercial_ok: typeof v.commercial_ok === "boolean" ? v.commercial_ok : null,
    };
  }
  // Legacy plant_image_cache.attribution shape — has photographer_name etc.
  if (typeof v.photographer_name === "string" || typeof v.photo_page === "string") {
    return {
      provider:    "unsplash",
      license_name: "Unsplash License",
      license_url:  PROVIDER_DEFAULT_LICENSE_URL.unsplash ?? null,
      attribution:  typeof v.photographer_name === "string" ? `Photo by ${v.photographer_name}` : null,
      source_url:   typeof v.photo_page === "string" ? v.photo_page : null,
    };
  }
  if (typeof v.wiki_page === "string") {
    return {
      provider:    "wikipedia",
      license_name: typeof v.license_name === "string" ? v.license_name : null,
      license_url:  typeof v.license_url  === "string" ? v.license_url  : null,
      attribution:  typeof v.artist === "string" ? v.artist : null,
      source_url:   typeof v.wiki_page === "string" ? v.wiki_page : null,
    };
  }
  if (typeof v.pixabay_page === "string") {
    return {
      provider:    "pixabay",
      license_name: "Pixabay Content License",
      license_url:  PROVIDER_DEFAULT_LICENSE_URL.pixabay ?? null,
      attribution:  null,
      source_url:   typeof v.pixabay_page === "string" ? v.pixabay_page : null,
    };
  }
  return null;
}

/** Best-effort short label used inline e.g. "via Perenual — Public Domain". */
export function shortCreditLine(credit: ImageCredit | null): string {
  if (!credit) return "Unknown source";
  const parts: string[] = [];
  if (credit.attribution) parts.push(credit.attribution);
  parts.push(`via ${PROVIDER_LABEL[credit.provider]}`);
  if (credit.license_name) parts.push(`— ${credit.license_name}`);
  return parts.join(" ");
}

/** Quick predicate. The /credits page covers everything but we still
 *  want to surface "Unknown source" subtly so it's not invisible. */
export function isKnownCredit(credit: ImageCredit | null | undefined): boolean {
  return !!credit && credit.provider !== "unknown";
}
