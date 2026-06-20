# Rhozly — Features & How to Get Them

A single reference for **every feature in Rhozly**, what it does, and **how a user gets access**.

There are three independent access mechanisms:

1. **`ai_enabled`** — unlocks AI features (Gemini-powered). True for **Sage** + **Evergreen**.
2. **`enable_perenual`** — unlocks the Perenual species database + external plant search. True for
   **Botanist** + **Evergreen**.
3. **`FEATURE_GATES`** (`src/constants/tierFeatures.ts`) — a modular per-feature gate for everything
   that's neither AI nor Perenual (Light Sensor, Garden Layout, etc.). **Every one of these is
   currently set to `ALL` tiers — i.e. open to everyone** — but each can be gated by editing one line.

> **Important:** the tiers are a **lattice, not a ladder**. Sage = *Sprout + AI*; Botanist =
> *Sprout + species DB*; Evergreen = *both*. Sage does **not** include Perenual, and Botanist does
> **not** include AI. "Upgrade" doesn't mean a single ascending line — it means picking the branch (or
> Evergreen for everything).

---

## The tiers at a glance

| Tier | Price / mo | `ai_enabled` | `enable_perenual` | The pitch |
|------|-----------|:---:|:---:|-----------|
| 🌱 **Sprout** | Free | ✗ | ✗ | Manual tracking & care. Everything you need to keep a garden organised. |
| 📖 **Botanist** | £2.99 | ✗ | ✓ | + 10,000-species database, detailed per-plant care schedules, plant search. |
| 🧠 **Sage** | £4.99 | ✓ | ✗ | + AI: photo diagnosis, Plant Doctor, chat, area scan, smart advice. |
| 🌿 **Evergreen** | £6.99 | ✓ | ✓ | Everything — full AI **and** the species database, highest quotas. |

**How to switch:** Profile menu → **Upgrade Rhozly** → `/gardener` (Account tab) → plan picker.
Downgrading is non-destructive — your data stays; only feature access changes.

---

## 1. Always free — every tier (the base app)

These need no upgrade. Available to Sprout and up:

| Feature | What it does |
|---------|--------------|
| Plant & inventory tracking (The Shed) | Add, organise, and track every plant + your seed/tool inventory. |
| Locations & areas | Map your garden into locations and areas with metrics. |
| Tasks & recurring schedules (Blueprints) | One-off and repeating care tasks, with ghost-task previews. |
| Planner & plan staging | Build multi-phase garden plans and work them stage by stage. |
| Ailment Watchlist | Track pests, diseases, and invasives (library tier of search). |
| Community guides — **reading** | Read every Rhozly + community guide, bookmark favourites. |
| Global journal & photos | Journal entries + photo timelines per plant/area/plan. |
| Weather, calendar & ICS export* | 7-day forecast, alerts, month/week calendar. |
| Sun analysis, microclimate, layouts* | Sun paths, microclimate reports, garden layout maps. |
| Dashboard, Garden Walk*, Seasonal Picks | Daily brief, guided plant-by-plant walk, "what to sow now" (rule-based). |

\* These have a **gate wired but currently open** — see §4.

### Free Plant Doctor identifications (Sprout & Botanist)

Even without AI, Sprout and Botanist users get **5 free plant identifications per rolling 7-day
window** (a sliding window — each call's 7-day-old slot drops off as new ones land). This is the only
AI action a non-AI tier can call. Diagnosis, pest scan, chat, etc. still need Sage/Evergreen.

---

## 2. AI features — need Sage or Evergreen (`ai_enabled`)

All AI runs through Supabase Edge Functions and is **enforced server-side** (the function rechecks
`ai_enabled` and a per-tier hourly rate limit — you can't unlock these by tampering with the app).

| Feature | What it does | How to get it |
|---------|--------------|---------------|
| Plant Doctor — Identify | Photo → plant identification (unlimited) | Sage / Evergreen (Sprout/Botanist get 5/week free) |
| Plant Doctor — Diagnose | Photo → problem diagnosis + treatment | Sage / Evergreen |
| Plant Doctor — Pest / Multi-ID | Pest scan + identify several plants in one shot | Sage / Evergreen |
| Plant Doctor Chat | Conversational AI garden assistant | Sage / Evergreen |
| AI Assistant Card / insights | Personalised pattern-based tips on the dashboard | Sage / Evergreen |
| AI plan generation + regenerate | Describe a goal → AI builds a staged plan | Sage / Evergreen |
| Photo-to-task | Snap a photo → AI suggests the task | Sage / Evergreen |
| Optimise tab AI proposals | AI consolidates/optimises your schedule | Sage / Evergreen |
| Area Scan + AI Area Coach | Scan a garden area → AI assessment & advice | Sage / Evergreen |
| Garden Overhaul | Photo → AI redesign + concept images | Sage / Evergreen |
| AI Grow Guides | 9-section AI-generated grow guide per plant | Sage / Evergreen |
| Companion suggestions (AI) | AI companion-planting ideas | Sage / Evergreen |
| Seasonal Picks / Weekly Overview (AI tips) | AI-grounded seasonal advice (rule-based fallback for free tiers) | Sage / Evergreen |
| Plant Visualiser — AI sprite generation | AI-drawn plant icons for the visualiser | Sage / Evergreen |

**Hourly rate limits** scale by tier (Sprout 0 → Botanist low → Sage mid → Evergreen high) — see
`HOURLY_RATE_LIMITS` in `src/constants/tiers.ts`.

---

## 3. Species-database features — need Botanist or Evergreen (`enable_perenual`)

Also **enforced server-side** (the `perenual-proxy` / `verdantly-search` functions recheck
`enable_perenual`).

| Feature | What it does | How to get it |
|---------|--------------|---------------|
| Perenual species database | 10,000+ species with detailed, accurate care data | Botanist / Evergreen |
| "Search more databases" (external plant search) | Search Perenual **and Verdantly** beyond the local library | Botanist / Evergreen |
| Detailed per-plant care schedules | Watering/sunlight/cycle pulled from the species DB | Botanist / Evergreen |
| Watchlist — Perenual pest/disease search | Curated pest & disease records | Botanist / Evergreen |
| Companion lookups via Verdantly | Verdantly-sourced companion data | Botanist / Evergreen |

> Note: **Verdantly is now gated like Perenual** (it used to be free). Both live behind
> `enable_perenual`, everywhere (search box, detail loads, companion peek), client + server.

### Default search source (a perk for entitled users)

If you have **either** `enable_perenual` **or** `ai_enabled`, you can choose in **Account → Default
search source** which source plant searches (and the Watchlist search) run **first** by default —
Library, Verdantly, Perenual, or Rhozly AI — instead of always Library-first. Library stays the
default for everyone; the choices are entitlement-clamped (you only see sources you can use).

---

## 4. Modular-gated features — wired, currently OPEN to everyone

These are neither AI nor Perenual. Each is wrapped in a `<FeatureGate>` and listed in
`FEATURE_GATES` — **all currently set to `ALL` tiers, so everybody has them today.** They exist as a
ready-to-flip switch: change one line and the feature instantly becomes a paid perk for the tiers you
choose (and disappears / shows an upgrade nudge for everyone else, immediately, no grandfathering).

| Feature key | What it is | Today | Flip to gate it |
|-------------|-----------|-------|-----------------|
| `light_sensor` | Lux meter + light-band + plant comparison | Open to all | e.g. `PAID` |
| `garden_layout` | Shape-based garden map editor | Open to all | e.g. `PAID` |
| `garden_layout_3d` | 3D garden view | Open to all | e.g. `["sage","evergreen"]` |
| `sun_tracker` | AR sun-path overlay | Open to all | e.g. `PAID` |
| `microclimate` | Sun/wind/frost report per area | Open to all | e.g. `PAID` |
| `visualiser` | AR / 2D plant visualiser (AI sprites still need Sage+) | Open to all | e.g. `PAID` |
| `nursery` | Seed packets + sowings + plant-out lifecycle | Open to all | e.g. `PAID` |
| `garden_walk` | Guided plant-by-plant garden tour | Open to all | e.g. `PAID` |
| `shopping` | Shopping lists | Open to all | e.g. `PAID` |
| `guide_authoring` | Writing/publishing community guides (reading stays free) | Open to all | e.g. `PAID` |
| `integrations` | Smart devices, automations, soil readings | Open to all | e.g. `["evergreen"]` |
| `multiple_homes` | Creating more than one home | Open to all | e.g. `["evergreen"]` |
| `ics_export` | Export calendar tasks as .ics | Open to all | e.g. `PAID` |

`PAID` = `["botanist","sage","evergreen"]` (any paid tier). `ALL` = every tier including Sprout.

---

## 5. For the owner — how to actually gate a feature

Open [`src/constants/tierFeatures.ts`](../src/constants/tierFeatures.ts) and change the feature's
allow-list. That's the whole change — it flows through `<FeatureGate>` everywhere automatically:

```ts
export const FEATURE_GATES: Record<Feature, TierId[]> = {
  light_sensor: PAID,                    // now Botanist+ only
  multiple_homes: ["evergreen"],         // now Evergreen only
  garden_layout_3d: ["sage", "evergreen"],
  // …everything else stays ALL (open)
};
```

Notes:
- **Lattice-safe:** it's an explicit allow-list, not a "minimum tier", so you can include any
  combination of tiers (handles Sage ≠ Botanist+ correctly).
- **Cut-off is immediate** — when you flip a gate it applies to all non-entitled users at once (no
  grandfathering), per the agreed policy.
- **Enforcement depth:** the cheap visual tools are gated **client-side only** (fine — they cost
  nothing per use). The two real resource limits — `multiple_homes` and `guide_authoring` — should
  **also get an RLS check** server-side when you actually gate them, so they can't be bypassed. That
  RLS work is the only extra step beyond editing the config.
- When you flip a gate, update that surface's `docs/app-reference/` "Tier gating" section + the
  gated-surfaces table in
  [`17-tier-gating.md`](app-reference/99-cross-cutting/17-tier-gating.md).

---

## Related documents

- [Tier Gating reference](app-reference/99-cross-cutting/17-tier-gating.md) — the technical contract.
- [Tier-gating features analysis](plans/tier-gating-features-analysis.md) — the work breakdown +
  decisions behind the modular mechanism.
- [Plant Search](app-reference/99-cross-cutting/36-plant-search.md) — library-first search + the
  default-search-source preference.
- `src/constants/tiers.ts` — tier definitions, prices, AI rate limits.
- `src/constants/tierFeatures.ts` — the modular feature-gate config.
