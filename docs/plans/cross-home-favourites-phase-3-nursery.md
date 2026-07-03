# Cross-Home Favourites — Phase 3 (FINAL): Nursery seed packets

**Status: PLAN — Phase 3 of the feature in `docs/plans/cross-home-favourites.md`.**

Mirrors the two implemented phases (Plants/Shed = Phase 1, Watchlist/ailments = Phase 2). Do NOT re-touch Shed or Watchlist except to reuse shared code.

## App-reference files consulted

- `docs/app-reference/03-garden-hub/10-nursery.md` — packet lifecycle, `seed_packets_with_germination`, `plant_id` nullable link, home-scoped `seed-packet-images` bucket path.
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — favourites tables cross-links (P1/P2 added their tables here).
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` — source × tier matrix (P1/P2 rows).
- `docs/app-reference/99-cross-cutting/19-rls-patterns.md` — user-scoped table pattern.

Source verified: `20260831000000_user_favourite_plants.sql`, `20260901000000_user_favourite_ailments.sql`, `20260624000500_nursery.sql` (seed_packets), `20260624000600_nursery_scan.sql` (image bucket + policies), `src/lib/favouriteIdentity.ts`, `src/services/favouritesService.ts`, `src/services/nurseryService.ts`, `src/lib/scanSeedPacket.ts`, `src/components/nursery/NurseryTab.tsx`, `src/components/favourites/FavouriteAilmentsGrid.tsx`, `supabase/seeds/15_favourites.sql`, `scripts/seed-test-account.mjs`.

## Packet tier-gating decision

**NO packet-level tier gate; NO tier trigger on the new table.** Justification, confirmed against the plan (§ on packets, answer 4/5, and P3 handoff notes):

- `seed_packets` has **no `source` column**. Packets are user-created (scanned/manually added), so the favourite is "manual in spirit".
- The favourite stores variety + vendor + plant identity + a jsonb snapshot — **reference data**, not AI/API-generated packet content. No AI/API call happens at favourite or add-to-home time.
- The linked `plants` row's source is irrelevant to the packet favourite: the favourite is a *variety reference*, and `plant_id` is nullable and only used for the "in this home" check. Gating a manual seed reference by an incidentally-linked plant's source would be surprising and would block a Sprout user from remembering a variety for next season — contrary to the feature's cross-home intent.
- P1/P2's triggers gate `ai`/`api`/`perenual` sources. Packets have none of those axes, so the trigger would be a no-op. Per the "no speculative changes" rule, the migration ships **without** a tier trigger (simpler than P1/P2, exactly as the brief recommends).

`isSourceLockedForTier`-style helpers are therefore NOT called for packets — no packet control is ever disabled for tier.

## Migration — `20260902000000_user_favourite_seed_packets.sql`

`user_favourite_seed_packets` — SNAPSHOT-ONLY (packets have no canonical library):

- `id uuid PK`, `user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE`.
- `seed_packet_id uuid REFERENCES public.seed_packets(id) ON DELETE SET NULL` — the **origin packet**, a pure tombstone/back-reference used ONLY for the "in this home" check, never as a live-data source (packets are tombstones per the handoff).
- Immutable identity columns: `plant_id int REFERENCES plants(id) ON DELETE SET NULL` (the variety's plant, nullable), `plant_common_name text`, `variety text`, `vendor text`.
- `identity_key text NOT NULL` — `lower(coalesce(variety,'') || '|' || coalesce(plant_common_name,''))` — the dedupe key.
- `copied_image_url text` — the favourite-scoped copy of the packet image (`seed-packet-images/favourites/{user_id}/{favourite_id}.jpg`), so the favourite survives the home packet's deletion.
- `snapshot jsonb NOT NULL DEFAULT '{}'` — sow_by, notes, quantity descriptor, purchased_on/opened_on (reference data, NOT live stock/sowings).
- `favourited_from_home_id uuid REFERENCES homes(id) ON DELETE SET NULL` — informational caption.
- `created_at timestamptz`.
- `UNIQUE (user_id, identity_key)` — single dedupe path (simpler than P2's two partial uniques: packets always have an identity_key, no library ref to disambiguate). Re-favouriting upserts on this key.
- Indexes: `(user_id, created_at DESC)` list index; `(seed_packet_id) WHERE seed_packet_id IS NOT NULL` for FK-delete.
- Pure user-scoped RLS (`USING/WITH CHECK user_id = (SELECT auth.uid())`), `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated`, no anon.
- **No tier trigger** (see decision above).

Apply locally via `supabase migration up` (never db reset); do not push remote.

## Image copy — both directions

- **On favourite** (`favouriteSeedPacket`): if the origin packet has an `image_url` in the home bucket, download the object (`storage.from('seed-packet-images').download(homePath)`) and re-upload it to `favourites/{user_id}/{favourite_id}.jpg`, store the resolved public URL in `copied_image_url`. No image → `copied_image_url` stays null, card renders the package icon (graceful). The favourite-scoped copy is what the Favourites card and add-to-home use — so the favourite survives deletion of the home packet.
- **On add-to-home** (`addFavouritePacketToHome`): create the packet via `createSeedPacket` (plain insert, no fork, any home member). Then if `copied_image_url` is set, copy the favourite-scoped object into the new home path `{home_id}/{new_packet_id}.jpg` and `setSeedPacketImageUrl`. `plant_id` linked only if the same plant identity already exists in the target home's shed (case-insensitive common_name match), else NULL (the existing "link plant" nudge handles it).

Storage policies (`20260624000600`) allow any authenticated user to read/write any path in `seed-packet-images`, so both copies are plain client Storage ops — no edge function needed.

## Service — `favouritesService.ts` (packet functions)

`packetIdentityKey`, `buildPacketSnapshot`, `PACKET_SNAPSHOT_FIELDS` in `favouriteIdentity.ts` (pure, unit-tested). Service: `listFavouriteSeedPackets`, `favouriteSeedPacket` (incl. image copy + upsert on identity_key), `unfavouriteSeedPacket`, `isFavouritePacketInHome`, `addFavouritePacketToHome` (createSeedPacket + image copy-back + plant link).

## UI

- `NurseryTab.tsx`: **Home | Favourites** scope pills as **component state** (no URL param — matches the Nursery toggle's existing model, confirmed against handoff). Heart on each `NurseryRow` (Home tab). Favourites scope renders `FavouriteSeedPacketsGrid`.
- `FavouriteSeedPacketsGrid.tsx`: template off `FavouriteAilmentsGrid` — card (image via `copied_image_url`, variety/plant/vendor, snapshot detail, "Saved from <home>"), Add-to-this-home / In-this-home / Remove, first-visit hint banner, empty state. **No tier lock** on any control.
- `types.ts`: `FavouriteSeedPacket`. `events/registry.ts`: `SEED_PACKET_FAVOURITED` / `SEED_PACKET_UNFAVOURITED` / `FAVOURITE_SEED_PACKET_ADDED_TO_HOME`.

## Seeds

- `15_favourites.sql`: 0019 segment. Per-worker: a home packet "Cherokee Purple / Tomato" (dedupe case) + its favourite; a "Cosmos" tombstone favourite (seed_packet_id NULL, not in any home, clean add-to-home). W1 only: a "Kale" packet in the Rooftop Terrace second home + favourite (home-switch persistence). Home packets need a `seed_packets` fixture (no existing nursery E2E seed).
- `scripts/seed-test-account.mjs`: ~5 packet favourites across the account's homes + a dangling tombstone. Extend the user-scoped reset to delete `user_favourite_seed_packets` (now all THREE favourite tables).

## Tests

- Vitest: extend `favouriteIdentity.test.ts` for `packetIdentityKey` + `buildPacketSnapshot`.
- Playwright: extend `favourites.spec.ts` with FAV-NU-001..006 (deep-less scope pill + seeded fixtures, heart favourite, dedupe "In this home", add-to-home recreates packet, tier ungated sanity, W1 home-switch persistence) + `NurseryPage.ts` page object.
- Run: `npm run typecheck`, schema gate, `npm run test:unit`, `npm run test:functions`, `npm run test:seed`, `npx playwright test favourites + home-main`, `npm run build` — all green.

## Docs

`03-garden-hub/10-nursery.md` (both roles), `99-cross-cutting/03-data-model-plants.md` (favourites packet table + image copy), `17-tier-gating.md` (packets ungated note), `docs/e2e-test-plan/24-nursery.md`, `01-seeded-fixtures.md` (0019 segment), `TESTING.md` counts. Append "Phase 3 — IMPLEMENTED" to `cross-home-favourites.md`.

## App-reference files that WILL be updated

`03-garden-hub/10-nursery.md`, `99-cross-cutting/03-data-model-plants.md`, `99-cross-cutting/17-tier-gating.md`.
