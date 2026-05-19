export type TierId = "sprout" | "botanist" | "sage" | "evergreen";

export interface TierDef {
  id: TierId;
  name: string;
  icon: string;
  vibe: string;
  goodFor: string;
  features: string[];
  ai_enabled: boolean;
  enable_perenual: boolean;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  badge?: string;
}

export const TIERS: TierDef[] = [
  {
    id: "sprout",
    name: "Sprout",
    icon: "🌱",
    vibe: "Just starting out. Basic tracking & care.",
    goodFor: "1–5 plants · learning the basics",
    features: [
      "Plant & task tracking",
      "Location & area management",
      "Recurring schedules",
      "Community guides",
      "Planner & watchlist",
    ],
    ai_enabled: false,
    enable_perenual: false,
    accentBg: "bg-emerald-50",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-200",
  },
  {
    id: "botanist",
    name: "Botanist",
    icon: "📖",
    vibe: "Serious data. Detailed species guides and care schedules.",
    goodFor: "10–20 plants · weekly gardener · wants accurate care info",
    features: [
      "Everything in Sprout",
      "10,000+ species database",
      "Detailed care schedules per plant",
      "Plant search & smart identification",
    ],
    ai_enabled: false,
    enable_perenual: true,
    accentBg: "bg-blue-50",
    accentText: "text-blue-700",
    accentBorder: "border-blue-200",
    badge: "Most Popular",
  },
  {
    id: "sage",
    name: "Sage",
    icon: "🧠",
    vibe: "Wisdom. Instant AI diagnosis and smart growth advice.",
    goodFor: "Anyone with sick / problem plants · wants AI help",
    features: [
      "Everything in Sprout",
      "AI plant diagnosis (photo → diagnosis)",
      "Smart growth advice",
      "Plant Doctor AI · ~25 scans/hour",
      "AI area scanning",
    ],
    ai_enabled: true,
    enable_perenual: false,
    accentBg: "bg-violet-50",
    accentText: "text-violet-700",
    accentBorder: "border-violet-200",
  },
  {
    id: "evergreen",
    name: "Evergreen",
    icon: "🌿",
    vibe: "The complete ecosystem. Everything unlocked.",
    goodFor: "20+ plants · multi-bed gardener · wants every feature",
    features: [
      "Everything in Botanist",
      "Everything in Sage",
      "Full AI + species database · highest quotas",
    ],
    ai_enabled: true,
    enable_perenual: true,
    accentBg: "bg-rhozly-primary/5",
    accentText: "text-rhozly-primary",
    accentBorder: "border-rhozly-primary/30",
    badge: "All-in-One",
  },
];

// Mirrors supabase/functions/_shared/rateLimit.ts — keep in sync if limits change.
export const HOURLY_RATE_LIMITS: Record<string, Record<string, number>> = {
  "plant-doctor":            { sprout: 0, botanist: 10, sage: 25, evergreen: 50 },
  "plant-doctor-ai":         { sprout: 0, botanist: 5,  sage: 20, evergreen: 40 },
  "generate-landscape-plan": { sprout: 0, botanist: 3,  sage: 8,  evergreen: 15 },
  "scan-area":               { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "generate-guide":          { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
  "identify-plant":          { sprout: 0, botanist: 10, sage: 25, evergreen: 50 },
  "optimise-area-ai":        { sprout: 0, botanist: 5,  sage: 10, evergreen: 20 },
};

export const FN_DISPLAY_NAMES: Record<string, string> = {
  "plant-doctor":            "Plant Doctor",
  "plant-doctor-ai":         "Doctor (Vision)",
  "generate-landscape-plan": "Landscape Plan",
  "scan-area":               "Area Scan",
  "generate-guide":          "Generate Guide",
  "identify-plant":          "Identify Plant",
  "optimise-area-ai":        "AI Optimise",
};

export function tierIdFromFlags(aiEnabled: boolean, perenualEnabled: boolean): TierId {
  if (aiEnabled && perenualEnabled) return "evergreen";
  if (aiEnabled) return "sage";
  if (perenualEnabled) return "botanist";
  return "sprout";
}

export function getTier(id: TierId | null | undefined): TierDef {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}
