# UI Wave 2 — Cross-cutting components

## Goal

Build the three shared components that will lift dozens of surfaces by ~3-7 points each in subsequent waves:

1. **`<InfoTooltip>`** — click-to-reveal explanation popover for jargon/technical fields.
2. **`<EmptyState>`** — consistent empty-list / empty-grid hero with icon + title + body + optional CTAs.
3. **`<SurfaceLoader>`** — skeleton loading state that matches the surface's actual shape (card grid / list / form / stats / detail).

Plus light persona-aware behaviour wired into `<InfoTooltip>` so the value of capturing persona in Wave 1 starts to show.

This wave **does not** mass-refactor every existing surface — Waves 3+ do that. We integrate into **3 smoke-test surfaces** to validate the APIs:

- `<InfoTooltip>` → drop into LocationManager's metrics modal (the audit's headline jargon offender).
- `<EmptyState>` → drop into PlantLibrarySearchTab's "tap Search to begin" state + TheShed's empty state.
- `<SurfaceLoader>` → drop into PlantLibrarySearchTab's "Searching…" state + the Planner Dashboard skeleton.

---

## API designs

### `<InfoTooltip>`

```tsx
<InfoTooltip>
  Soil pH affects which plants thrive here. Most gardens sit between 6.0–7.0.
</InfoTooltip>

// With a custom trigger label (defaults to "?"):
<InfoTooltip label="pH explained">…</InfoTooltip>

// Forced visible (overrides persona-based hiding):
<InfoTooltip alwaysShow>…</InfoTooltip>
```

Behaviour:
- Renders as a small inline `?` icon (`HelpCircle` from lucide, 14px).
- Tap (mobile) or click (desktop) reveals a popover anchored below-right of the trigger; second tap or outside-click dismisses.
- Keyboard: focusable button, Space/Enter toggles, Escape dismisses.
- Popover body is the children prop.
- `aria-describedby` on the trigger references the popover when open.
- **Persona-aware**: when `persona === "experienced"` AND `alwaysShow !== true`, the trigger renders as a dimmed muted dot (40% opacity). Click still works — experts can still tap if they want — but it doesn't draw attention. New gardeners (or null persona) get the full-attention `?`.

### `<EmptyState>`

```tsx
<EmptyState
  icon={<Leaf size={40} />}
  title="No plants yet"
  body="Your Shed is empty — start by searching for a plant or scanning a label."
  primaryCta={{ label: "Add a plant", onClick: handleAdd, icon: <Plus size={16} /> }}
  secondaryCta={{ label: "Scan a label", onClick: handleScan }}
  size="md"
/>
```

Variants:
- `size="sm"` — inline, compact (e.g. "No companions found" inside a tab).
- `size="md"` — card-sized hero (most common).
- `size="lg"` — full-page hero (e.g. brand-new planner dashboard).

Visual treatment:
- Centred content stack.
- Icon in a soft circular bg matching `rhozly-primary/10`.
- Title font-black, body font-bold opacity 60%.
- Primary CTA is the solid green button; secondary is a text link.
- Outer container uses dashed border + low-saturation bg by default; suppressible via `chrome="none"` if the surface already has its own card.

### `<SurfaceLoader>`

```tsx
<SurfaceLoader shape="card-grid" count={3} />
<SurfaceLoader shape="list" count={5} />
<SurfaceLoader shape="form" />
<SurfaceLoader shape="stats-strip" />
<SurfaceLoader shape="detail-page" />  // hero + body skeleton
<SurfaceLoader shape="spinner" label="Searching the library…" />  // fallback minimal
```

Skeletons use the existing Tailwind `animate-pulse`. Bones use `bg-rhozly-surface-low` and `bg-rhozly-outline/10`. No exotic dependencies.

`shape="spinner"` is the escape hatch for surfaces where a skeleton would be misleading (e.g. an ad-hoc compute job) — renders a centred Loader2 with an optional explanatory label.

---

## App-reference files consulted

- [`docs/app-reference/07-management/02-locations.md`](docs/app-reference/07-management/02-locations.md) — LocationManager's metrics fields are the canonical InfoTooltip targets.
- [`docs/app-reference/02-dashboard/03-the-shed.md`](docs/app-reference/02-dashboard/03-the-shed.md) — TheShed empty state.
- [`docs/app-reference/07-management/10-plant-library-admin.md`](docs/app-reference/07-management/10-plant-library-admin.md) — Search Lab loading + empty states.

---

## Files

| File | Change |
|---|---|
| `src/components/shared/InfoTooltip.tsx` | NEW — popover with persona-aware visibility. |
| `src/components/shared/EmptyState.tsx` | NEW — sm/md/lg variants + CTAs. |
| `src/components/shared/SurfaceLoader.tsx` | NEW — skeleton shapes. |
| `src/hooks/usePersona.ts` | NEW — lightweight read-only persona hook used by InfoTooltip. |
| `tests/unit/components/InfoTooltip.test.tsx` | NEW — open/close, kbd, persona-dim. |
| `tests/unit/components/EmptyState.test.tsx` | NEW — variants + CTA rendering. |
| `tests/unit/components/SurfaceLoader.test.tsx` | NEW — shape selection + count. |
| **Smoke-test integrations** | |
| `src/components/LocationManager.tsx` | Replace inline metric-field jargon with `<InfoTooltip>` on at least pH + lux + water movement. |
| `src/components/admin/PlantLibrarySearchTab.tsx` | Replace empty-state JSX with `<EmptyState>`; replace "Searching…" inline text with `<SurfaceLoader shape="spinner">`. |
| `src/components/TheShed.tsx` | Replace empty-Shed state with `<EmptyState>`. |

---

## Persona-aware copy — first taste

`<InfoTooltip>` reads persona via `usePersona()`. When persona is `"experienced"`:
- Trigger renders dimmed (40% opacity) so it's still tappable but doesn't shout.
- That's it for v1 — no popover content variants, just discoverability bias.

Newcomers (`"new"` or `null`) get the full-attention `?` indicator + popover behaviour exactly as before.

This validates the persona capture is doing something useful, without needing every surface to have two copy variants.

---

## Risks & edge cases

- **Popover z-index** — InfoTooltips often appear inside modals. The popover needs `z-[200]+` and to use `createPortal` so it can escape parent `overflow: hidden`. Confirmed in Wave 2 build.
- **`<EmptyState>` regression risk** — every surface I touch already has working empty states. The new component must look at least as polished as the existing ones, otherwise it's a downgrade. I'll lean on the design tokens already in use.
- **Skeleton dimensions** — `<SurfaceLoader shape="card-grid">` needs realistic card dimensions to avoid jarring "skeleton → real card" layout shifts. I'll match the dominant grid pattern (3 cols at ≥md, 1 col mobile).
- **Persona null vs not asked** — null = either an existing user who pre-dates Wave 1 OR a brand-new user who skipped the welcome. Either way, default to the "new" treatment (full-attention tooltips). Safer.

---

## Steps

1. Build `usePersona` hook.
2. Build `<InfoTooltip>` + tests.
3. Build `<EmptyState>` + tests.
4. Build `<SurfaceLoader>` + tests.
5. Smoke-test integrations into LocationManager + PlantLibrarySearchTab + TheShed.
6. Typecheck + unit tests.
7. Deploy via `npm run deploy --bump 1`. (No DB migration.)

---

## Definition of done

- All three components live in `src/components/shared/` with TS types + JSDoc + unit tests.
- Three surfaces use them in production.
- New gardener persona sees prominent `?` icons; experienced sees dimmed ones — visible difference in the smoke-test surface.
- `npx tsc --noEmit` clean. All 644+ existing unit tests still pass + new component tests pass.
- Wave 3+ surface refactors can lean on these components without further infrastructure work.
