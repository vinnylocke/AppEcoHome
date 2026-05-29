export interface LuxRange {
  min: number;
  max: number;
  label: string;
}

export interface LightFitness {
  rating: "Best" | "Great" | "Good" | "Bad" | "Worse";
  color: string;
  bgColor: string;
  description: string;
}

export interface SunlightBand {
  label: string;
  min: number;
  max: number;
  /** Matched against a normalised (lowercased, "_"/"-"→space) sunlight value. */
  keywords: string[];
}

/**
 * THE single source of truth for the sunlight ⇄ lux mapping used across the
 * app — the per-plant Light tab, the Light Sensor's area readings, the
 * live-reading category label, and the target lux for a new area all derive
 * from this one table. To re-tune the values, edit here and nowhere else.
 *
 * Ordered most-specific first so "part shade" / "part sun" match before the
 * bare "shade" catch-all and "full sun" before bare "sun". Ranges reflect
 * real outdoor lux: deep shade <500, light shade 500–2.5k, dappled/part
 * shade 2.5k–10k, part sun 10k–20k, full sun 20k up to ~100k at midday.
 */
export const SUNLIGHT_BANDS: SunlightBand[] = [
  { label: "Full Sun",   min: 20000, max: 100000, keywords: ["full sun", "sun"] },
  { label: "Part Sun",   min: 10000, max: 20000,  keywords: ["part sun", "partial sun"] },
  { label: "Part Shade", min: 2500,  max: 10000,  keywords: ["part shade", "partial shade", "filtered", "dappled", "indirect"] },
  { label: "Shade",      min: 500,   max: 2500,   keywords: ["shade"] },
  { label: "Deep Shade", min: 0,     max: 500,    keywords: ["deep shade", "full shade"] },
];

/** Normalise a raw sunlight value for keyword matching ("full_sun" → "full sun"). */
function normaliseSunlight(s: string): string {
  return String(s).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

// Flat (keyword → band) list sorted longest keyword first, so the most
// specific phrase wins regardless of band display order — e.g. "part sun"
// beats Full Sun's bare "sun", and "deep shade" beats bare "shade".
const KEYWORD_MATCHERS: Array<{ kw: string; band: SunlightBand }> = SUNLIGHT_BANDS
  .flatMap((band) => band.keywords.map((kw) => ({ kw, band })))
  .sort((a, b) => b.kw.length - a.kw.length);

/** The band a single sunlight value maps to (most-specific keyword wins), or null. */
export function bandForSunlightValue(value: string): SunlightBand | null {
  const norm = normaliseSunlight(value);
  return KEYWORD_MATCHERS.find((m) => norm.includes(m.kw))?.band ?? null;
}

/** The band a raw lux reading falls into (for labelling a live reading). */
export function luxToBand(lux: number): SunlightBand {
  // Bands are contiguous; pick the one whose [min, max] contains lux.
  return (
    SUNLIGHT_BANDS.find((b) => lux >= b.min && lux <= b.max) ??
    (lux > 0 ? SUNLIGHT_BANDS[0] : SUNLIGHT_BANDS[SUNLIGHT_BANDS.length - 1])
  );
}

/**
 * A single representative lux target for a plant's sunlight requirement —
 * the midpoint of its optimal range. Used to seed a new area's `target_lux`.
 */
export function targetLuxForSunlight(sunlight: string | string[]): number | null {
  const arr = Array.isArray(sunlight) ? sunlight : [sunlight];
  const range = getOptimalLuxRange(arr);
  if (!range) return null;
  return Math.round((range.min + range.max) / 2);
}

/**
 * Optimal lux range for a plant's light requirements. A plant can carry
 * several values (e.g. ["full sun", "part shade"]); the returned range
 * spans the **lowest** band's min to the **highest** band's max across all
 * of them, and the label names that span (e.g. "Partial Sun – Full Sun").
 *
 * Values are normalised before matching so both storage formats work:
 * Verdantly uses underscores ("full_sun", "part_shade", "deep_shade"),
 * while Perenual / AI / manual use spaces ("full sun", "part shade").
 */
export function getOptimalLuxRange(sunlight: string[]): LuxRange | null {
  if (!sunlight || sunlight.length === 0) return null;

  let combinedMin = Infinity;
  let combinedMax = -Infinity;
  let lowLabel = "";
  let highLabel = "";
  let matched = false;

  for (const s of sunlight) {
    const band = bandForSunlightValue(s);
    if (!band) continue;
    if (band.min < combinedMin) {
      combinedMin = band.min;
      lowLabel = band.label;
    }
    if (band.max > combinedMax) {
      combinedMax = band.max;
      highLabel = band.label;
    }
    matched = true;
  }

  if (!matched) return null;

  const label = lowLabel === highLabel ? lowLabel : `${lowLabel} – ${highLabel}`;
  return { min: combinedMin, max: combinedMax, label };
}

export function getLightFitness(lux: number, range: LuxRange): LightFitness {
  const { min, max } = range;

  if (lux >= min && lux <= max) {
    return {
      rating: "Best",
      color: "text-green-600",
      bgColor: "bg-green-100",
      description: "Perfect light conditions for this plant.",
    };
  }
  if (lux >= min * 0.6 && lux <= max * 1.5) {
    return {
      rating: "Great",
      color: "text-lime-600",
      bgColor: "bg-lime-100",
      description: "Very close to ideal — your plant will thrive.",
    };
  }
  if (lux >= min * 0.3 && lux <= max * 3) {
    return {
      rating: "Good",
      color: "text-amber-600",
      bgColor: "bg-amber-100",
      description: "Acceptable light — growth may be slower than optimal.",
    };
  }
  if (lux >= min * 0.1 && lux <= max * 6) {
    return {
      rating: "Bad",
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      description: "Too far from ideal — consider moving this plant.",
    };
  }
  return {
    rating: "Worse",
    color: "text-red-600",
    bgColor: "bg-red-100",
    description: "Critically mismatched light — this plant needs a new spot.",
  };
}
