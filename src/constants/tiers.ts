export type TierId = "sprout" | "botanist" | "sage" | "evergreen";

export interface TierDef {
  id: TierId;
  name: string;
  icon: string;
  vibe: string;
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
  },
  {
    id: "sage",
    name: "Sage",
    icon: "🧠",
    vibe: "Wisdom. Instant AI diagnosis and smart growth advice.",
    features: [
      "Everything in Sprout",
      "AI plant diagnosis",
      "Smart growth advice",
      "Plant Doctor AI",
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
    features: [
      "Everything in Botanist",
      "Everything in Sage",
      "Full AI + species database",
    ],
    ai_enabled: true,
    enable_perenual: true,
    accentBg: "bg-rhozly-primary/5",
    accentText: "text-rhozly-primary",
    accentBorder: "border-rhozly-primary/30",
    badge: "All-in-One",
  },
];

export function tierIdFromFlags(aiEnabled: boolean, perenualEnabled: boolean): TierId {
  if (aiEnabled && perenualEnabled) return "evergreen";
  if (aiEnabled) return "sage";
  if (perenualEnabled) return "botanist";
  return "sprout";
}

export function getTier(id: TierId | null | undefined): TierDef {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}
