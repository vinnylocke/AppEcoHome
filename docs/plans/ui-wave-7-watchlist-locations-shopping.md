# UI Wave 7 — Watchlist + Locations + Shopping polish

## Goal

Audit asked for substantial work on these three management surfaces. Investigation revealed almost everything is already done:

| Audit ask | Status |
|---|---|
| LocationManager — Advanced Settings accordion | ✅ Already shipped |
| LocationManager — InfoTooltips on metric fields | ✅ Already there + Wave 2 made them persona-aware |
| LocationManager — placeholder hints ("e.g. 6.5", "e.g. 5000") | ✅ Already shipped |
| AilmentWatchlist — default to AI tab | ✅ Already (`useState<CreationMode>("ai")`) |
| AilmentWatchlist — rename tabs friendly | ✅ Already ("Ask Rhozly AI ✦", "Search Database", "Add Manually") |
| AilmentWatchlist — AI mode banner | ✅ Already at top of modal |
| ShoppingLists — quick-start templates | ✅ Already (Blank / Starter Toolkit / Seasonal Veg Patch) |
| ShoppingLists — confirmation toast on add-to-shed | ✅ Already (`Added X plants to your Shed — find them under Garden > The Shed`) |
| ShoppingLists — visual differentiation plants vs products | ✅ Already (plant green leaf icon vs product category letter) |

What's genuinely worth shipping:

1. **AilmentWatchlist — empty state** swap to shared `<EmptyState>` (currently inline div).
2. **ShoppingLists — empty state** swap to shared `<EmptyState>` (currently inline div with no primary CTA).

Both small, both leverage Wave 2 infrastructure, both add consistency across the app.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| LocationManager populated-fields icon row | **Defer** — small marginal win; nice-to-have. |
| AilmentWatchlist manual-mode accordions | **Defer** — substantial restructure; current power-user form works. |
| Persona-aware copy on these surfaces | **Defer** — saving persona payoff for surfaces where it pulls more weight. |

## Files

| File | Change |
|---|---|
| `src/components/AilmentWatchlist.tsx` | Replace empty-state inline div with `<EmptyState>` + secondary "Open Plant Doctor" CTA. |
| `src/components/ShoppingLists.tsx` | Replace empty-state inline div with `<EmptyState>` + primary "Create your first list" CTA. |

No new tests — visual swaps to an existing surface.

## Steps

1. AilmentWatchlist empty-state swap.
2. ShoppingLists empty-state swap.
3. Typecheck + tests + deploy.
