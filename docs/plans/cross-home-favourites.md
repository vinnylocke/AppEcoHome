# Cross-Home Favourites — Plants, Nursery Seeds, Watchlist Ailments

**Status: PLAN — awaiting approval. No code written.**

---

## 1. Goal

Today, plants (`plants`), seed packets (`seed_packets`), and ailments (`ailments`) are **home-scoped**: every home member sees the same list, and when a user switches home (via `handleSwitchHome` → `user_profiles.home_id`) the list re-roots to the new home. Nothing follows the *user*.

This feature adds a **personal, cross-home favourites layer** on top of the existing home-scoped data:

- Each of the three surfaces gets a two-tab structure: **Home** (today's home-scoped list, unchanged data) and **Favourites** (new, user-scoped, empty on launch).
- On the **Home** tab, every card gains a "save to favourites" affordance (heart). Saving copies a snapshot of the row into the user's favourites.
- On the **Favourites** tab, every card gains an "add to this home" affordance, which creates a *new* home-scoped row in the currently active home (copy semantics — never moves or links the original).
- Favourites **persist across home switches** and across leaving/joining homes — they are keyed on `user_id`, not `home_id`.
- **Tier gating is unchanged**: a Sprout user may *see* an API/AI-sourced plant a housemate added (already true today), and may favourite it, but every AI/API-powered interaction (refresh care guide, generate grow guide, companions AI, Ask AI, provider re-fetch, ailment AI suggest, packet scan) stays locked exactly as it is now. Favouriting and adding-to-home involve **zero** AI/API calls, so they are open to all tiers (pending confirmation — Open Question 5).

## 2. App-reference files consulted

- `docs/app-reference/03-garden-hub/01-the-shed.md` — Shed component graph, `useCachedShed`, viewTab (active/archived), Plants/Nursery toggle, tier gating, `shed.add`/`shed.delete` permissions
- `docs/app-reference/03-garden-hub/02-watchlist.md` — Watchlist tabs (Active/Archived), tiered add search, `SOURCE_META`, `ailments.add`/`ailments.delete`
- `docs/app-reference/03-garden-hub/10-nursery.md` — packet lifecycle, `seed_packets_with_germination`, `plant_id` nullable link, Plant Out → `inventory_items.from_sowing_id`, seed-packet-images bucket path is home-scoped
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — `plants.home_id` NULL = global catalogue row, `scientific_name_key`, `forked_from_plant_id`, `overridden_fields`, dedup indexes, `user_plant_ack` (a user-scoped table keyed to *global* plant ids — precedent for cross-home user state)
- `docs/app-reference/99-cross-cutting/06-data-model-ailments.md` — `ailments` (per-home) vs `ailment_library` (global, `name_key` dedup), `plant_instance_ailments`
- `docs/app-reference/99-cross-cutting/01-data-model-home.md` — home graph, multi-home membership, active-home tracking
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` — `ai_enabled` / `enable_perenual` flags, `FEATURE_GATES` / `FeatureGate` / `UpgradeNudge`, identify quota, client + server (`aiGuard`) enforcement
- `docs/app-reference/99-cross-cutting/25-plant-providers.md` — source semantics (`manual|api|ai|verdantly`; library plants = `source='ai'` fork of a global; ailments have a first-class `library` source), entitlement clamping
- `docs/app-reference/99-cross-cutting/19-rls-patterns.md` — home-member pattern, `(SELECT auth.uid())` requirement, user-scoped table pattern, plants global-row special case
- `docs/app-reference/07-management/03-multiple-homes.md` (via 01-data-model-home cross-link) — home switching UX

Source verified: `supabase/migrations/20260401072454_remote_schema.sql` (plants base), `20260624000500_nursery.sql` (seed_packets/seed_sowings + RLS), `20260429000000_ailments_watchlist.sql` (+ `20260824000000` source check now `manual|perenual|ai|library`), `20260603000000_guide_bookmarks.sql` (user-scoped RLS precedent), `src/App.tsx` (`handleSwitchHome`, GardenHub routing, `/watchlist` → `/shed?tab=watchlist` redirect), `src/components/GardenHub.tsx` (`?tab=` param), `src/components/TheShed.tsx` (viewTab pills, `view` plants/nursery toggle, `?open=add-plant` / `?query=` deep-links), `src/components/AilmentWatchlist.tsx` (Active/Archived pills), `src/components/PlantEditModal.tsx` (per-tab gating via `aiEnabled`/`isPremium` props), `supabase/functions/image-proxy/index.ts` (plant images land at `plant-images/perenual-imports/…`, public bucket, **not** home-scoped), `scripts/seed-test-account.mjs`, `docs/plans/seed-sprout-complete-data.md`, `docs/plans/seed-test-accounts.md`, `supabase/seeds/` (worker fixtures; next free seed slot = 15).

---

## 3. Architecture — options evaluated

### Option (a) — user-scoped clone rows on the existing tables (`owner_user_id`, `home_id NULL`)

Rejected. `plants.home_id IS NULL` **already means "global catalogue row"** — the AI dedup indexes (`plants_ai_global_dedup_idx`), the RLS special-case (`home_id IS NULL AND source <> 'ai'` writable), the cron scans, and `useAiPlantFreshness` all depend on that semantic. Overloading NULL-home rows as "someone's favourite" would poison every one of those paths. `seed_packets.home_id` and `ailments.home_id` are `NOT NULL` with home-member RLS — relaxing them means touching every policy and every `.eq("home_id", …)` query in the app. Clones also diverge silently from the home row with no way to tell "favourite" from "catalogue" in queries. Highest blast radius, worst semantics.

### Option (b) — per-type favourites tables (reference + denormalised snapshot) ✅ RECOMMENDED

One narrow table per type — `user_favourite_plants`, `user_favourite_ailments`, `user_favourite_seed_packets` — each holding:

- `user_id` (RLS key — pure user-scoped policies, precedent: `guide_bookmarks`, `user_plant_ack`),
- a **canonical reference** where one exists (plants → the *global* `plants` row via `forked_from_plant_id` resolution, or NULL; ailments → `ailment_library.id`, or NULL; packets → none exists), `ON DELETE SET NULL`,
- a **denormalised snapshot** (`snapshot jsonb` + a few promoted columns: name, source, image) captured at favourite time, so the favourite keeps rendering after the origin home row is edited/deleted or the user leaves the home,
- an **identity key** for dedupe (unique per user).

Why this wins: typed FKs give correct delete behaviour per referenced table; per-type dedupe keys differ genuinely (plants: scientific-name key; ailments: library `name_key`/name; packets: variety+plant); per-surface queries are trivial indexed reads; the "is this Home-tab row already favourited?" heart-fill check is a cheap client-side join on the identity key; and "add to home" reuses each surface's **existing** save path so all provenance columns, constraints, and RLS behave exactly as today. Crucially, **`inventory_items.plant_id` is never touched** — favouriting doesn't move the home row, and adding a favourite into a home creates a brand-new home-scoped `plants` row that future instances reference normally.

### Option (c) — single polymorphic `user_favourites` (`kind` + `payload jsonb`)

Rejected. One migration instead of three, but: no FK integrity to `plants`/`ailment_library` (stale refs accumulate), dedupe requires fragile partial unique indexes over jsonb expressions per kind, the source/tier data lives buried in jsonb (harder to badge + gate), and every consumer pays a `kind` filter + payload parse. The three types' identity semantics are different enough that the "one table" saving is illusory — the branching just moves into application code.

### Recommended data design (Option b) — behavioural rules

| Scenario | Behaviour |
|---|---|
| Origin home row **edited** after favouriting | Favourite is unaffected (snapshot). For plants whose favourite resolves to a **global catalogue row** (`catalogue_plant_id` set), the Favourites card displays live catalogue data (name/care/image) with snapshot as fallback — so AI catalogue refreshes flow through, exactly like `user_plant_ack` semantics. Manual/api/verdantly favourites are pure snapshot. |
| Origin home row **deleted** | Favourite survives on its snapshot. (`favourited_from_home_id` is informational only, `ON DELETE SET NULL`.) |
| User **leaves the home** | Favourites untouched — no `home_id` in the RLS predicate. |
| **Add to home** (from Favourites tab) | Copy semantics via the surface's existing insert path: plants → `saveToShed`-equivalent insert (`source` preserved; if `catalogue_plant_id` resolves, insert a home fork with `forked_from_plant_id` = global id + seed `user_plant_ack`, mirroring today's library-add flow — zero AI spend); ailments → `ailments` insert (source preserved: `library` rows keep `library`); packets → `createSeedPacket` (`plant_id` linked only if the same plant identity already exists in the target home, else NULL — the packet-detail "link plant" nudge already handles that). |
| **Duplicate detection** | Favouriting: unique `(user_id, identity_key)` — re-favouriting is a no-op (heart already filled). Adding to home: pre-check the target home for a row with the same identity (plants: `scientific_name_key`-style match, falling back to case-insensitive `common_name`; ailments: case-insensitive `name`; packets: variety + plant name). If found → button reads "In this home" (disabled) instead of inserting a duplicate. |
| **Home switch** | Favourites tab content identical before/after; Home tab re-roots. No extra work — the favourites query has no `home_id`. |
| **Images** | Plant images are public-bucket URLs (`plant-images/perenual-imports/…`, not home-scoped) → safe to store in the snapshot. Ailment `thumbnail_url`s are library/Perenual/public URLs → safe. **Seed-packet images are home-scoped** (`seed-packet-images/{home_id}/{packet_id}.jpg`) → phase 3 either copies the object to a user-scoped path on favourite or omits packet images (Open Question 6). |
| **Permissions** | Favouriting + un-favouriting = personal, no `PermissionKey` gate. "Add to home" respects the existing home write paths: `shed.add` / `ailments.add` client gates + home-member RLS (packets: home-membership only, matching the Nursery's existing model). |
| **RLS** | Pure user-scoped — `USING (user_id = (SELECT auth.uid()))` on all ops. First user-scoped tables on these three surfaces, but a well-worn pattern elsewhere (`guide_bookmarks`, `user_plant_ack`, `ai_plant_manual_refresh_log`). |

---

## 4. Schema DDL sketch (one migration, `20260xxx_user_favourites.sql`)

```sql
-- ============================================================
-- CROSS-HOME FAVOURITES — user-scoped saves of plants,
-- ailments, and seed packets. Snapshot + optional canonical ref.
-- ============================================================

CREATE TABLE public.user_favourite_plants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Canonical ref: the GLOBAL catalogue plants row (home_id IS NULL) when the
  -- favourited home row was a fork / library / AI-catalogue plant. NULL for
  -- manual + provider rows with no global parent.
  catalogue_plant_id  int REFERENCES public.plants(id) ON DELETE SET NULL,
  source              text NOT NULL CHECK (source IN ('manual','api','ai','verdantly')),
  common_name         text NOT NULL,
  scientific_name     jsonb NOT NULL DEFAULT '[]'::jsonb,
  identity_key        text NOT NULL,   -- lowercased first scientific name, else lowercased common name (computed client-side by the service, mirroring scientific_name_key)
  image_url           text,
  perenual_id         int,             -- carried so "add to home" reproduces provider linkage
  verdantly_id        text,
  snapshot            jsonb NOT NULL,  -- full care-card payload at favourite time
  favourited_from_home_id uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, identity_key)
);

CREATE TABLE public.user_favourite_ailments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  library_id          uuid REFERENCES public.ailment_library(id) ON DELETE SET NULL,
  source              text NOT NULL CHECK (source IN ('manual','perenual','ai','library')),
  name                text NOT NULL,
  ailment_type        text NOT NULL CHECK (ailment_type IN ('invasive_plant','pest','disease')),
  identity_key        text NOT NULL,   -- lowercased name (library name_key where available)
  thumbnail_url       text,
  snapshot            jsonb NOT NULL,  -- description, symptoms, prevention_steps, remedy_steps, scientific_name, perenual_id
  favourited_from_home_id uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, identity_key)
);

CREATE TABLE public.user_favourite_seed_packets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- No canonical seed library exists; the nearest anchor is the plant identity.
  catalogue_plant_id  int REFERENCES public.plants(id) ON DELETE SET NULL,
  plant_common_name   text,
  variety             text,
  vendor              text,
  identity_key        text NOT NULL,   -- lower(coalesce(variety,'') || '|' || coalesce(plant_common_name,''))
  snapshot            jsonb NOT NULL,  -- sow_by, notes, quantity descriptor etc. (reference data, NOT live stock)
  favourited_from_home_id uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, identity_key)
);

-- Indexes: the UNIQUE above covers the hot dedupe path; add per-user list index.
CREATE INDEX user_fav_plants_user_idx   ON public.user_favourite_plants (user_id, created_at DESC);
CREATE INDEX user_fav_ailments_user_idx ON public.user_favourite_ailments (user_id, created_at DESC);
CREATE INDEX user_fav_packets_user_idx  ON public.user_favourite_seed_packets (user_id, created_at DESC);

-- RLS — pure user-scoped (a first for these surfaces; pattern = guide_bookmarks).
ALTER TABLE public.user_favourite_plants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favourite_ailments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favourite_seed_packets  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own favourite plants" ON public.user_favourite_plants
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
-- (identical policy on the other two tables)

-- Data API grants (mandatory per CLAUDE.md convention for all new tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favourite_plants       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favourite_ailments     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favourite_seed_packets TO authenticated;
-- No anon grants — favourites are always authenticated.
```

Notes:
- `snapshot` for plants = the promoted columns of the home `plants` row (watering, sunlight, cycle, care_level, description, hardiness, `data` payload subset). It is deliberately **not** the whole `data` jsonb blob unbounded — the service caps it to the fields `ManualPlantCreation`/the card renders.
- No realtime channels needed (per-user data, mutated only by the same client; simple refetch on tab focus).
- No new edge functions, no cron, no storage buckets (phase 1–2). No `ai_usage_log` impact — zero AI calls.

---

## 5. Per-surface UI changes

### Naming recommendation

**"Home | Favourites"** as a two-pill scope switch (same visual language as the existing Active/Archived pills). "Home" = the shared, home-scoped list (today's data, unchanged); "Favourites" = the personal cross-home list. The user's phrasing "rename the main one to Favourites" inverts this — but today's main list *is* the home-scoped data, so it must map to the **Home** tab; **Favourites starts empty** (see Open Questions 1 + 2).

### 5.1 The Shed (`src/components/TheShed.tsx`)

- New scope pills **Home | Favourites** rendered above the existing Active/Archived viewTab pills (Plants view only — the Nursery toggle has its own, §5.2). Deep link: **`/shed?scope=favourites`** — a *new* param; the existing `?tab=` (GardenHub: shed/watchlist/senescence), `?open=add-plant`, `?query=` params and the `/watchlist` → `/shed?tab=watchlist` redirect are untouched and keep working.
- **Home scope (default)**: today's grid exactly as-is, plus a heart button on each `PlantCard` (`data-testid="favourite-plant-<id>"`). Filled when the plant's identity key is in the user's favourites; tap toggles save/remove (optimistic, toast).
- **Favourites scope**: a simpler grid of favourite cards — image, common/scientific name, source badge (reusing the existing badge component), "Saved from <home name>" caption, and two actions: **Add to this home** (`data-testid="favourite-add-to-home"`; disabled → "In this home" when the identity already exists in the active home) and **Remove** (unfavourite, confirm-less, undo-toast). Tapping a favourite card opens a read-only detail view (snapshot render; when `catalogue_plant_id` resolves, live catalogue data). Search input filters favourites client-side; multi-select, smart filters, archived view, AssistantCard and Add Plant button are Home-scope-only and hidden in Favourites.
- **Empty state (Favourites)**: "No favourites yet — tap the ♡ on any plant in your Home tab to keep it with you across homes."
- Tier gating on the Favourites tab: identical to Home — Ask AI sparkles hidden without `ai_enabled`; opening a favourite never triggers a provider/AI fetch (snapshot/catalogue read only), so Sprout can open an `api`/`ai`-source favourite freely; the tier-locked tabs listed in §7 stay locked.

### 5.2 The Nursery (`src/components/nursery/NurseryTab.tsx`)

- Scope pills **Home | Favourites** under the summary header. No URL param today for the Nursery toggle (it's component state) — keep favourites scope as state too, for symmetry.
- **Home scope**: today's packet list + a heart on each `NurseryRow` (favourites the packet's *reference identity*: variety + plant + vendor + sow-by note — explicitly **not** live stock/quantity/sowings, which are physical home state).
- **Favourites scope**: list of favourite varieties with **Add to this home** (creates a fresh `seed_packets` row via `createSeedPacket`; `plant_id` auto-linked when the plant identity exists in the target home's shed, else NULL with the existing "link plant" nudge) and **Remove**.
- **Empty state**: "No favourite seeds yet — heart a packet to remember the variety for next season, in any home."
- Sowings/germination history never appear under Favourites (they belong to the physical packet in its home).

### 5.3 The Watchlist (`src/components/AilmentWatchlist.tsx`)

- Scope pills **Home | Favourites** above the existing Active/Archived pills. Active/Archived + type filter apply to Home scope only; Favourites shows a flat filtered-by-type list (favourites have no archived state). Deep link: **`/shed?tab=watchlist&scope=favourites`**.
- **Home scope**: today's grid + heart on each `AilmentCard`.
- **Favourites scope**: favourite cards (image, type + source badges, step counts from snapshot) with **Add to this home** (inserts an `ailments` row from snapshot/library; the "N plants affected" chip and linking flows only exist on the resulting Home row) and **Remove**. "Ask Rhozly AI" stays Sage/Evergreen-only, same as Home.
- **Empty state**: "No favourites yet — heart an ailment to carry its prevention and remedy steps to every garden you tend."

---

## 6. Interaction flows

1. **Favourite from Home tab** — tap heart → service computes `identity_key`, resolves `catalogue_plant_id` (plants: follow `forked_from_plant_id` when set; if the row itself is a global-catalogue-backed library plant, use that global id) / `library_id` (ailments: match `ailment_library.name_key`), builds snapshot, inserts. Unique-violation → treat as already-saved (fill heart). Log new events (`EVENT.PLANT_FAVOURITED`, etc. — `src/events/` registry).
2. **Add favourite into the active home** — pre-check identity in the target home → if absent, insert via the surface's existing save path (see §3 table) → toast "Added to <home name>" → heart on the new Home row is already filled (same identity key). Requires `shed.add`/`ailments.add` where those client gates exist today.
3. **Home switch** — `handleSwitchHome` updates `user_profiles.home_id`; Home tabs re-fetch under the new `home_id`; Favourites tabs don't re-fetch (no home dependency). The "Add to this home" / "In this home" button states recompute against the new home.
4. **Removal** — delete the favourite row. Never touches any home row.

## 7. Tier-gating matrix (source × tier)

Favourite rows carry `source`; gating on both tabs is identical and matches today's rules. Nothing new is unlocked; nothing currently visible is removed.

| Interaction | Sprout | Botanist | Sage | Evergreen |
|---|---|---|---|---|
| See any-source row on **Home** tab (incl. `api`/`ai` added by a housemate) | ✅ (true today — home-member RLS, not tier) | ✅ | ✅ | ✅ |
| Favourite / unfavourite any-source row | ✅ (no external call) | ✅ | ✅ | ✅ |
| Add favourite → home (row copy, no external call) | ✅ *(pending OQ5)* | ✅ | ✅ | ✅ |
| Open favourite detail (snapshot/catalogue read) | ✅ | ✅ | ✅ | ✅ |
| **Refresh Care Guide** on an `ai` plant (`manual-refresh-ai-plant`) | 🔒 `ai_enabled` (client `aiEnabled` prop + server `guardAiByUser`) | 🔒* | ✅ | ✅ |
| **Grow Guide tab — Generate** CTA | 🔒 `ai_enabled` | 🔒* | ✅ | ✅ |
| **Companions tab** AI lookup | 🔒 `ai_enabled` | 🔒* | ✅ | ✅ |
| **Ask AI** sparkles (Shed card / Watchlist card / chat) | 🔒 `ai_enabled` | 🔒* | ✅ | ✅ |
| Live **Perenual/Verdantly re-fetch** of an `api`/`verdantly` plant's details | 🔒 `enable_perenual` (card renders stored/snapshot data read-only) | ✅ | 🔒* | ✅ |
| Watchlist **Rhozly AI** add-tier / AI suggest | 🔒 `ai_enabled` | 🔒* | ✅ | ✅ |
| Nursery **Scan a packet** / AI bulk-paste | 🔒 (regex fallback for paste) | 🔒 | ✅ | ✅ |

\* Per `25-plant-providers.md`, the current tier lattice gives Botanist `ai_enabled=true, enable_perenual=false` and Sage the inverse — the matrix follows the **flags**, which are the enforced source of truth (`17-tier-gating.md`'s header table disagrees with `25-plant-providers.md`'s; noted as doc drift to resolve — the code's `TIER_FLAGS` in `scripts/seed-test-account.mjs` and `src/constants/tiers.ts` win).

Enforcement points stay where they are: client props (`aiEnabled`/`isPremium` through PlantEditModal → GrowGuideTab/CompanionPlantsTab), `FeatureGate` where applicable, and server-side `guardAiByUser`/`guardAiByHome` in the edge functions. **No new server enforcement is needed** because favourites introduce no new AI/API entry points.

## 8. Migrations

1. `supabase/migrations/20260xxx000000_user_favourites.sql` — the three tables + RLS + grants + indexes (§4). Apply locally first (`supabase migration up`); push to remote only on explicit confirmation.

That's the only schema change. No changes to `plants`, `ailments`, `seed_packets`, `inventory_items`, or any RLS on existing tables.

## 9. File-by-file change list

| File | Change |
|---|---|
| `supabase/migrations/20260xxx000000_user_favourites.sql` | New — §4 DDL |
| `src/services/favouritesService.ts` | New — list/toggle/remove per type; `identityKeyForPlant/Ailment/Packet`; snapshot builders; `addFavouritePlantToHome` / `…AilmentToHome` / `…PacketToHome` (reusing `saveToShed` lib, ailment insert payload mapper, `createSeedPacket`); target-home dedupe checks |
| `src/lib/favouriteIdentity.ts` | New — pure identity-key + snapshot-shape helpers (unit-testable, no supabase import) |
| `src/types.ts` | New `FavouritePlant` / `FavouriteAilment` / `FavouriteSeedPacket` interfaces |
| `src/events/` registry | New events: `PLANT_FAVOURITED/UNFAVOURITED/FAVOURITE_ADDED_TO_HOME` (+ ailment/packet equivalents) |
| `src/components/TheShed.tsx` | Scope pills + `?scope=favourites` param; heart on `PlantCard`; render `FavouritePlantsGrid` in favourites scope |
| `src/components/favourites/FavouritePlantsGrid.tsx` (+ `FavouriteCard` shared bits) | New — favourites grid, add-to-home / remove actions, empty state |
| `src/components/nursery/NurseryTab.tsx` | Scope pills; heart on rows; `FavouriteSeedPacketsList` |
| `src/components/favourites/FavouriteSeedPacketsList.tsx` | New |
| `src/components/AilmentWatchlist.tsx` | Scope pills + `scope` param; heart on `AilmentCard`; `FavouriteAilmentsGrid` |
| `src/components/favourites/FavouriteAilmentsGrid.tsx` | New |
| `scripts/seed-test-account.mjs` | Seed favourites for tier test accounts (§11) |
| `supabase/seeds/15_favourites.sql` | New E2E fixtures (§11) |
| Tests + docs | §12–13 |

All new interactive elements get `data-testid`s (`shed-scope-toggle`, `favourite-plant-<id>`, `favourite-add-to-home`, `favourite-remove`, `watchlist-scope-toggle`, `nursery-scope-toggle`, …).

## 10. Phasing (each phase shippable)

- **Phase 1 — Plants (Shed) end-to-end.** Migration (all three tables land at once — one review, one push), `favouritesService` + identity lib, Shed scope pills + heart + favourites grid + add-to-home, seeds, tests, docs. **Why plants first:** highest-traffic surface; richest canonical layer (global catalogue) so it exercises the hardest case (catalogue ref + snapshot fallback + fork-on-add + `user_plant_ack` seeding); and the `inventory_items` FK invariant — the one thing this feature must not break — lives here, so proving it early de-risks everything after.
- **Phase 2 — Watchlist ailments.** Same pattern, `ailment_library` as canonical ref. Small delta over phase 1 (shared favourite-card components already exist).
- **Phase 3 — Nursery seed packets.** Snapshot-only (no canonical library), packet-specific semantics (variety reference vs physical stock), image question (OQ6). Deliberately last because it has the most open product questions (OQ4/6).

## 11. Sprout test account + E2E seed changes

**Sprout prod test account** (`test.rhozly+sprout@rhozly.com`, `scripts/seed-test-account.mjs`): the account already has 3 homes and a shed mixing `source='manual'` rows with `source='ai'` library forks (`seedLibraryShed`) — ideal for this feature. Changes:

- Add the three favourites tables to the **reset** step — note they are **user-scoped**, so the reset must delete by `user_id` (`eq("user_id", uid)`), not by home id like every other table in `resetHome()`. Add a small `resetUserScoped(uid)` alongside.
- Seed **once per user** (not inside the per-home loop!): ~6 `user_favourite_plants` (mix: 3 manual snapshots, 2 library/global-ref forks with `catalogue_plant_id` set, 1 with a dangling ref simulated by NULL to exercise snapshot fallback), ~4 `user_favourite_ailments` (2 manual, 2 library-ref), ~3 `user_favourite_seed_packets`. Set `favourited_from_home_id` across different homes so switching homes demonstrably keeps the list stable.
- Because favourites carry `ai`-source snapshots, the Sprout account directly exercises "Sprout sees AI-sourced favourite but AI actions stay locked".
- Same additions apply automatically to the other tier accounts (the script is tier-parameterised).

**E2E seeds** (`supabase/seeds/`): new `15_favourites.sql` — idempotent, per-worker UUID prefix, new entity block `00000000-0000-0000-0017-00000000000{n}` (0017 = next free segment — 0013–0016 are taken by the integrations seed: integration/devices/readings/valve events; register in `docs/e2e-test-plan/01-seeded-fixtures.md`). Seed 2 favourite plants (1 manual snapshot referencing seeded plant "Tomato" identity for the dedupe/"In this home" case, 1 with no matching home row for the clean add-to-home case), 1 favourite ailment, 1 favourite packet. **Home-switch coverage**: E2E workers currently have one home each — add a minimal second home + membership for Worker 1 in `15_favourites.sql` (pattern precedent: `09_cross_home_markers.sql`) so a spec can switch home and assert favourites persist while the Home tab re-roots.

## 12. Tests

- **Vitest (`tests/unit/lib/`)**: `favouriteIdentity.test.ts` — identity-key normalisation (scientific vs common name, casing/whitespace, packet composite key), snapshot shape caps, ailment `name_key` mirroring.
- **Deno (`supabase/tests/`)**: none — no edge function or `_shared/` changes.
- **Playwright (`tests/e2e/specs/`)**: new `favourites.spec.ts` (or rows folded into `shed`/`watchlist`/`nursery` specs per surface phase): heart toggles + persists; favourites tab lists seeded fixtures; add-to-home creates the home row and flips to "In this home"; dedupe (heart pre-filled for seeded Tomato); home-switch persistence (W1's second home); deep links `/shed?scope=favourites` + `/shed?tab=watchlist&scope=favourites`; Sprout-flag worker sees no AI actions on an `ai`-source favourite. Update Page Objects (`tests/e2e/pages/` shed/watchlist/nursery) with the new testids.

## 13. Docs to update (same task as each phase)

- **App-reference**: `03-garden-hub/01-the-shed.md`, `02-watchlist.md`, `10-nursery.md` (both roles: new tabs, flows, tier table rows); new cross-cutting `99-cross-cutting/39-data-model-favourites.md` (template-conformant, both voices) + `00-INDEX.md` row; `99-cross-cutting/19-rls-patterns.md` (add the three tables to the user-scoped list); `17-tier-gating.md` (matrix note + fix the Botanist/Sage flag drift vs `25-plant-providers.md`); `03-data-model-plants.md` + `06-data-model-ailments.md` + `33-data-model-nursery.md` (favourites cross-links).
- **E2E test plan**: rows in `docs/e2e-test-plan/06-shed.md`, `11-watchlist.md`, `24-nursery.md`; fixtures in `01-seeded-fixtures.md` (0017 prefix + second W1 home); `TESTING.md` inventory + counts if a new spec file lands.
- **Seed docs**: `docs/plans/seed-test-accounts.md` note re favourites + user-scoped reset.

## 14. Risks / edge cases

- **`?tab=` collision**: GardenHub owns `?tab=`; the new param must be `scope=` and TheShed's `setSearchParams` calls must preserve unrelated params (it currently does targeted get/sets — verify no `setParams({})` wipe clobbers `tab`; GardenHub's `switchTab` *does* call `setParams({})` for shed, which would drop `scope` — acceptable (tab switch resets scope) but must be a conscious choice.
- **Identity collisions**: two genuinely different plants sharing a common name with no scientific name (manual rows) collapse to one favourite slot. Accepted for v1 (matches the watchlist's existing "DB allows duplicates" looseness in reverse); OQ3.
- **Snapshot staleness**: a manual favourite never updates when the origin row is improved. By design (it's *your* copy), but the Favourites card should show "Saved <date>".
- **Global catalogue deletion** (`catalogue_plant_id` → NULL via `ON DELETE SET NULL`): card falls back to snapshot — must render fully from snapshot alone (test this).
- **RLS first-timer risk**: user-scoped tables on home-scoped surfaces — a wrong join in the service (e.g. filtering favourites by `home_id`) would silently return nothing; keep all favourites queries `user_id`-only.
- **Seed script reset scope**: forgetting the user-scoped delete would make prod re-runs accrete duplicate favourites until the UNIQUE constraint errors the seed.
- **`plants.id` integer PK**: `catalogue_plant_id` is `int`, matching. E2E seed plant ids must avoid live ranges (reuse existing `100000n` convention).
- **Offline queue / caching**: favourites are not added to `useCachedShed`'s localStorage cache or the offline queue in v1 — online-only writes with toast-on-failure (consistent with watchlist adds today).

## 15. Open questions for the human

1. **Naming** — "Home | Favourites" as proposed? Alternatives: "Our Garden | My Favourites", "Shared | Saved". (The request said "rename the main one to Favourites", but the main list is home data — it must become the *Home* tab; confirm this reading.)
2. **Favourites start empty** — confirmed? Auto-seeding from "rows you added" is infeasible for plants (no `created_by` column on `plants`) and misleading for the rest. A one-time hint banner on first visit instead?
3. **Dedupe rules** — is identity = scientific-name-key (fallback common name) right for plants? And should re-favouriting an *edited* home row refresh the existing favourite's snapshot, or no-op?
4. **Seed packets: what is a packet favourite?** Proposed: the *variety reference* (variety + plant + vendor + notes), never live stock/sowings. Alternatively drop packets from scope or defer past phase 3 — do favourites even make sense for consumable physical packets?
5. **Tier policy on add-to-home** — may a Sprout user copy an `api`/`ai`-source favourite into a home? No new API/AI call happens (snapshot/catalogue data), mirroring the Library flow that's already Sprout-open — but it does let Sprout accumulate provider-sourced rows. Approve, or gate add-to-home by source (e.g. `api`/`verdantly` needs `enable_perenual`)?
6. **Packet images** — home-scoped bucket path (`seed-packet-images/{home_id}/…`): copy the object to a user-scoped path at favourite time, or ship packet favourites without images?
7. **Permissions** — confirm "add to home" should respect `shed.add` / `ailments.add` client gates (favouriting itself ungated).
8. **Live vs frozen for catalogue-backed plant favourites** — proposed: display live global-catalogue data when the ref resolves, snapshot otherwise. Or always-frozen for total predictability?
9. **Sprout seed volume** — happy with ~6/4/3 favourites (plants/ailments/packets) spread across the account's 3 homes?

## Answers 2026-07-03 (user) — design adjustments

1. **Naming**: "Home | Favourites" confirmed; today's list becomes the Home tab.
2. **Favourites start empty** + first-visit hint banner: confirmed.
3. **Identity & editability (design change)**: dedupe by **unique plant id, not scientific name**. Only `source='manual'` plants are editable; `api`/`ai`/`verdantly` plants become **locked (read-only)** in the edit surfaces — an adjacent scope addition: PlantEditModal (and any edit path) disables editing for non-manual sources. AI generation always creates a NEW plant row with its own id, even when one with the same name exists (no name-based merging). Favourite identity key = the referenced plant's id (canonical/global id where present; the origin row id for manual snapshots). Re-favouriting the same id refreshes the snapshot/no-ops.
4. **Seed packets = variety reference** (variety + plant + vendor; never live stock/sowings): confirmed.
5. **Source × tier action gating (stricter than proposed)**: actions on a plant/ailment/packet whose `source` exceeds the viewer's entitlements are **view-only** — a Sprout user can see `api`/`ai` entries in the Home tab but cannot act on them; `enable_perenual`-only users can act on `api` but not `ai`; `ai_enabled`-only users the inverse; Evergreen both. *Interpretation to confirm: "anything except view" is read as blocking BOTH favourite AND add-to-home for above-tier sources (not just add-to-home). Enforced client-side (disabled controls with an explanatory tooltip/upsell) and server-side.*
6. **Packet images**: copy the storage object into the favourite at favourite-time.
7. Awaiting clarification (member-permissions interaction) — see below.
8. **Always live**: favourites with a resolvable canonical reference always display live data; the snapshot is retained only as a tombstone fallback when the reference is gone.
9. **Sprout test data volume**: increase to ~10 favourite plants, ~6 ailments, ~5 packets across the account's homes.

## Final decisions 2026-07-03 (second round)

- **Tier gating — strict**: above-tier sources are view-only in every sense: favouriting AND add-to-home both blocked (disabled controls + upsell, enforced client and server).
- **Member permissions**: add-to-home is always allowed for any home member regardless of per-member permission keys (favouriting is personal and ungated by definition).
- **Copy-on-write plant edits (supersedes the earlier "lock non-manual" wording)**: editing ANY non-manual plant (library / api / ai / verdantly) creates a NEW plant row with a NEW id; the original row is immutable. Manual plants remain editable in place. Consequences:
  - Favourite references are stable forever → "always live" display is safe; the jsonb snapshot is reduced to a deletion tombstone fallback only.
  - No dedupe machinery anywhere — identity is the immutable id.
  - The edit surfaces (PlantEditModal etc.) present non-manual edits as "Save as my own copy" (fork), not a disabled form.
