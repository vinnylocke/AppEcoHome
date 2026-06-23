# Credits & Sources page — expand `/credits` beyond images

## Goal

Turn the image-only `/credits` page into a single **Credits & Sources** page that attributes **every external source of information** Rhozly uses — plant data, plant ID, pest/disease data, weather, images, and AI — and says **what each provides and where it's used**, with licence links. The existing per-image credit popover keeps working and keeps linking here.

## App-reference consulted

- `99-cross-cutting/24-image-sources.md` (image providers + `imageCredit`), `25-plant-providers.md` (Perenual/Verdantly), `13-ai-gemini.md` (Gemini/Imagen), `27-weather.md` (Open-Meteo + pollen), `10-edge-functions-catalogue.md` (which fn calls what). Source file: `src/components/CreditsPage.tsx` + `src/lib/imageCredit.ts`.

## The source inventory (grounded — to render on the page)

Grouped by category; each entry = **what it provides · where it's used (surfaces + the module/fn that calls it) · licence note**.

- **Plants & species** — **Perenual** (species/care data + pest/disease search; Plant search, Plant details; `perenual-proxy`, `perenualService.ts`), **Verdantly** (curated species + companion planting; Plant search, Companion tab; `verdantly-search`), and the **plant-library seeding sources** GBIF · Wikidata · Wikipedia · iNaturalist (background catalogue building/verification only; `seed-plant-library`, `verify-plant-library`).
- **Plant identification** — **Pl@ntNet** (photo ID; Plant Doctor identify; `_shared/plantnet.ts` via `plant-doctor`), **Google Gemini Vision** (cross-check ID, diagnosis, Multi-ID; `plant-doctor`, `plant-doctor-ai`).
- **Pests & diseases** — **Perenual** (pest/disease catalogue), **Gemini** (AI diagnosis + ailment workups; `plant-doctor`, `generate-ailment-suggestions`).
- **Weather & environment** — **Open-Meteo** (forecast → Weather tab, alerts, automations; `sync-weather`), **Open-Meteo Air-Quality** (pollen; `fetch-pollen`), **sunrise/sunset calculation** (Golden-Hour timing; `notificationTiming.ts`).
- **Images** — Perenual · Verdantly · Wikipedia/Wikimedia Commons · Pixabay · iNaturalist · Unsplash · Pl@ntNet (all via `plant-image-search`), **AI images** (Google Imagen, garden overhaul; `generate-garden-overhaul`), and **your own uploads**. (These are the existing entries — kept.)
- **AI** — **Google Gemini** (text + vision across Plant Doctor, guides, planner, Head Gardener, insights; edge-function-only, logged to `ai_usage_log`) and **Imagen 4** (concept images).

> Excluded as delivery infrastructure rather than information sources (unless you want them listed): Firebase Cloud Messaging (push), Resend (email), Stripe (billing), Supabase (auth/DB). I can add a short "Infrastructure" footnote if you'd like them acknowledged.

## Design

1. **Extract the data** into `src/constants/dataSources.ts` — a typed list: `{ id, name, category, provides, usedIn: string[], licenseUrl?, note, tint? }`. Reuse `PROVIDER_LABEL/TINT/PROVIDER_DEFAULT_LICENSE_URL` from `imageCredit.ts` where an id overlaps (the image providers), so styling stays consistent.
2. **Rewrite `CreditsPage.tsx`** to render **grouped sections** by category (Plants · Plant ID · Pests & diseases · Weather · Images · AI), each a card list (same card style as today) showing provider chip · what it provides · **"Used in: …"** line · licence link. Header changes from "Image credits" → **"Credits & Sources"** / "Where Rhozly's information comes from". Keep the existing footer note + the misattribution contact line.
3. **Keep image attribution behaviour unchanged** — the per-image `CreditPopover` still deep-links to `/credits`; image-provider entries remain (now under the "Images" group).
4. **Discoverability** — add a "Credits & sources" link in the Profile/Settings page (and keep the existing entry points). Confirm where `/credits` is currently linked from and add one obvious settings link if missing.

## Files

- `src/constants/dataSources.ts` — **new** (the inventory).
- `src/components/CreditsPage.tsx` — rewrite to grouped categories.
- A Profile/Settings surface — add a "Credits & sources" link (TBD which file; `GardenerProfile.tsx`).

## Tests

- **Vitest** `tests/unit/lib/dataSources.test.ts` — every source has `name`, `category`, `provides`, non-empty `usedIn`; categories are from the known set; ids that overlap image providers resolve a label/tint.
- **Playwright** — extend/keep the credits spec: `/credits` renders the heading + at least one card per category (`credits-category-*` / existing `credits-provider-*` testids).

## Docs

- `24-image-sources.md` (note the page is now broader), a short cross-link from `25-plant-providers` / `13-ai-gemini` / `27-weather`, and the CreditsPage app-reference if one exists; `TESTING.md` + e2e-test-plan credits rows.

## Decisions to confirm

1. **Scope** — information sources only (plants/ID/pests/weather/images/AI), or also list delivery infrastructure (push/email/billing/auth) under an "Infrastructure" footnote?
2. **Seeding-only sources** (GBIF/Wikidata/Wikipedia/iNaturalist used only for background library building) — list them in full, or a single "Plant library is built + verified against GBIF, Wikidata, Wikipedia & iNaturalist" line?
3. **"Used in" detail level** — user-facing surface names (e.g. "Plant Doctor", "Weather tab") rather than function names (recommended for a user-facing page).
