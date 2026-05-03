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

// Ordered most-specific first so "full sun" matches before "sun"
const SUNLIGHT_LUX_MAP: Array<{ keywords: string[]; range: LuxRange }> = [
  {
    keywords: ["full sun"],
    range: { min: 20000, max: 40000, label: "Full Sun" },
  },
  {
    keywords: ["partial", "part sun", "part shade", "part-shade"],
    range: { min: 5000, max: 20000, label: "Partial Sun" },
  },
  {
    keywords: ["filtered", "indirect"],
    range: { min: 1500, max: 5000, label: "Filtered Shade" },
  },
  {
    keywords: ["shade"],
    range: { min: 0, max: 1500, label: "Full Shade" },
  },
];

export function getOptimalLuxRange(sunlight: string[]): LuxRange | null {
  if (!sunlight || sunlight.length === 0) return null;

  let combinedMin = Infinity;
  let combinedMax = -Infinity;
  let bestLabel = "";
  let matched = false;

  for (const s of sunlight) {
    const lower = s.toLowerCase();
    for (const entry of SUNLIGHT_LUX_MAP) {
      if (entry.keywords.some((kw) => lower.includes(kw))) {
        if (entry.range.min < combinedMin) {
          combinedMin = entry.range.min;
          bestLabel = entry.range.label;
        }
        if (entry.range.max > combinedMax) {
          combinedMax = entry.range.max;
        }
        matched = true;
        break;
      }
    }
  }

  if (!matched) return null;

  // When min of the union is lower than the original label's min, pick label from the lowest range
  return { min: combinedMin, max: combinedMax, label: bestLabel };
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
