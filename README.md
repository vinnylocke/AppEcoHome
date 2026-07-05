# Rhozly

**Rhozly** is a plant-care and garden-management Progressive Web App (PWA) with a native mobile wrapper. It helps gardeners manage their plants, schedule care tasks, diagnose plant problems with AI, and get weather-aware gardening insights.

Live app: **[rhozly.com](https://rhozly.com)**

---

## What it does

- **The Shed** — your plant inventory, with a 10,000+ species database, AI identification, and per-plant care guides.
- **Tasks & Schedules** — one-off tasks plus recurring "blueprints" that auto-generate weather-aware tasks.
- **Plant Lens** — camera-first AI: identify a plant, diagnose disease/pests, and get suggested care tasks.
- **Planner, Watchlist, Nursery, Shopping** — plan projects, track ailments, log sowings, and build shopping lists.
- **Garden Layout & Visualiser** — draw your plot to scale, link beds to real areas, and read sun/microclimate per bed.
- **Smart-home integrations** — connect soil sensors and smart valves (Ecowitt, eWeLink, custom webhooks) and automate watering.
- **Head Gardener** — a proactive AI assistant that learns your habits and briefs you on the week ahead.

The four subscription tiers (**Sprout → Botanist → Sage → Evergreen**) gate the species database and the AI features — see [`src/constants/tiers.ts`](src/constants/tiers.ts).

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router v6 |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions (Deno/TypeScript) |
| AI | Google Gemini (via Supabase Edge Functions only — never from the browser) |
| Mobile | Capacitor (iOS/Android wrapper over the PWA) |
| Weather / plants | Open-Meteo, Perenual, Verdantly, Pl@ntNet, Unsplash |
| Notifications | Firebase (push) |

---

## Getting started

```bash
npm install --legacy-peer-deps
```

Create a `.env` with your Supabase project details (and API keys for the services you use):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
# server-side / tooling
SUPABASE_PROD_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run the dev server:

```bash
npm run dev
```

For local backend work, use the Supabase CLI (`supabase start`, `supabase migration up`). See [`docs/deployment.md`](docs/deployment.md).

---

## Testing

Three tiers — see [`TESTING.md`](TESTING.md) for the full guide.

```bash
npm run test:unit        # Vitest — src/lib pure functions & hooks
npm run test:functions   # Deno — edge-function shared logic
npm run test:e2e         # Playwright — browser E2E (seeded Supabase)
npm run test:all         # all three
npm run typecheck        # real type check (tsconfig.app.json)
```

---

## Building & deploying

```bash
npm run build            # production build
npm run deploy           # maintenance ON → migrations → Vercel → maintenance OFF
```

Always deploy with `npm run deploy` — it runs the type/schema gates, pushes DB migrations and edge functions, and manages maintenance mode. Never deploy by pushing to GitHub alone. Full process: [`docs/deployment.md`](docs/deployment.md).

---

## Where to look next

| Doc | Purpose |
|-----|---------|
| [`CLAUDE.md`](CLAUDE.md) | Project conventions, directory structure, and working practices |
| [`docs/app-reference/00-INDEX.md`](docs/app-reference/00-INDEX.md) | The master reference — every UI surface and cross-cutting concern |
| [`TESTING.md`](TESTING.md) | The three-tier testing framework |
| [`docs/deployment.md`](docs/deployment.md) | Deployment pipeline & rollback |
| [`documentation/`](documentation/) | End-user help guides (also shown in the in-app Help Center) |

---

## Repository layout

```
src/               React app — components, lib, hooks, services, context
supabase/          Postgres migrations + Deno edge functions
documentation/     End-user help guides (rendered in-app)
docs/              Technical docs — app-reference, plans, testing, deployment
tests/             Vitest unit + Playwright E2E
```
