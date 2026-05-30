# Plan — Retire the Library UI, promote Plants (Shed) to a default tile

## What the user wants

1. Remove the **Library** feature (the user-facing `/library/*` screens — search, saved, and the standalone preview).
2. Replace it on the quick-links menu with a tile that links to **`/shed`** (the existing **Plants** tile).
3. That tile becomes a **default** pin (slot 4, replacing Library).
4. **Convert `SeasonalPickTile` to open `PlantDetailModal`** (the Care / Grow Guide / Companions / Light overlay used by Add-to-Shed, Shopping, Multi-ID, Companions) instead of navigating to `/library/plant/preview`. This is the same code reused everywhere — so we can fully strip `/library/*` including `PlantPreview`.

## Important — the `plant_library` *table* stays

This task is about removing the **UI screens** at `/library/*`. The `plant_library` Postgres table is unchanged — it's what every plant search (`PlantSearch`, the Companions tab, `resolvePlantInfo`, etc.) feeds off. All plant search functionality is still available from inside the Shed (Add Plant), Shopping, Multi-ID, Companions, and the Nursery picker. We're only removing the **standalone Library screen**.

## Investigation

| Surface | Consumers |
|---|---|
| `LibraryHome` (`/library/*` host that tabs between Search / Saved / Preview) | App.tsx route only |
| `LibrarySearchTab` | LibraryHome only |
| `LibrarySavedTab` | LibraryHome only |
| `PlantPreview` (`/library/plant/preview`) | LibraryHome **and `SeasonalPickTile`** (dashboard tile navigates here to show a seasonal pick's care guide) |
| `library` quick-launcher entry (`/library/search`) | Catalogue + default pins |
| `e2e specs/library*.spec.ts` | None — no spec file exists |
| Nav menu links to `/library` | None (only quick-launcher tile + internal `LibraryHome` tab links) |

**Key constraint:** `SeasonalPickTile.tsx:102` navigates to `/library/plant/preview` to show a seasonal pick's detail. So **`PlantPreview` must stay** at its current path, otherwise that flow breaks. The remaining four `library/` files can be deleted.

## Changes

### `src/lib/quickLauncherCatalogue.ts`
- Remove the `library` catalogue entry.
- `DEFAULT_QUICK_LAUNCHER_PINS`: `["doctor","today","capture","library"]` → `["doctor","today","capture","shed"]`.
- Change `shed.accent` from `green` → **`blue`** (taking the slot the Library tile freed up). Otherwise both default-pinned plant-themed tiles (Plant Lens + Plants) would be green; this keeps the four defaults visually distinct.

### `src/App.tsx`
- Drop the `LibraryHome` lazy import.
- **Remove the entire `<Route path="/library/*">` block** — no replacement (PlantPreview gone).
- Remove the scroll-restoration `startsWith("/library")` exception (no /library routes remain).

### Delete files (the whole `src/components/library/` directory)
- `LibraryHome.tsx`
- `LibrarySearchTab.tsx`
- `LibrarySavedTab.tsx`
- `PlantPreview.tsx`

### `src/components/seasonal/SeasonalPicksCard.tsx` — modal host

- Add `aiEnabled: boolean` + `isPremium: boolean` to the `Props` (it already has `homeId`).
- Add `const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);`.
- Render `<PlantDetailModal result={detailResult} homeId={homeId} aiEnabled={aiEnabled} isPremium={isPremium} onClose={() => setDetailResult(null)} />` when set.
- Pass an `onOpen={setDetailResult}` callback to each `<SeasonalPickTile>` instance.

### `src/components/seasonal/SeasonalPickTile.tsx`

- Add `onOpen: (result: ProviderSearchResult) => void` to `Props`.
- `openPreview` builds the same `synthResult` and calls `onOpen(synthResult)` instead of `navigate("/library/plant/preview", …)`.
- Remove the now-unused `useNavigate`, `useLocation`, `from`, the navigation comment.

### Thread `aiEnabled` + `isPremium` to every `<SeasonalPicksCard>` mount site

Wherever the card is rendered today, pass the two new props. Mounts are predictable (Dashboard / Today / Quick Access etc.) — those parents already receive `profile.ai_enabled` and `profile.enable_perenual` from `App.tsx`.

## Tests

- `tests/unit/lib/quickLauncherCatalogue.test.ts` — defaults assertion changes from `library` → `shed`. The "every id is resolvable" + "no duplicate ids" tests still hold.
- `tests/unit/lib/quickLauncherPrefs.test.ts` — anywhere `"library"` is used as a generic "existing catalogue id" stand-in, replace with another existing id (e.g. `"shed"`).
- `tests/unit/components/QuickAccessHome.test.ts` — `quick-tile-library` → `quick-tile-shed`; the accent assertion for that tile now expects `"blue"` (was `"blue"` already for library — no change needed there).

## Docs

- `docs/app-reference/00-INDEX.md` — mark `[~] The Library` retired; update the Quick Access defaults line to `Plant Lens / Today / Capture / Plants`.
- `docs/app-reference/02-dashboard/12-the-library.md` — top-of-doc **RETIRED** notice.
- `docs/app-reference/02-dashboard/09-quick-access-home.md` — defaults updated.
- `docs/app-reference/99-cross-cutting/21-routing.md` — drop `/library/search` + `/library/saved` rows; keep `/library/plant/preview` with a note.
- `docs/e2e-test-plan.md` — drop library rows if any.

## Migration

None. The `plant_library` table is untouched. The quick-launcher catalogue comment confirms removing an id is non-destructive — existing user pins to `"library"` are silently filtered at render. Users had no pinned data inside the Library itself (it was a read-only browse surface).

## Risks

- A user who had **`library` saved in their quick-links** loses that tile. They can re-pin Plants. (Same shape as the Lens retirement.)
- Anyone with a bookmarked `/library/*` URL gets a 404 — acceptable; it was a phone-first browse surface, low bookmark count.
- **Seasonal Picks UX change:** opening a pick now shows the `PlantDetailModal` overlay instead of the full-screen `PlantPreview` page. Same tabs (Care / Grow Guide / Companions / Light), same data, just an overlay (closes to the same dashboard you came from — no `from` round-trip needed).

## Process

1. Catalogue + App route + delete components + PlantPreview back-link → tests → docs.
2. `npx tsc --noEmit` + `npm run build` + `npm run test:unit`.
3. Release note (Removed + Improved); deploy `--bump 1`; push to main.
