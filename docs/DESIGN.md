# Rhozly Design System

The single source of truth for how Rhozly looks and moves. It encodes
[Rhozly-Brand-Guidelines.pdf](../Rhozly-Brand-Guidelines.pdf) (v1.0, July 2026)
as enforceable tokens and rules. Tokens live in the `@theme` block of
[src/index.css](../src/index.css) (Tailwind v4, CSS-first — there is no
tailwind.config file). The app-reference twin of this document is
[docs/app-reference/99-cross-cutting/40-design-system.md](app-reference/99-cross-cutting/40-design-system.md).

**The one-line brief:** warm, not clinical; green leads, colour follows;
plain-spoken. Everything below serves those three brand principles.

---

## 1. Colour

### Brand palette (`--color-rhozly-*`)

| Token | Value | Use |
|---|---|---|
| `rhozly-bg` | `#faf9f7` | The app canvas — warm off-white. Never pure `#fff` as a page ground. |
| `rhozly-surface-low` | `#f4f3f1` | Inset fields, subtle wells, filled inputs. |
| `rhozly-surface` | `#efeeec` | Secondary buttons, muted tiles. |
| `rhozly-surface-lowest` | `#ffffff` | Cards & sheets. **Use this token, not `bg-white`,** so surfaces stay retunable. |
| `rhozly-primary` | `#075737` | THE green. Primary buttons, links, active nav, key accents. |
| `rhozly-primary-container` | `#2a704d` | Softer green — fills, hovers, secondary surfaces. |
| `rhozly-deep` | `#063d28` | Immersive headers (as `bg-brand-gradient` with primary). |
| `rhozly-tint` | `#e6efe9` | Quiet green wash for chips and callouts. |
| `rhozly-tertiary` | `#ffdad8` | Soft pink echo of the rose — gentle highlights only. |
| `rhozly-on-surface` | `#1a1c1b` | Primary text. |
| `rhozly-on-surface-variant` | `#454a47` | Secondary text (8.6:1 on the canvas — sunlight-safe). Prefer this over opacity-modified on-surface for meaningful text. |
| `rhozly-outline` | `rgba(26,28,27,.15)` | Hairline borders & dividers. |
| `rhozly-error` | `#b91c1c` | Destructive actions & errors. |

Rose red `#e80d2a` belongs to the **logo only** — never a UI accent.

### Functional status families (`--color-status-*`)

One family per *meaning*, implementing the brand recipe — background = the
hue's 50, border = 200, text = 700 (`-ink`) / 800 (`-ink-strong`). They inform;
they never out-shout the green.

| Family | Hue | Meaning |
|---|---|---|
| `status-weather-*` | amber | Warnings & weather — heat, wind, sun, sow-by soon |
| `status-caution-*` | orange | Stronger caution — heatwave emphasis, pollen high |
| `status-water-*` | blue | Watering & water, calendar, informational |
| `status-sensor-*` | sky | Light & sensor readings |
| `status-success-*` | emerald | Success & healthy — "Soil OK", done, Sprout tier |
| `status-ai-*` | violet | AI & premium — Sage tier, admin |
| `status-watch-*` | rose | Watchlist & soft pink accents |
| `status-danger-*` | red | Overdue, errors, destructive |

Suffixes: `-fill` (bg), `-line` (border), `-ink` (text), `-ink-strong`
(emphasis text). An alert card is always:
`bg-status-weather-fill border border-status-weather-line text-status-weather-ink`.

**Rule:** new code uses these tokens instead of raw `amber-50`/`blue-700`
stock classes. Existing stock usage migrates opportunistically whenever a
surface is touched.

## 2. Typography

- **Display** (`font-display`): Plus Jakarta Sans Variable — page titles, card
  headings, hero numbers. Tighten tracking on large sizes (`tracking-tight`).
- **Body/UI** (`font-body`, the default): Inter Variable — body, buttons,
  labels, data. Uppercase micro-labels get `tracking-wide`+.
- Both fonts are **self-hosted variable fonts** imported in
  [src/main.tsx](../src/main.tsx) (SW-precached, no Google Fonts request, full
  weight axes — `font-black` renders a real weight, not faux bold).
- Micro sizes: use `text-2xs` (11px) and `text-3xs` (10px) — **not** arbitrary
  `text-[10px]`/`text-[11px]`. Anything below 10px is banned for text.
- Numbers in columns/stats: `tabular-nums`.

Brand type scale for reference: Display 40/800 · H1 28/800 · H2 20/700 ·
H3 15/700 · Body 14/400 · Label 10/700 caps.

## 3. Shape & elevation

| Token | Value | Use |
|---|---|---|
| `rounded-card` | 24px | Cards, sheets, modals |
| `rounded-control` | 16px | Inputs, non-pill buttons, tiles |
| `rounded-chip` | 8px | Chips & badges |
| `rounded-full` | pill | Buttons (the brand default), avatars, toggles |

**Elevation is green-tinted, never neutral black** (`--shadow-*` in `@theme`):

| Token | Use |
|---|---|
| `shadow-card` | Resting cards (pair with `border border-rhozly-outline/10`) |
| `shadow-raised` | Hovered/active cards, popovers, toasts |
| `shadow-overlay` | Modals, sheets, tour popups |

Default Tailwind `shadow-sm/md/lg/xl/2xl` are legacy — replace on touch.
Containment prefers background shifts + hairlines over shadows; un-box list
rows with `divide-y divide-rhozly-outline/10` instead of card-per-row.

Gradients: `bg-brand-gradient` (deep→primary, immersive headers) and
`bg-brand-gradient-soft` (primary→container, hero CTAs). No other decorative
gradients; let plant photography bring the colour.

## 4. Motion

**The compositor law: animate only `transform` and `opacity`.** Never animate
`width/height/top/left/margin` (layout) or `box-shadow/filter/background-position`
(paint) — they jank exactly when a WebView is busiest. Elevation changes
crossfade a pre-rendered shadow pseudo-element's opacity.

- **Entrances:** the `animate-in fade-in zoom-in-95 slide-in-from-*` utilities
  (defined natively in `src/index.css` — the tailwindcss-animate contract).
  Compose with `duration-*` / `ease-*`. Default 150ms `ease-out-quart`.
- **Easings:** `ease-out-quart` for state changes; `ease-spring` for press
  release / playful overshoot.
- **Press feedback (the touch replacement for hover):** every tappable element
  gets `active:scale-[0.97] transition-transform duration-100` + `touch-manipulation`.
  Scale stays within 0.95–0.98.
- **Hover is opt-in, never load-bearing:** no bare `hover:` without either an
  `active:` twin or a `can-hover:` guard (`@media (hover:hover) and (pointer:fine)`).
  Anything discoverable only via hover is invisible to every touch user.
- **Staggering:** `Math.min(index, 6) * 40`ms, total sequence ≤400ms, one-shot.
- **Decorative JS effects** (bursts, ambient layers) must consult
  [`motionTier()`](../src/lib/motionTier.ts): `off` → render final state,
  `low` → capped counts / no ambient layers, `high` → full set. Load-bearing
  motion (spinners, modal transitions) does not consult it; OS reduced-motion
  already zeroes those via the global media query.
- **Budgets:** ≤1 `backdrop-blur` surface per screen (≤12px, never animated,
  with a high-opacity fallback bg); ≤3 persistent `will-change` elements
  app-wide (apply transiently otherwise); no rAF loop without a stop condition
  + `visibilitychange` pause.

## 5. Iconography

Lucide only, via `lucide-react` — sizes 16/20/24, `strokeWidth` ~1.75,
`currentColor`. Icons read as typography, not stickers: no emoji in UI chrome
(user content is fine), no oversized icons in tinted circles as decoration,
actionable icons always pair with a text label or `aria-label`.

## 6. Sunlight readability (light mode is the outdoor mode)

- Meaningful text: `rhozly-on-surface` or `rhozly-on-surface-variant` — never
  lighter greys / sub-50% opacities for content the user must read.
- Status is never colour-alone: icon + label redundancy.
- Disabled ≠ enabled by more than opacity.
- Every decorative effect must be non-load-bearing: if it washes out at max
  brightness in the garden, the UI still communicates everything.
- Touch targets ≥44×44px (`min-h-11 min-w-11`) — gardening gloves are real.

## 7. The anti-AI-look checklist (review with every UI PR)

1. No indigo/violet/purple accents outside the `status-ai` family.
2. No default neutral shadows on new surfaces (`shadow-md` etc.) — use the ramp.
3. One radius per role (card/control/chip/pill) — no novel radii.
4. No emoji as icons in chrome.
5. Hierarchy from size × weight × tracking × colour — not `font-bold` alone.
6. Every interactive element has press feedback + `focus-visible` ring.
7. No bare `hover:` without `active:` twin or `can-hover:` guard.
8. Copy is specific and warm ("3 beds need water before Saturday's heat"),
   never boilerplate ("Manage your garden seamlessly").
9. Motion is attached to meaning (completion, opening, arrival) — never a
   uniform fade-in on everything.
10. `bg-rhozly-surface-lowest` for cards, not `bg-white`.

---

*Changing a token? Update this file, the app-reference twin
(`99-cross-cutting/40-design-system.md`), and check the high-contrast
overrides in `src/index.css` still cover the affected utilities.*
