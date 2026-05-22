# Plan — Customisable Quick Launcher + Quick Access layout fixes

## Goal

Two related shipments bundled into one wave:

1. **Customisable Quick Launcher** — let phone users choose which destinations appear on the Quick Access 2×2 launcher (currently hard-coded to Lens / Today / Capture / Library). Think browser favourites: open Account Settings → toggle which navigation areas are pinned to the launcher → those tiles render in the chosen order on `/quick`.
2. **Quick Access layout polish** — two reported issues:
   - The "Open full dashboard" pill sits slightly off the bottom of the screen on some viewports.
   - When you scroll, the welcome/Account Settings hero card slides *under* the floating menu button.

## App-reference files consulted

- [docs/app-reference/02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — the surface being redesigned; documents the existing 4-tile grid, focus-mode chrome, and component graph.
- [docs/app-reference/99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md) — confirmed the canonical paths for every destination the launcher could target.
- [docs/app-reference/99-cross-cutting/14-caching.md](../app-reference/99-cross-cutting/14-caching.md) — confirmed the localStorage key convention (`rhozly_*`) for per-device preferences.
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) — confirmed how tier-gated destinations (Visualiser/Light Sensor on Sage+) are surfaced today.
- [docs/app-reference/99-cross-cutting/18-beta-gating.md](../app-reference/99-cross-cutting/18-beta-gating.md) — confirmed beta-only destinations should not appear as launcher options for non-beta users.

---

## Part 1 — Customisable Quick Launcher

### The catalogue of pinnable destinations

A single source-of-truth array in `src/lib/quickLauncherCatalogue.ts` defines every destination that can be pinned. Each entry has:

```ts
interface QuickLauncherDestination {
  id: string;                       // stable key persisted in prefs
  label: string;                    // shown on the tile
  description: string;              // line under the title (also aria-label)
  icon: LucideIcon;                 // glyph
  accent: "green" | "amber" | "red" | "blue" | "purple" | "teal" | "slate";
  route: string;                    // navigate() target
  // Predicate that hides the entry from the picker for users who can't use it.
  isAvailable?: (ctx: {
    subscriptionTier: SubscriptionTier;
    aiEnabled: boolean;
    isBeta: boolean;
    homeId: string | null;
  }) => boolean;
  /** Optional prefetch hook fired on tap before navigating. */
  onTap?: (homeId: string | null) => void;
}
```

Initial catalogue (8 entries — four current defaults plus four common extras the user is likely to want):

| id | Label | Route | Accent | Notes |
|----|-------|-------|--------|-------|
| `lens` | Lens | `/quick/lens` | green | Existing tile |
| `today` | Today | `/quick/calendar` | amber | Existing tile (preserves the prefetch handler) |
| `capture` | Capture | `/quick/journal` | red | Existing tile |
| `library` | Library | `/library/search` | blue | Existing tile |
| `shed` | Plants | `/shed` | green | Direct to The Shed |
| `planner` | Planner | `/planner` | purple | Direct to PlannerDashboard |
| `walk` | Walk | `/walk` | teal | Garden Walk (today already lives in the wide tile below the grid — pinning it promotes it into the main launcher) |
| `doctor` | Doctor | `/doctor` | red | Full Plant Doctor (Lens is the compact entry point) |
| `shopping` | Shopping | `/shopping` | slate | Shopping Lists |

Two extra accents (`purple`, `teal`, `slate`) added to `SOFT_TILE_MAP` in `QuickTile.tsx` so the new destinations have their own colour without recycling existing ones. All accents stay in the existing "soft tinted background + coloured icon medallion" style — no visual departure from today's launcher.

### The user preference

Stored two ways with localStorage as the read-source-of-truth (so the first paint on `/quick` is instant — no network round-trip), and a Supabase column as the cross-device sync layer.

#### localStorage

- Key: `rhozly_quick_launcher_v1`
- Shape: `{ pinned: string[] }` — array of destination `id`s in display order.
- Default (when missing): `["lens", "today", "capture", "library"]` — exactly today's behaviour.

#### Supabase (new column on `user_profiles`)

- Column: `quick_launcher_pins jsonb` — same shape `{ "pinned": ["lens","today","capture","library"] }`.
- Migration: `supabase/migrations/<ts>_user_profiles_quick_launcher_pins.sql`. Defaults to NULL; the read path treats NULL as "use defaults" (no backfill needed).
- RLS: column lives on `user_profiles`, which already has per-user RLS — no policy changes needed.

#### Sync rules

- On mount of `/quick`: read localStorage first → paint launcher. Then read `quick_launcher_pins` from `user_profiles` in the background. If the server value exists and differs from localStorage, overwrite localStorage and re-render. This is the same "local-first, network-revalidates" pattern the dashboard cache now uses.
- On save (from the picker): write Supabase first, then localStorage. If the Supabase write fails, surface a toast but keep the localStorage value — the user keeps their choice locally until next online save.
- Sign-out clears `rhozly_quick_launcher_v1` (defensive — different account, different pins) — added to the existing sign-out clear path in `App.tsx`.

#### Constraints

- **Min**: 1 destination. (Empty launcher = no tiles to render, bad UX. The picker disables the "remove" affordance on the last pinned item.)
- **Max**: 6 destinations. (More than 6 stops being a 2-column grid on a phone. We render up to 4 in a 2×2 grid; 5–6 extends to a 2×3 grid. 7+ would push the grid below the fold — disallowed.)
- **Order**: explicit, set by the user via the picker's drag-handle (mobile-friendly via `up/down` buttons; no third-party drag-drop dep).

### The picker UI (lives inside Account Settings)

A new section in `GardenerProfile.tsx` under the `AccountTab` (mounted at `/gardener`):

```
Quick Launcher
─────────────────────────────────────
Pin up to 6 shortcuts to your phone's
quick launcher. Tap to add or remove,
drag the handles to reorder.

[Pinned (4 of 6)]
  ☰  🟢 Lens        Identify, diagnose…   [✕]
  ☰  🟡 Today       Tasks, rain forecast  [✕]
  ☰  🔴 Capture     Snap a photo and…     [✕]
  ☰  🔵 Library     Search any plant…     [✕]

[Available]
  ➕  🌳 Plants     Direct to The Shed
  ➕  🟣 Planner    Direct to Planner
  ➕  💚 Walk       Garden Walk tour
  ➕  ⚕️ Doctor     Full Plant Doctor
  ➕  🛒 Shopping   Shopping Lists

[Reset to defaults]
```

UX details:
- Each pinned row has up/down arrows (mobile-friendly reorder, no drag library).
- `✕` removes from pinned list. Disabled when only 1 pinned item remains.
- `➕` adds to the bottom of the pinned list. Disabled when 6 pinned already.
- Each "Available" item is filtered through `isAvailable(ctx)` — if a destination isn't unlocked for the user (wrong tier, not beta), it doesn't appear in the picker at all.
- "Reset to defaults" — restores `["lens","today","capture","library"]`.
- Section saves on every change (auto-save) with a small `Saved ✓` indicator on the row — no manual Save button.

### Rendering the launcher on `/quick`

`QuickAccessHome.tsx` becomes layout-aware. The hard-coded 4-tile JSX is replaced with:

```tsx
const pins = useQuickLauncherPins();      // hook reads localStorage + revalidates
const tiles = pins.map(id => CATALOGUE_BY_ID[id]).filter(Boolean);

<div
  data-testid="quick-tiles-grid"
  data-pinned-count={tiles.length}
  className={`grid ${tiles.length <= 4 ? "grid-cols-2 grid-rows-2" : "grid-cols-2 grid-rows-3"} gap-2 mb-3 shrink-0`}
>
  {tiles.map(t => (
    <QuickTile
      key={t.id}
      testId={`quick-tile-${t.id}`}
      accent={t.accent}
      layout="compact"
      dense={tiles.length === 4}   // dense only when we're at 2x2; relax for 2x3
      icon={<t.icon strokeWidth={2.25} />}
      title={t.label}
      description={t.description}
      onClick={() => { t.onTap?.(homeId); navigate(t.route); }}
    />
  ))}
</div>
```

Behaviour rules:
- 1–4 pinned → 2×2 grid (or 2×1 / 2×2 with empty cell — actually we render a single row of 1 or 2, two rows of 3 or 4. Concretely: 1 → 1 col, 2 → 2 cols 1 row, 3 → 2 cols 2 rows (last cell empty), 4 → 2×2).
- 5–6 pinned → 2 cols 3 rows. `dense=false` to give each tile a touch more vertical room since the screen is now showing one extra row.

The `data-pinned-count` attribute makes the E2E tests trivial.

### New files

| File | Purpose |
|------|---------|
| `src/lib/quickLauncherCatalogue.ts` | The 8-entry catalogue + lookup map |
| `src/lib/quickLauncherPrefs.ts` | Pure read/write for localStorage + Supabase + sign-out clear |
| `src/hooks/useQuickLauncherPins.ts` | `pins, isLoading, save(ids), resetToDefaults()` — orchestrates local-first read + background sync |
| `src/components/quick/QuickLauncherPicker.tsx` | The picker UI (rendered inside `GardenerProfile` AccountTab) |
| `supabase/migrations/<ts>_user_profiles_quick_launcher_pins.sql` | Adds the column |
| `tests/unit/lib/quickLauncherPrefs.test.ts` | Round-trip read/write/clear, defaults, min/max guard |
| `tests/unit/hooks/useQuickLauncherPins.test.ts` | Local-first hydrate, sync overwrite, save fallthrough |
| `tests/unit/components/QuickLauncherPicker.test.ts` | Add/remove/reorder/reset interactions |

### Critical files modified

| File | Change |
|------|--------|
| `src/components/QuickAccessHome.tsx` | Swap hard-coded 4 tiles for catalogue-driven render; honour 1–6 pin count |
| `src/components/quick/QuickTile.tsx` | Add `purple` / `teal` / `slate` to `SOFT_TILE_MAP` |
| `src/components/GardenerProfile.tsx` | Add `<QuickLauncherPicker />` section to `AccountTab` |
| `src/App.tsx` | On sign-out, also call `clearQuickLauncherPins()` alongside existing `clearAllDashboardCaches()` |
| `tests/unit/components/QuickAccessHome.test.ts` | Update to assert pin-driven render + count attribute |
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | Document the catalogue / pin model / picker location |
| `docs/app-reference/99-cross-cutting/14-caching.md` | Add `rhozly_quick_launcher_v1` to the localStorage table |

### Tier / beta gating

- The catalogue ships with only universally-available destinations. If we add a Sage+ destination later (e.g. Visualiser), its `isAvailable` predicate gates it server-side AND in the picker; users without the tier never see the entry.
- Beta-only destinations follow the same predicate model — picker filters them out for non-beta users.

### Edge cases

- **User pins a destination, then loses access** (downgrades tier, exits beta): the launcher's render-time `isAvailable` check filters the tile out silently. The pin stays in storage — if they re-acquire access it reappears automatically. No "broken tile" state.
- **User has stale localStorage from a deleted catalogue entry**: render filter via `CATALOGUE_BY_ID[id]` drops unknown ids. We never throw.
- **Empty after filter** (everything they pinned has been removed from the catalogue, hypothetically): fall back to defaults. The render hook always guarantees ≥1 tile.

---

## Part 2 — Quick Access layout polish

Two small visual issues reported. Both are pure CSS / layout — no state model changes.

### Issue 2A: "Open full dashboard" pill clipped at bottom

Today the page uses `h-full w-full overflow-y-auto` on the outer wrapper. The footer's `mt-auto` only works when the container can size to the viewport; on shorter phones the inner `<main>`'s padding pushes the footer below the visible area. The reported symptom matches.

**Fix:**

- Increase bottom padding to clear iOS home-indicator safe area AND give the pill breathing room: change the `paddingBottom` calculation from `"calc(1rem + env(safe-area-inset-bottom, 0px))"` to `"calc(2rem + env(safe-area-inset-bottom, 0px))"`.
- Add `min-h-0` to the inner `<main>` so it shrinks correctly within the flex column; today it has no min-height constraint and the flex children's intrinsic heights stack above viewport.
- The footer wrapper currently uses `mt-auto` — keep it, but also add a `pb-2` so the pill never sits flush with the safe area inset edge.

This combination guarantees the pill is always visible at the bottom of the viewport, with comfortable spacing, on every iPhone size from SE → 16 Pro Max.

### Issue 2B: Hero card slides under the floating menu button on scroll

The menu button is `fixed top-3 right-3 z-[105]`. The hero card sits in the normal flow with `paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))"` on the `<main>` — enough headroom when the page hasn't scrolled, but once you scroll, the hero card slides up under the button.

**Fix:**

- Make the menu button visually distinct enough that overlap reads as "deliberate floating chrome", not "broken layout". Today it's `rounded-2xl bg-rhozly-primary text-white shadow-lg` — that's already there. Add a subtle outer ring: `shadow-lg ring-2 ring-white/40` so the button reads as a "floating chip" even when content scrolls beneath it.
- More importantly: add `padding-right` to the hero card so its text content never crosses under the button's footprint. Concretely: when `useIsMobile()` is true on `/quick`, the hero card needs `pr-16` (room for the 44×44 button + a gap), so the `ArrowRight` and "Tap to manage your account" line don't get covered.
- Belt-and-braces: lower the hero card's `z-index` to `relative z-0` and ensure the button's `z-[105]` always wins. (Already the case but worth being explicit in the CSS comment so a future change doesn't break it.)

Net effect: the button still floats reliably, the hero card never has its text obscured, and the overlap (when scrolled) reads as intentional layered chrome.

### Files modified

| File | Change |
|------|--------|
| `src/components/QuickAccessHome.tsx` | Padding-bottom bump, `min-h-0` on main, hero `pr-16` on mobile, explicit comment about z-stacking |
| `src/components/QuickAccessMenuButton.tsx` | Add `ring-2 ring-white/40` to the floating-button classes |

### Tests

- Update `tests/unit/components/QuickAccessHome.test.ts` to assert the hero card has `pr-16` on mobile (or read `data-testid="quick-access-hero-card"` and check the class). Cheap.
- No new Playwright spec — the existing E2E covers Quick Access mount and the menu button visibility; layout regressions show up via the bundled visual tests.

---

## Sequencing

1. **Part 2 first** — the two layout fixes are tiny and low-risk. Ship them as the first commit so the existing screen is correct before we layer the customisation work on top.
2. **Catalogue + prefs lib + hook** (`quickLauncherCatalogue.ts`, `quickLauncherPrefs.ts`, `useQuickLauncherPins.ts`) + unit tests. No UI change yet.
3. **Migration** for the `user_profiles.quick_launcher_pins jsonb` column. Apply locally first (`supabase migration up`); ask the user before pushing remote.
4. **QuickAccessHome refactor** to render from the catalogue. Defaults preserve today's behaviour — no user-visible change yet.
5. **Picker UI** in `GardenerProfile` AccountTab + its tests. This is the moment the feature becomes user-visible.
6. **Sign-out clear** wired into `App.tsx`.
7. **App-reference doc updates** (`09-quick-access-home.md`, `14-caching.md`).
8. **Release notes + deploy**.

## Risks & open questions

- **The picker lives in Account Settings**, not as a long-press / inline editor on the launcher itself. Pros: discoverable for users opening Settings; doesn't clutter the launcher with edit affordances. Cons: someone using only the launcher won't realise customisation exists. Mitigation: add a small "✏️ Customise" link below the launcher grid on `/quick` that deep-links to `/gardener?section=quick-launcher` — non-disruptive and self-documenting. (Implemented as part of the picker work.)
- **Drag-to-reorder vs up/down buttons** — I'm proposing up/down buttons to avoid a third-party library and keep the picker accessible. If the user wants real drag-drop later we can swap in `@dnd-kit/core` without changing the prefs model.
- **6-tile cap** — a softer constraint than "1-tile minimum". If anyone wants a third row, we'll bump to 8 max in a follow-up; the data model supports any count.
- **Tier/beta-gated destinations** — none in the initial catalogue, so no immediate gating to test. We're shipping the predicate infrastructure for later use.

## Out of scope

- A "long-press to enter edit mode" interaction directly on the launcher (would mirror iOS home screen). Possible follow-up but adds non-trivial gesture handling.
- Customising the wide WalkStartTile or the SeasonalPicksCard — both stay where they are.
- Customising the Quick Capture / Lens / Calendar focus-mode screens themselves.
- Reordering or hiding tabs inside any of the destinations (planner subtabs, etc.) — out of scope for the launcher.
