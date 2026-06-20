# Search-source preference — let entitled users pick their default first source

## Goal

Today every plant/ailment search is **library-first** (free, instant) with external DBs + AI as
opt-in buttons. Let a user who has the entitlement (**API access** = Perenual/Verdantly, **AI
access** = `ai_enabled`) set, in **Settings**, which source the search runs **first by default** —
e.g. "search Perenual first" or "Verdantly first" or "AI first" — instead of the library. The other
sources remain available (as the opt-in fallbacks). Library stays the default for everyone who
doesn't change it.

## App-reference consulted

- `99-cross-cutting/36-plant-search.md` (the unified library-first engine + the per-surface migration
  table), `25-plant-providers.md` (Perenual/Verdantly/AI + `searchAllProviders`), `17-tier-gating.md`
  (`enable_perenual` / `ai_enabled`), `06-account/01-account-tab.md` (where settings live),
  `06-ailments-watchlist` refs + `06-data-model-ailments.md`.

## Analysis — every search surface today

| Surface | Engine | Order today | Sources |
|---------|--------|-------------|---------|
| **Plant search** (Shopping, `/library`, Add-to-Shed/BulkSearchModal, Nursery, Companions) | shared `<PlantSearch>` + `unifiedPlantSearch.ts` | `searchLibrary` auto (debounced 350ms) → **opt-in** `searchExternal` (Perenual+Verdantly) → **opt-in** AI (`createWithAI`/`aiSuggestPlantNames`) | library (all), Verdantly (all, free), Perenual (`enable_perenual`), AI (`ai_enabled`) |
| **Watchlist / ailments** (`AilmentWatchlist`) | bespoke tiered search | `ailment_library` filter (auto) → Perenual pest/disease (`searchPestDisease`, manual) → AI (`generate-ailment-suggestions`, manual) | ailment_library (all), Perenual pest/disease (`enable_perenual`), AI (`ai_enabled`). **No Verdantly here.** |
| **AI Chat** (`agent-chat`) | assistant tools | the AI decides when to call `list/search` tools | n/a — conversational, not a search box |
| **Plant Doctor text search** | `search-plants-ai` | AI-only text search | AI |

- `searchAllProviders(query, filters, only?, options?)` already supports **restricting to specific
  providers** via `only` and fanning to AI via `options.includeAi` — so "run provider X first" is a
  thin call, no engine rewrite.
- Globally-enabled providers come from `app_config.plant_providers` (`getEnabledProviders`). The
  preference must be a subset of {enabled} ∩ {entitled}.
- **AI Chat + Plant Doctor text are out of scope** — they're AI-native; there's no "library vs API"
  choice to expose, and forcing a non-AI first source there would break the feature.

## The preference model

Store on `user_profiles` (jsonb, syncs across devices — mirrors `voice_settings`):

```jsonc
search_settings: {
  plant_source:   "library" | "verdantly" | "perenual" | "ai",   // default "library"
  ailment_source: "library" | "perenual" | "ai",                  // default "library" (Phase 2)
}
```

- **One choice per domain** (plant vs ailment) — the user "selects one preference". A single value
  folds the "Verdantly *or* Perenual" choice in (they pick the source directly).
- **Entitlement filter** (only show options the user can use):
  - `library` — everyone.
  - `verdantly` — **`enable_perenual`** (now tier-gated like Perenual — see below).
  - `perenual` — `enable_perenual`.
  - `ai` — `ai_enabled`.
- So the setting appears only for users with **API access (`enable_perenual`) or AI access
  (`ai_enabled`)**. Sprout users have the library only — nothing to choose.
- A user whose entitlement for the saved preference disappears (e.g. downgrades) **falls back to
  library** at read time — the UI never offers, and the engine never runs, a source they can't use.

## Verdantly re-gating (confirmed) — Verdantly is no longer free

Today Verdantly returns real results for **all** tiers (Perenual "self-gates" with upgrade
placeholders; Verdantly does not). We're changing Verdantly to be gated **exactly like Perenual**
(`enable_perenual` / Botanist+). Concretely in the plant-search path:

- `<PlantSearch>`'s external tier (`searchExternal` = Perenual + Verdantly) becomes gated:
  `canSearchExternal` flips from the current hard-coded `true` to **`isPremium` (`enable_perenual`)**
  at every host. For a Sprout user the "Search more databases" CTA becomes an **upgrade nudge**, not a
  live button (matching how AI-create already nudges).
- **Free-tier impact (intended):** Sprout users now get the library only in search — no Verdantly
  results. The tier-gating doc + `36-plant-search.md`'s tier table need updating to match.

**Scope question (open):** does "Verdantly gated like Perenual" apply *only to the search box*, or
**everywhere Verdantly is used** — Companion lookups (`companion-planting` Verdantly path + the
Companions ⓘ-peek fallback) and `getProviderPlantDetails` (Verdantly full record)? Gating only the
search box is the contained change; gating Verdantly globally is consistent but touches companions +
detail loads too. See open question 5.

## How it changes each surface

### A. Plant search (`<PlantSearch>` — the main win, one change covers 5 hosts)

- Hosts already pass `gates` + `isPremium`/`isAiEnabled`. Add a `preferredSource` input. Either:
  - **(preferred)** read it inside `<PlantSearch>` via a small `useSearchPreference()` hook (one
    fetch of `user_profiles.search_settings`, cached) — zero host changes; or
  - pass `preferredSource` as a prop from each host (more wiring).
- In `runLibrary` (the debounced on-type handler), branch on `preferredSource`:
  - `"library"` → unchanged (current behaviour).
  - `"verdantly"` / `"perenual"` → auto-run `searchExternal(query, { only: [source] })` and render
    those first; library + the *other* external + AI become the opt-in buttons.
  - `"ai"` → auto-run the AI path (`searchExternal(includeAi)` / `aiSuggestPlantNames`); library +
    external opt-in.
- **Always keep library reachable** as a one-tap fallback (it's free + the safety net), and **fall
  back to library automatically if the preferred source returns nothing** (so a thin Perenual result
  never dead-ends).
- Extend `searchExternal` with an `only?: ("perenual"|"verdantly")[]` passthrough to
  `searchAllProviders` (already supported).
- Cost note: making Perenual/AI the *auto* (per-keystroke, debounced) source raises API/AI spend vs
  the free library. Mitigate: keep the 350ms debounce, require a min query length before auto-firing
  the paid source, and (AI) reuse the existing rate limits + `companion_cache`/library write-back.

### B. Watchlist (`AilmentWatchlist`) — Phase 2

- Analogous: `ailment_source` preference drives whether `searchPestDisease` (Perenual) or
  `generate-ailment-suggestions` (AI) runs first instead of the `ailment_library` filter. No Verdantly.

### C. Settings UI (GardenerProfile account tab)

- New "Default search source" section (mirrors `VoiceSection`): a `<select>` populated with the
  entitled options; writes `user_profiles.search_settings` (merge-patch, same pattern as voice). Show
  it only when the user has ≥1 non-library entitlement (Verdantly is free, so effectively everyone —
  see open question 1).

## Files in scope

- `supabase/migrations/<ts>_search_settings.sql` — `user_profiles.search_settings jsonb` (nullable;
  no grant needed, existing table).
- `src/lib/unifiedPlantSearch.ts` — `searchExternal(only?)` passthrough.
- `src/lib/searchPreference.ts` (new) + `useSearchPreference()` hook — read/normalise/entitlement-clamp.
- `src/components/shared/PlantSearch.tsx` — preferred-source branch in `runLibrary` + auto-fallback.
- `src/components/GardenerProfile.tsx` — the settings section.
- `src/components/AilmentWatchlist.tsx` — Phase 2.
- Docs: `36-plant-search.md`, `25-plant-providers.md`, `01-account-tab.md`, `17-tier-gating.md`.
- Tests: Vitest for `searchPreference` (entitlement clamp + default) and the `searchExternal` `only`
  passthrough; a Playwright row for the settings control + a preferred-source search.

## Risks / edge cases

- **Cost** — paid sources as the *auto* per-keystroke source increases spend; mitigations above.
- **Entitlement drift** — downgrade must clamp to library (handled at read time).
- **Empty preferred result** — auto-fallback to library so search never dead-ends.
- **`app_config` disables a provider** — preference inters­ects with `getEnabledProviders`; if the
  preferred provider is globally off, fall back to library.
- **Per-surface override** — some hosts (Companions ⓘ-peek) deliberately avoid AI; the preference
  should apply to the *primary search box*, not those internal resolution paths (scope to `<PlantSearch>`'s
  main results only).

## Phasing

1. **Phase 1 — Plant search:** migration (`search_settings`) + Verdantly re-gating
   (`canSearchExternal` → `enable_perenual` across hosts) + `useSearchPreference` +
   `<PlantSearch>` preferred-source branch + settings UI + tests + docs. (Covers all 5 hosts.)
2. **Phase 2 — Watchlist:** the `ailment_source` preference in `AilmentWatchlist`.

## Decisions (confirmed)

1. ✅ **Verdantly is tier-gated like Perenual** (`enable_perenual`). The setting appears only for
   users with API access (`enable_perenual`) or AI access (`ai_enabled`); Sprout = library only.
2. ✅ **Per-domain** preferences — `plant_source` (Phase 1) + `ailment_source` (Phase 2), separate.
3. ✅ **Auto-fall-back to library** when the preferred source returns nothing.
4. ✅ **Cost control** — min query length + 350ms debounce before auto-firing a paid source; not
   every keystroke.

## Decision (confirmed)

5. ✅ **(b) Gate Verdantly everywhere** — search box + Companion lookups (`companion-planting`
   Verdantly path + Companions ⓘ-peek fallback) + `getProviderPlantDetails` Verdantly. Verdantly now
   requires `enable_perenual` wherever it's used, identical to Perenual. (Edge case to handle: a free
   user with an already-saved Verdantly plant — detail view should degrade gracefully, not hard-error.)
