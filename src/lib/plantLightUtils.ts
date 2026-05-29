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

// Ordered most-specific first so "part shade"/"part sun" match before the
// bare "shade" catch-all, and "full sun" before anything else.
const SUNLIGHT_LUX_MAP: Array<{ keywords: string[]; range: LuxRange }> = [
  {
    keywords: ["full sun"],
    range: { min: 20000, max: 40000, label: "Full Sun" },
  },
  {
    keywords: ["partial", "part sun", "part shade"],
    range: { min: 5000, max: 20000, label: "Partial Sun" },
  },
  {
    keywords: ["filtered", "indirect", "dappled"],
    range: { min: 1500, max: 5000, label: "Filtered Shade" },
  },
  {
    keywords: ["shade"],
    range: { min: 0, max: 1500, label: "Full Shade" },
  },
];

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
    // Treat "_" and "-" as spaces so "full_sun" / "part-shade" match the
    // space-separated keywords below.
    const norm = String(s)
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const entry of SUNLIGHT_LUX_MAP) {
      if (entry.keywords.some((kw) => norm.includes(kw))) {
        if (entry.range.min < combinedMin) {
          combinedMin = entry.range.min;
          lowLabel = entry.range.label;
        }
        if (entry.range.max > combinedMax) {
          combinedMax = entry.range.max;
          highLabel = entry.range.label;
        }
        matched = true;
        break;
      }
    }
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
