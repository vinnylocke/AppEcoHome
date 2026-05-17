/**
 * Safe location context for AI prompts.
 *
 * Converts precise lat/lng into a city/town-level descriptor via Nominatim
 * (OpenStreetMap reverse geocoding). Raw coordinates never leave this module —
 * all downstream AI prompts receive the struct below instead.
 *
 * Nominatim ToS: 1 req/s max, descriptive User-Agent required.
 */

export interface LocationContext {
  hemisphere: "Northern" | "Southern";
  country: string | null;
  city: string | null;
  climateZone: string | null;
  hardinessZone: string | null;
}

/**
 * Reverse-geocodes lat/lng to a city or town.
 * Falls back through city → town → village → county → state.
 * Returns null on any failure so callers can fall back to country-only.
 */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      {
        signal: AbortSignal.timeout(5_000),
        headers: {
          "User-Agent": "Rhozly Plant Care App (contact: support@rhozly.app)",
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    return addr.city ?? addr.town ?? addr.village ?? addr.county ?? addr.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Formats a LocationContext into a compact prompt string.
 * Example: "Location: London, United Kingdom | Hemisphere: Northern | Climate: Temperate Oceanic | Hardiness zone: 9a"
 */
export function formatLocationContext(ctx: LocationContext): string {
  const parts: string[] = [];

  if (ctx.city && ctx.country) {
    parts.push(`Location: ${ctx.city}, ${ctx.country}`);
  } else if (ctx.country) {
    parts.push(`Country: ${ctx.country}`);
  }

  parts.push(`Hemisphere: ${ctx.hemisphere}`);

  if (ctx.climateZone) {
    parts.push(`Climate: ${ctx.climateZone.replace(/_/g, " ")}`);
  }
  if (ctx.hardinessZone && ctx.hardinessZone !== "unknown") {
    parts.push(`Hardiness zone: ${ctx.hardinessZone}`);
  }

  return parts.join(" | ");
}
