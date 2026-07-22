# Garden Hub v3 — Presence × Curation

**Status: approved 2026-07-22 — all four owner decisions locked as recommended (Active/Inactive labels; blueprints archive with remove-from-garden; Unplanted=Active + scans-never-Active; unwatch allowed with live links). §2a home-scoped Saved presented with veto standing. Building stage by stage, deploy-then-continue.** Owner-drafted direction (2026-07-21), pressure-tested by a 5-agent panel (repo recon → data-model adversary / UX-IA designer / blast-radius assessor → adversarial merge). Follow-on to `docs/plans/garden-hub-search-first-overhaul.md` (OS 41.0030–41.0034).

## 1. The owner's direction (verbatim intent)

One consistent UI for plants and ailments. Nursery + Senescence stop being tabs (they're instance states — visible in the plant modal's instances tab; find their aggregate homes). "Adding to the shed / watchlist" was always a curated act → that becomes Favourites (plants) / Watchlist (ailments — no hearts, negative connotation), freeing the main search to be a clean library search. Active / Inactive replace Archived, **derived from data**: Active = live instance in an area or a seed sown; Inactive = no live data but history (senescence; ailments only on ended plants). Search results badge their relationship (combinable). Modals show all relationship data. The Ailment Library page is removed.

## 2. The final model (panel-merged; owner may veto §2a)

**Design law:** every species/ailment carries **PRESENCE** (derived, home-scoped, never toggled) × **CURATION** (chosen, home-scoped, shared) — plus **AFFINITY** (the existing user-scoped ♥/🔭 cross-home layer) as a personal overlay, never conflated.

### 2a. Curation = the home row itself (the panel's unanimous resolution)

**"Saved" IS the home-scoped `plants` row; "Watching" IS the home-scoped `ailments` row.** The owner's intent — adding was always curating — is honoured by *renaming what adding creates*, not moving data. `user_favourite_*` stays untouched as the personal layer (the ♥/🔭 "Mine" chips).

A literal shed→favourites migration is unimplementable — three independent repo-verified blocks: (1) **no attribution** — `plants`/`inventory_items` have no `created_by`; "whose favourites?" has no answer in data, and fan-out to all members is irreversible with broken forward semantics; (2) **the favourite tier trigger** (`20260831000000:100-122`) throws `tier_locked_source` for lower-tier members on ai/api/verdantly plants; (3) **the care graph** (7 CASCADE FKs + the inventory tree: blueprints, journals, schedules) hangs off the home row — favourites are SET-NULL satellites and cannot carry it. Ailments already work this way (home row = watched); plants now match — which is itself the rule-1 consistency ask.

**`is_archived` becomes the permanent curation bit** (false = Saved/Watching, true = curated out). Zero DDL, no renames, agent-chat undo keeps working. New invariant: any instance/sowing creation clears `is_archived`.

### 2b. Presence derivation (exact, mutually exclusive)

| Domain | ACTIVE (any) | INACTIVE (if not Active) |
|---|---|---|
| Plant | live instance (`ended_at IS NULL AND status <> 'Archived'` — **Unplanted counts**, it's in your care) OR sowing in `sown/germinated` (direct packet-join; packet archive ignored) | ended instance OR discarded sowing |
| Ailment | `plant_instance_ailments` link `status='active'` on a live instance | any link exists but none live; area-scan sightings = history evidence, never Active (scans have no resolved state) |

Rulings: key on `ended_at` never bare `status` (bulk-EoL double-writes); **M3 legacy backfill mandatory** (pre-`20260626000100` archives have `status='Archived'` + `ended_at NULL` — without backfill, dead plants resurrect as Active); implementation = **DB views** `plant_presence`/`ailment_presence` (one canonical definition for client + edge + agent-chat); curated-out zero-presence rows stay findable via the search owned section ("Previously in your garden").

### 2c. Companion fixes (mandatory)

1. **M1 — plants-side tier-trigger carve-out** (mirror of ailments' `20261015000000`): skip the gate when `plants.home_id IS NULL` (catalogue rows are public-read). Ships first, standalone — closes the long-open "library hearts" follow-up.
2. **Remove-from-garden archives the plant's blueprints** (+ symmetric restore) — else invisible plants ghost-generate tasks (owner Q2).

## 3. Target IA

- **Hub → TWO tabs: Plants | Ailments** (internal ids `shed`/`watchlist` keep the Shepherd anchors + URL params). Identical anatomy: HubHeader (title + "14 plants · 9 active") → search launcher (THE add path) → chips `[All][Active n][Inactive n][Saved n]` (ailments: `[Watching n]`) · divider · `[♥ Mine]`/`[🔭 Mine]` → one shared card anatomy (image, name, latin/category, presence pill, personal glyph, meta line, ⋯).
- **Badges:** ONE presence pill max (precedence Active > Inactive > Saved/Watching — Active implies Saved) + a combinable personal glyph (♥/🔭 icon-only). That delivers "combinable" without pill stacks.
- **Search overlay:** owned section → **"In your garden"** (all home rows incl. curated-out, badge-sorted) above **"From the library"** (the free search). Library detail ends in three verbs: *Plant it / Sow seeds / Save for later* (ailments: *Watch / Link to a plant*).
- **Seed box** (nursery re-homed): packets are supplies → a full-height sheet reusing ALL existing nursery components; four entries (Plants ⋯ menu, quick-launcher, Active-chip empty state, a conditional "Sowings now" strip atop Plants when live sowings/refill alerts exist). Must surface unlinked packets. `?tab=nursery` → Plants + auto-open.
- **Plant modal — "In your garden" tab** (id `instances` kept): GROWING (instances by area) · IN THE NURSERY (sowings + packets strip moved from the care tab) · HISTORY (ended timeline with per-row Restore — SenescenceTab semantics verbatim incl. re-fire generate-tasks) · footer "Remove from garden".
- **Ailment modal — ONE modal:** the watchlist-local Info/Prevention/Remedy modal dies; `AilmentDetailModal` + shared body everywhere, plus a net-new "In your garden" section (Affected now by area with `linked_by` finally rendered · Watch toggle + personal glyph · History incl. scan sightings). Must render for home-authored ailments with no library ref.
- **Routes never delete, always redirect:** `?tab=nursery` → Seed box; `?tab=senescence[&plant=]` → Inactive chip / modal History; `/ailment-library[?ailment=]` → `/shed?tab=watchlist[&detail=]` (new shareable `?detail=` param).

## 4. Migrations (3 artefacts; no new curation tables, no renames, no drops)

M1 tier-fix (trivially reversible) · M2 presence views (drop-to-revert) · M3 legacy-archive backfill **with a `legacy_archive_snapshot` table first** (replay-to-revert). Mapping: `is_archived=false` = Saved/Watching (relabel); archived+history → Inactive via derivation; archived+zero-signals → owned-section-only. `user_favourite_*` untouched. Seeds: Mint = derived-Inactive fixture; add orphaned-archive + sowing fixtures; Powdery Mildew gains an ended-instance link.

## 5. Stages (independently shippable, in order)

- **A — Derive under the hood:** ✅ **BUILT 2026-07-22.** M1 (`20261016000000` — gate treats catalogue-referenced favourites as free 'library'; REAL source still stored) + M2 (`20261017000000` — `plant_presence`/`ailment_presence` security-invoker views + Data-API grants; confirmed 10 legacy `Archived`/`ended_at NULL` rows exist locally for M3) applied locally; `useGardenPresence` hook (renamed — `usePresence` was taken by Realtime member presence) + pure `presenceBadge.ts` (+6 unit tests); owned search rows in BOTH takeovers show the single pill (`search-owned-presence-*`/`ailment-owned-presence-*`, `data-presence` attr); ailment library rows show the personal ♥ glyph by library id. Plants-side library glyphs deferred to Stage E (catalogue-clone mapping). e2e SHED-A1 + WL-A1 (drift-proof: assert pill ∈ closed set). 
- **B — Modals absorb:** plant "In your garden" tab, unified ailment modal. Nursery/Senescence tabs become redundant but alive.
- **C — Backfill + chip flip:** M3 (+snapshot), Active/Inactive/Saved chips on derived data, "Remove from garden" flows + blueprint archiving, clear-on-create invariant. Feature-flagged with fallback to old filters.
- **D — Tab collapse + Seed box:** 2-tab hub, Seed box + four entries + Sowings-now strip, redirects, nursery tour prose. Beta-gated one release.
- **E — Search unification:** "In your garden" incl. curated-out rows, library free search both domains, three-verb detail actions, `?detail=`.
- **F — Deletions:** ailment-library page → redirect (detail body survives), ToolsHub tile + launcher retargets, watchlist-local modal deleted, docs scrub.

Tests/docs ship within each stage. Size estimate: **1.5–2× the just-shipped overhaul** (~120–140 of ~306 e2e touched, ~70–85 rewritten; ~14 app-reference files, 1 new via `_template.md`, `16-ailment-library.md` archived).

## 6. Churn ledger vs last week (honest)

Carries forward: HubHeader, overlay shell, owned-section component, AilmentDetailBody + detail modal, all nursery modals/banner/flows, senescence restore logic, tab anchors, favourites chips. Reworked: 4-tab strip → 2; archived chips → derived Inactive; owned-section labels; nursery tour. Deleted: Nursery tab shell, Senescence page (the Inactive chip IS the aggregate), Ailment Library browse page, watchlist-local modal, "Browse the field guide" entries.

## 7. App-reference consulted / to update

Consulted: `03-garden-hub/01,02,10,12,16`, `99-cross-cutting/03-data-model-plants.md`, `04-data-model-tasks.md`, `06-data-model-ailments.md`, `17-tier-gating.md`, `19-rls-patterns.md`, `21-routing.md`, `30-onboarding-state.md` (+ panel recon with file:line cites). To update per stage: the same set + `36-plant-search.md`, `18-beta-gating.md` (Stage D flag), `00-INDEX.md`, new Seed-box file.

## 8. Owner decisions — PENDING

1. Chip labels: Active/Inactive (domain-symmetric) vs warmer alternatives.
2. Remove-from-garden also archives blueprints (recommended yes).
3. Presence edge-rulings: Unplanted-counts-as-Active; scans-never-Active (both recommended).
4. Unwatching with live links: allow (recommended) vs block.
(§2a home-scoped Saved is presented as decided — veto available at approval.)
