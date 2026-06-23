// Single source of truth for the /credits "Credits & Sources" page — every
// external service Rhozly draws information from, what it provides, and the
// user-facing surfaces where it's used. Grounded in docs/app-reference
// (24-image-sources, 25-plant-providers, 13-ai-gemini, 27-weather,
// 10-edge-functions-catalogue). Image-provider attribution still also flows
// through src/lib/imageCredit.ts (per-image popover → links here).

export type SourceCategory =
  | "Plants & species"
  | "Plant reference & library"
  | "Plant identification"
  | "Weather & environment"
  | "Images"
  | "AI"
  | "Infrastructure";

export const SOURCE_CATEGORIES: SourceCategory[] = [
  "Plants & species",
  "Plant reference & library",
  "Plant identification",
  "Weather & environment",
  "Images",
  "AI",
  "Infrastructure",
];

/** Short intro shown under a category heading (optional). */
export const CATEGORY_INTRO: Partial<Record<SourceCategory, string>> = {
  "Images": "Plant photos also come from Perenual, Verdantly, Wikimedia, iNaturalist, Pl@ntNet and AI (listed above). The image-only sources are:",
};

export interface DataSource {
  id: string;
  name: string;
  category: SourceCategory;
  /** What it provides us. */
  provides: string;
  /** User-facing surfaces where it's used. */
  usedIn: string[];
  /** Licence / attribution note. */
  note: string;
  /** Canonical terms / licence link. */
  licenseUrl?: string;
  /** Tailwind class fragment to tint the chip. */
  tint: string;
}

const EMERALD = "text-emerald-700 bg-emerald-50";
const SLATE = "text-slate-700 bg-slate-50";
const AMBER = "text-amber-700 bg-amber-50";
const SKY = "text-sky-700 bg-sky-50";
const VIOLET = "text-violet-700 bg-violet-50";
const LIME = "text-lime-700 bg-lime-50";
const INDIGO = "text-indigo-700 bg-indigo-50";

export const DATA_SOURCES: DataSource[] = [
  // ── Plants & species ──────────────────────────────────────────────────────
  {
    id: "perenual", name: "Perenual", category: "Plants & species",
    provides: "Plant species, cultivars and care data (watering, sunlight, hardiness), the pest & disease catalogue, and plant photos.",
    usedIn: ["Plant search", "Plant details", "Add to Shed", "Plant Doctor (pest & disease look-ups)"],
    note: "Each Perenual record and image carries its own licence — shown on the per-image credit badge.",
    licenseUrl: "https://perenual.com/docs/api", tint: EMERALD,
  },
  {
    id: "verdantly", name: "Verdantly", category: "Plants & species",
    provides: "Curated plant species data, gardening tips, companion-planting relationships and plant photos.",
    usedIn: ["Plant search", "Companion Plants", "Plant details"],
    note: "Credited per Verdantly's terms of service; the API doesn't expose a per-image licence.",
    licenseUrl: "https://rapidapi.com/Tomaslau/api/verdantly-gardening-api", tint: EMERALD,
  },

  // ── Plant reference & library (background catalogue building + verification) ─
  {
    id: "gbif", name: "GBIF", category: "Plant reference & library",
    provides: "Authoritative species taxonomy and accepted names (the Global Biodiversity Information Facility backbone).",
    usedIn: ["Plant library — background catalogue building & verification"],
    note: "GBIF's taxonomic data is released under CC0 (no attribution required); we credit it anyway.",
    licenseUrl: "https://www.gbif.org/terms", tint: SLATE,
  },
  {
    id: "wikidata", name: "Wikidata", category: "Plant reference & library",
    provides: "Plant names and scientific binomials (queried via SPARQL).",
    usedIn: ["Plant library — background catalogue building"],
    note: "Wikidata is released under CC0 by the Wikimedia Foundation.",
    licenseUrl: "https://www.wikidata.org/wiki/Wikidata:Licensing", tint: SLATE,
  },
  {
    id: "wikipedia", name: "Wikimedia / Wikipedia", category: "Plant reference & library",
    provides: "Plant descriptions, common & scientific names, reference summaries, and Wikimedia Commons reference photos.",
    usedIn: ["Plant library — building & verification", "Plant details", "Plant image search"],
    note: "Wikipedia text and most Commons images are CC BY-SA 4.0; we link to the source page so contributors are credited.",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", tint: SLATE,
  },
  {
    id: "inaturalist", name: "iNaturalist", category: "Plant reference & library",
    provides: "Community-curated species names and observation photos with expert-confirmed identifications.",
    usedIn: ["Plant library — background catalogue building", "Plant image search", "Sprite Wizard"],
    note: "Each iNaturalist observation carries the contributor's chosen Creative Commons licence.",
    licenseUrl: "https://www.inaturalist.org/pages/help#cc", tint: AMBER,
  },

  // ── Plant identification ──────────────────────────────────────────────────
  {
    id: "plantnet", name: "Pl@ntNet", category: "Plant identification",
    provides: "Botanical plant identification from photos, plus reference imagery.",
    usedIn: ["Plant Doctor — Identify", "Plant image search"],
    note: "Pl@ntNet imagery is CC-BY-SA; we link back to the species page where available.",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", tint: LIME,
  },

  // ── Weather & environment ─────────────────────────────────────────────────
  {
    id: "open_meteo", name: "Open-Meteo", category: "Weather & environment",
    provides: "Current conditions and the 7-day hourly/daily forecast (temperature, rain, wind, solar).",
    usedIn: ["Weather tab", "Weather alerts & Garden Intelligence", "Automations (weather conditions)", "Head Gardener"],
    note: "Free, open weather data — no attribution required; we credit it anyway.",
    licenseUrl: "https://open-meteo.com/en/license", tint: SKY,
  },
  {
    id: "open_meteo_air", name: "Open-Meteo Air Quality", category: "Weather & environment",
    provides: "Pollen forecast (grass, tree and weed pollen).",
    usedIn: ["Weekly Overview — pollen", "Insights"],
    note: "Open-Meteo's air-quality API, same open licence.",
    licenseUrl: "https://open-meteo.com/en/license", tint: SKY,
  },
  {
    id: "suncalc", name: "Sun times", category: "Weather & environment",
    provides: "Sunrise and sunset times for your location.",
    usedIn: ["Golden-Hour reminders"],
    note: "Calculated on-device from your latitude/longitude using the standard NOAA solar algorithm — no external service.",
    licenseUrl: "https://gml.noaa.gov/grad/solcalc/", tint: AMBER,
  },

  // ── Images (image-only sources; data sources above also supply photos) ──────
  {
    id: "pixabay", name: "Pixabay", category: "Images",
    provides: "Stock plant and garden photography.",
    usedIn: ["Plant image search", "Sprite Wizard", "Galleries"],
    note: "Released under the Pixabay Content License (no attribution required, a link back is appreciated).",
    licenseUrl: "https://pixabay.com/service/license-summary/", tint: SKY,
  },
  {
    id: "unsplash", name: "Unsplash", category: "Images",
    provides: "High-quality plant and garden photography.",
    usedIn: ["Plant image search", "Plant galleries & hero images"],
    note: "Used under the Unsplash License; we credit the photographer wherever the image is shown.",
    licenseUrl: "https://unsplash.com/license", tint: SLATE,
  },
  {
    id: "user", name: "Your photos", category: "Images",
    provides: "Photos you upload yourself.",
    usedIn: ["Plant journals", "Your plants", "Sprite Wizard"],
    note: "Your photos stay yours — shown with a 'Your photo' badge so the chrome stays consistent.",
    tint: "text-rhozly-primary bg-rhozly-primary/10",
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  {
    id: "gemini", name: "Google Gemini", category: "AI",
    provides: "AI text and vision — plant identification & diagnosis, care guides, the planner, the Head Gardener, insights, chat and more.",
    usedIn: ["Plant Doctor", "Care guides", "Planner & Garden designs", "Head Gardener", "AI Insights", "Seasonal picks"],
    note: "Always called server-side (never from your browser); every call's cost is logged. AI output is marked as AI-generated.",
    licenseUrl: "https://ai.google.dev/gemini-api/terms", tint: VIOLET,
  },
  {
    id: "ai", name: "Google Imagen", category: "AI",
    provides: "AI-generated concept images (e.g. garden redesign 'after' mock-ups).",
    usedIn: ["Garden Overhaul", "AI reference images"],
    note: "Clearly marked as AI-generated so you can tell synthesised images from real photographs.",
    licenseUrl: "https://ai.google.dev/gemini-api/terms", tint: VIOLET,
  },

  // ── Infrastructure ────────────────────────────────────────────────────────
  {
    id: "supabase", name: "Supabase", category: "Infrastructure",
    provides: "The database, authentication, file storage and serverless functions that run Rhozly.",
    usedIn: ["Sign-in & accounts", "All your data", "Photo storage", "Every AI / weather call"],
    note: "Your data is stored in Supabase (Postgres) with row-level security.",
    licenseUrl: "https://supabase.com/terms", tint: EMERALD,
  },
  {
    id: "firebase", name: "Firebase Cloud Messaging", category: "Infrastructure",
    provides: "Delivery of push notifications to your phone and browser.",
    usedIn: ["Task reminders", "Weather alerts", "Golden-Hour & automation notifications"],
    note: "Google's push-delivery service; used only to deliver notifications you've enabled.",
    licenseUrl: "https://firebase.google.com/terms", tint: AMBER,
  },
  {
    id: "resend", name: "Resend", category: "Infrastructure",
    provides: "Delivery of emails (the weekly digest and home-invite emails).",
    usedIn: ["Weekly digest email", "Home invites"],
    note: "Transactional email provider.",
    licenseUrl: "https://resend.com/legal/terms-of-service", tint: INDIGO,
  },
  {
    id: "stripe", name: "Stripe", category: "Infrastructure",
    provides: "Subscription checkout and billing.",
    usedIn: ["Your Plan — upgrade & manage billing"],
    note: "Payments are handled entirely by Stripe; Rhozly never sees your card details.",
    licenseUrl: "https://stripe.com/legal/ssa", tint: VIOLET,
  },
];
