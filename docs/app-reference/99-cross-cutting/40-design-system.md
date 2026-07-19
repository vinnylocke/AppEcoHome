# Design System — Tokens, Motion, Anti-Generic Rules (cross-cutting)

> **One-line summary**: the brand-locked token layer every Rhozly surface inherits — colours, type, radii, green-tinted elevation, motion contract, and the rules that keep the UI looking handcrafted rather than template-generated.

**Where it lives:** the `@theme` block + utilities in `src/index.css` (Tailwind v4 CSS-first — there is no tailwind.config file), font imports in `src/main.tsx`, `motionTier()` in `src/lib/motionTier.ts`. The narrative source of truth is [docs/DESIGN.md](../../DESIGN.md); this file is its app-reference twin.

---

## Quick Summary

Rhozly's visual language is defined once, in tokens, so 310 component files can't drift: one warm off-white ground, one confident green, white cards with hairline outlines and green-tinted shadows, Plus Jakarta Sans headlines over Inter body (both self-hosted variable fonts), Lucide-only icons, and motion that is compositor-only, touch-first, and reduced-motion-safe. Functional colour (weather amber, watering blue, AI violet…) follows the brand recipe — pale fill, hairline border, deep ink — so accents inform without out-shouting the green.

---

## Role 1 — Technical Reference

### Token inventory (`src/index.css` `@theme`)

| Namespace | Tokens | Generated utilities |
|---|---|---|
| `--color-rhozly-*` | bg, surface-low, surface, surface-lowest, primary, primary-container, deep, tint, tertiary, on-surface, on-surface-variant, outline, error | `bg-rhozly-*`, `text-rhozly-*`, `border-rhozly-*`, … |
| `--color-status-{family}-{part}` | families: weather (amber), caution (orange), water (blue), sensor (sky), success (emerald), ai (violet), watch (rose), danger (red); parts: fill (50), line (200), ink (700), ink-strong (800) | `bg-status-water-fill`, `border-status-water-line`, `text-status-water-ink`, … |
| `--radius-*` | card 1.5rem · control 1rem · chip 0.5rem | `rounded-card`, `rounded-control`, `rounded-chip` |
| `--shadow-*` | card, raised, overlay — all green-tinted `rgba(7,87,55,…)` | `shadow-card`, `shadow-raised`, `shadow-overlay` |
| `--ease-*` | out-quart, spring | `ease-out-quart`, `ease-spring` |
| `--text-2xs` / `--text-3xs` | 11px / 10px with baked line-heights | `text-2xs`, `text-3xs` |
| `--font-*` | display = Plus Jakarta Sans Variable, body/sans = Inter Variable | `font-display`, `font-body`, `font-sans` |

> **Tree-shaking caveat:** Tailwind v4 only emits an `@theme` variable to `:root` once some generated utility (or `var()` inside emitted CSS) references it. The `status-*` families and `--ease-spring` are therefore absent from the built CSS until their first utility use — consume them via utility classes (`bg-status-water-fill`), not raw `var(--color-status-…)` in inline styles, unless you've confirmed the variable is already emitted.

### Entrance-animation utilities

`src/index.css` natively implements the tailwindcss-animate contract used at ~300 call sites (`animate-in` + `fade-in[-N]`, `zoom-in[-N]`, `slide-in-from-{top,bottom,left,right}[-N]`), driven by one `rhozly-enter` keyframe over `--tw-enter-*` custom properties. The plugin itself is **not** installed — these `@utility` definitions are the implementation. `duration-*` and `ease-*` compose via Tailwind v4's `--tw-duration` / `--tw-ease`. Default: 150ms `ease-out-quart` (a deliberate upgrade over the plugin's plain `ease` default). Note: Tailwind v4 emits `translate-*`/`rotate-*`/`scale-*` utilities as the standalone `translate`/`rotate`/`scale` CSS properties, so elements centered with `-translate-x-1/2` compose safely with these `transform`-based keyframes — no wrapper element needed. There are no exit utilities (`animate-out` is unused in the codebase).

### Variants & gradients

- `@custom-variant can-hover` = `@media (hover: hover) and (pointer: fine)`. Project rule: no bare `hover:` without an `active:` twin or a `can-hover:` guard (prevents sticky hover on touch).
- `bg-brand-gradient` (deep → primary, 135deg — immersive headers per the brand book) and `bg-brand-gradient-soft` (primary → primary-container — hero CTAs; also referenced by `src/onboarding/shepherdTheme.css` via the colour vars).

### Fonts

Self-hosted variable fonts via `@fontsource-variable/inter` and `@fontsource-variable/plus-jakarta-sans`, imported **in `src/main.tsx`** — not via CSS `@import`, because Tailwind's PostCSS inliner keeps package-relative `url(./files/…)` paths that 404 at runtime. Vite emits the woff2 files as hashed assets; the service-worker precache glob (`vite.config.ts`) includes `woff2`, so fonts work offline. Full weight axes mean `font-black`/`font-extrabold` render real weights (previously the Google Fonts load stopped at 600/800 and browsers synthesised faux bold for 2,600+ headings).

### `motionTier()` (`src/lib/motionTier.ts`)

Returns `"off" | "low" | "high"` from `prefers-reduced-motion` → `navigator.deviceMemory ≤ 4` / `hardwareConcurrency ≤ 4`. Consulted by **decorative** JS-driven effects only (particle bursts, ambient layers, long staggers); load-bearing motion relies on the global reduced-motion CSS block instead. Unit-tested in `tests/unit/lib/motionTier.test.ts`.

### Toaster

The app-wide `react-hot-toast` `<Toaster>` (mounted in `src/App.tsx`) is themed via `toastOptions` inline styles reading the tokens (`--color-rhozly-surface-lowest`, `--radius-control`, `--shadow-raised`, `--font-body`; success icon = primary green, error icon = `--color-rhozly-error`). All 60+ `toast()` call sites inherit it.

### Primitive tier (`src/components/ui/`)

Named exports, built on the tokens, `cn()` (clsx + tailwind-merge, `src/lib/cn.ts`) for consumer overrides, `data-testid` passthrough. **Migration rule: adopt on touch** — when Phase 4 work lands on a surface, its hand-rolled recipes move onto these; no blind codemods.

| Primitive | File | Contract |
|---|---|---|
| `Button` | `Button.tsx` | Pill, 5 variants × 3 sizes, one hover (bg shift, `can-hover`-gated) + press language (0.97 in fast / spring out), `busy` spinner state, `pointer-coarse:` 44px floor |
| `Card` | `Card.tsx` | White-on-cream, hairline, `rounded-card` + `shadow-card`; `interactive` adds the hover-lift/press language generalised from the HomeDashboard hero |
| `ModalShell` + `Z` | `ModalShell.tsx`, `zIndex.ts` | ConfirmModal's shell contract extracted: portal + `useFocusTrap` + Escape + overlay recipe + enter motion + `Z` ladder (nav 40 / drawer 80 / modal 120 / alert 130 / toast 140). **Overlay classes `fixed inset-0 justify-center items-center` are load-bearing** — the global `body:has()` scroll lock matches them; `sheet` mode pins via `self-end` on the panel for the same reason |
| `TextField` / `TextAreaField` | `TextField.tsx` | The filled-field language standardised (surface-low fill, border+soft-ring focus, label/help/error slots with `useId` ARIA wiring); shared chrome constants exported for `SelectField` |
| `SelectField` | `SelectField.tsx` | Native select on the same chrome, `appearance-none` + Lucide chevron |
| `SegmentedTabs` | `SegmentedTabs.tsx` | Real `tablist`/`tab` semantics, roving tabindex, arrow-key selection-follows-focus, sliding white-pill indicator (position slides via transform; width snaps — deliberate compositor trade-off) |
| `NoticeStrip` | `NoticeStrip.tsx` | Banner primitive on the `status-*` tone recipe (danger = `role="alert"`); the token classes are what make high-contrast mode work on banners |
| `SparkleAccent` | `SparkleAccent.tsx` | The AI signature: 3 staggered four-point sparkles over one word/element; max one per screen; invisible under reduced motion by construction |
| `PhotoGlow` | `PhotoGlow.tsx` | Static ambient halo from the photo's own colours (blurred duplicate, no canvas); a few per viewport max — each holds GPU memory |

### Signature moments (Phase 3 — wired surfaces)

- **Leaf burst on completion** — `spawnBurst(x, y)` in `src/lib/burst.ts` (WAAPI, `motionTier`-capped 8/14 particles, leaf+petal palette). Wired: `TaskList.toggleTaskCompletion` (fires from the tapped control on optimistic completion). Reward moments only — never navigation.
- **Staggered grid entrance** — `staggerStyle(index)` + `STAGGER_ENTRANCE` in `src/lib/stagger.ts` (inline `animation-delay`/`fill-mode: backwards` longhands beat the `animation:` shorthand reset; cap 6 × 40ms). Wired: The Shed plant grid.
- **SparkleAccent / PhotoGlow** — built, wired to surfaces during Phase 4 (Plant Doctor tile, AI result headers, plant photo heroes).

### Interplay with accessibility & high contrast

- The global `prefers-reduced-motion` block zeroes the entrance animations automatically (elements simply appear).
- High-contrast mode (`html.high-contrast`) overrides opacity-modified `rhozly-*` utilities; raw stock-palette classes bypass it — one more reason status colours must migrate to the `status-*` tokens.
- Focus ring, skip-link, and modal ARIA contracts are owned by [34-accessibility.md](./34-accessibility.md).

### Performance constraints

Animate only `transform`/`opacity` (compositor-only law). Budgets: ≤1 `backdrop-blur` per screen (≤12px, never animated), ≤3 persistent `will-change` app-wide, no rAF loop without stop + `visibilitychange` pause, stagger ≤6 × 40ms.

---

## Role 2 — Expert Gardener's Guide

### Why this exists

You never open this "surface", but you feel it everywhere: it's why Rhozly looks like one hand-built tool instead of a stack of mismatched screens. The warm paper-coloured background and single deep green are deliberate — calm enough to read in the garden, quiet enough that your plant photos provide the colour.

### What every colour means

Colour in Rhozly always carries meaning, so you can read a screen at arm's length in daylight: amber = weather is coming for your plants; orange = it's serious (heatwave, high pollen); blue = watering and dates; light blue = sensors and light readings; emerald green = healthy / done / all clear; violet = an AI feature is talking; soft rose = something on your Watchlist; red = overdue or dangerous. If a chip or banner uses one of these, the pale background + strong text combination is intentional — it flags without shouting.

### What changed for you recently

- Pop-ups, toasts and panels now ease in gently instead of snapping onto the screen (unless your phone's "reduce motion" setting is on — then everything appears instantly, as it should).
- Headings render in the true typeface weights, so text looks crisper — especially on Android.
- Fonts load with the app itself: first paint is faster and works fully offline in the garden.
- The little confirmation toasts now match the app instead of looking like a browser default.
- Your phone's status bar / task-switcher tint now matches Rhozly's green, and the app calls itself Rhozly (not "Plant Doctor") in the browser tab.
- Completing a task scatters a small burst of leaves from your fingertip — a two-second thank-you, capped on older phones and absent entirely under Reduce Motion.
- Your plant grid now cascades in card-by-card (a quarter of a second total) instead of appearing all at once.

### Common pitfalls

- If animations seem "missing", check your device's Reduce Motion accessibility setting — Rhozly honours it everywhere by design.
- If secondary text looks faint outdoors, turn on High Contrast in Gardener Profile → Account → Accessibility; it solidifies every soft grey.

### What to do if something looks wrong

- A screen that suddenly looks "flat" (no card edges) or shows the wrong green is a token regression — report it with a screenshot; it is a one-line fix in the token layer, not a per-screen bug.

---

## Related reference files

- [34-accessibility.md](./34-accessibility.md) — focus ring, reduced motion, high contrast, modal ARIA
- [22-pwa.md](./22-pwa.md) — service-worker precache (now includes the font files)
- [17-tier-gating.md](./17-tier-gating.md) — tier colours consumed via the `status-*` families
- [09-persistent-ui/10-toaster.md](../09-persistent-ui/10-toaster.md) — the themed Toaster surface

## Code references for ongoing maintenance

- `src/index.css` — `@theme` tokens, entrance utilities, `can-hover` variant, gradients, high-contrast + reduced-motion blocks
- `src/main.tsx` — variable-font imports (order: fonts before `index.css`)
- `src/components/ui/` — the primitive tier (Button, Card, ModalShell, TextField, SelectField, SegmentedTabs, NoticeStrip, SparkleAccent, PhotoGlow, zIndex)
- `src/lib/cn.ts` — class combiner for the ui tier
- `src/lib/motionTier.ts` + `tests/unit/lib/motionTier.test.ts`
- `src/lib/burst.ts` + `tests/unit/lib/burst.test.ts` — completion celebration
- `src/lib/stagger.ts` + `tests/unit/lib/stagger.test.ts` — list-entrance stagger
- `src/App.tsx` — `<Toaster toastOptions>` theming
- `src/onboarding/shepherdTheme.css` — tour styling on the same tokens
- `index.html` — `theme-color`, app title
- `docs/DESIGN.md` — the narrative ruleset (update both together)
