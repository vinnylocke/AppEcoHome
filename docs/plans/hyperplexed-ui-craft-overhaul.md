# Hyperplexed UI Craft Overhaul — make Rhozly look handcrafted, feel incredible, and be extremely easy to use

**Status:** awaiting approval · **Date:** 2026-07-18 · **Orchestrator:** Fable 5 (multi-agent research: 3 web researchers + 4 codebase auditors)

---

## 1. What the goal is

The user asked to study **Hyperplexed** (youtube.com/@Hyperplexed, ~656K subs — the channel that deconstructs Linear/Stripe/Vercel/Twitch micro-interactions), apply his UI concepts to Rhozly, make the UI look **less AI-generated and incredible**, and make the app **extremely easy to use**.

Three research findings frame the whole plan:

1. **The "AI-generated look" is the statistical mean of Tailwind defaults** — indigo gradients, uniform `rounded-xl shadow-md` cards, Inter-for-everything with default tracking, emoji as icons, zero or uniform motion. The cure is not decoration; it is *token discipline plus purposeful micro-interactions*.
2. **Rhozly already has a real brand** ([Rhozly-Brand-Guidelines.pdf](../../Rhozly-Brand-Guidelines.pdf) v1.0, July 2026): warm off-white ground, one confident green (#075737), Plus Jakarta Sans + Inter, pill buttons, 16–24px card radii, hairline outlines, Lucide-only icons, "green leads, colour follows", "plain-spoken". The overhaul's job is to **enforce and deepen this identity**, not to import Linear's dark aesthetic.
3. **Most Hyperplexed effects are cursor effects, and Rhozly is a touch-first Capacitor PWA used outdoors.** The porting rule: rebind the visual payoff to touch-native triggers (press, completion, entrance), animate only `transform`/`opacity`, honor `prefers-reduced-motion`, and audit contrast for sunlight.

## 2. App-reference files consulted

- [00-INDEX.md](../app-reference/00-INDEX.md)
- [02-dashboard/17-home-main.md](../app-reference/02-dashboard/17-home-main.md), [02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
- [03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md)
- [04-planner/01-planner-dashboard.md](../app-reference/04-planner/01-planner-dashboard.md), [04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md)
- [05-tools/01-tools-hub.md](../app-reference/05-tools/01-tools-hub.md), [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md)
- [09-persistent-ui/01-header.md](../app-reference/09-persistent-ui/01-header.md), [09-persistent-ui/02-sidebar.md](../app-reference/09-persistent-ui/02-sidebar.md)
- [99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md), [30-onboarding-state.md](../app-reference/99-cross-cutting/30-onboarding-state.md), [34-accessibility.md](../app-reference/99-cross-cutting/34-accessibility.md)
- Modal chain refs: [08-modals-and-overlays/03-plant-source-picker.md](../app-reference/08-modals-and-overlays/03-plant-source-picker.md), [05-plant-search-modal.md](../app-reference/08-modals-and-overlays/05-plant-search-modal.md), [07-plant-assignment-modal.md](../app-reference/08-modals-and-overlays/07-plant-assignment-modal.md), [16-bulk-config-modal.md](../app-reference/08-modals-and-overlays/16-bulk-config-modal.md), [23-global-quick-add.md](../app-reference/08-modals-and-overlays/23-global-quick-add.md)

**Drift found while auditing (fix alongside the affected phases):** `09-persistent-ui/02-sidebar.md` lists a stale nav (Garden Hub / Schedule / Watchlist / Visualiser — actual navLinks are Quick/Dashboard/Plants/Planner/Journal/Notes/Tools/Integrations/Head Gardener); `99-cross-cutting/21-routing.md` quick-add table documents 7 items vs 9 shipped. There is **no styling/design-system cross-cutting reference at all** — this plan creates one.

## 3. Audit headlines (what's actually wrong today)

**Token layer** (`src/index.css` @theme, Tailwind v4 CSS-first — no tailwind.config):
- Only 13 tokens exist (10 colors + 3 fonts). No radius, shadow, motion, easing, or keyframe tokens.
- **293 entrance animations are silent no-ops** — `animate-in fade-in` etc. is the tailwindcss-animate idiom but the plugin is not installed; every modal/toast pops with no transition.
- **`font-black` (900) is the most-used weight (2,614 uses) but the max loaded weight is 800** — nearly every heading is browser-synthesized faux-bold.
- **Phantom class `text-rhozly-on-surface-variant` used 165 times but never defined** — silently inherits parent color.
- PWA `theme-color` is stock emerald `#10b981`, not brand `#075737`. Google Fonts loaded via render-blocking `@import`. Dead `src/App.css`. Both `framer-motion` and `motion` installed; 1 consumer.
- ~3,400 stock-palette classes across 22 hue families; 1,800+ arbitrary `text-[10px]`-style sizes; 12 distinct radii; default neutral shadows everywhere — except a few hand-rolled **green-tinted shadows** (e.g. HomeDashboard hero) that are exactly the right idea, never tokenised.

**Component layer:** essentially none. No Button/Card/TextField/Tabs primitives — 310 component files copy-paste class strings with measurable drift (3 competing primary-button hover treatments, 4 competing input recipes, 2 tab dialects, ~103 hand-rolled `fixed inset-0` modal shells on an ad-hoc z-index ladder, roughly half without focus trap/ARIA). ConfirmModal, EmptyState, SurfaceLoader, InfoTooltip are good but barely adopted. The Toaster is a bare unbranded default. Emoji in 70 files.

**Surfaces** (impact ranking): 1) Dashboard — two sub-tabs *both meaning dashboard*, 8–12 equally-weighted cards deep, a 22-tile stat wall; 2) Shell/nav — no mobile bottom tab bar (every nav is 2 taps via hamburger; `pb-28` reserve already exists), flat saturated green header; 3) The Shed — 5 stacked control rows eat ~40% of first viewport, plant cards carry 10+ interactive elements incl. six always-visible ghost icons and emoji chips; 4) Plant Lens — desktop file-upload layout for a camera-first flow, four clashing pastel action buttons, frozen-feeling 5–15s AI wait; 5) Routines — hover-only actions invisible on touch, schedule rhythm as a 10px footnote; 6) Planner — three competing creation CTAs, grey empty covers.

**Ease of use** (top issues): Dashboard/Overview duplication; "diagnose a plant" buried 2 levels deep under 3 different names (Plant Lens / Plant Doctor / /doctor) and missing from Quick Add; Quick Add has 9 items with 3 task-shaped entries; recurring tasks named 4 ways (Blueprints / Task Schedules / Routines / "Add Task Automation"); Journal vs Notes as separate top-level tabs; orphan routes (`/schedule`, `/management`) with no nav parent; up to 5 stacked promo cards on first run; add-plant traverses up to 4 stacked modals.

## 4. The design direction (one paragraph)

**Rhozly should feel like a hand-built garden tool from the team that read the brand book.** Warm off-white ground, white cards with hairline outlines and *green-tinted* soft shadows, pill buttons, Jakarta headlines at true weights with tightened tracking, one green leading everywhere, functional accents used softly per the brand recipe (`{colour}-50` fill / `-200` border / `-700/800` text). On top of that: Hyperplexed-style *craft in motion* — everything presses down like a real button, lists cascade in with a capped stagger, plant photos glow ambiently, completing a task bursts leaves, and AI moments get one sparkling signature treatment. Nothing tracks a cursor; everything responds to a thumb.

## 5. The plan — six phases

Each phase is independently shippable and separately approvable. Tests + app-reference updates are listed per phase (both are mandatory per CLAUDE.md).

### Phase 0 — Fix what's silently broken (small, high value, zero visual risk)

| # | Change | Files |
|---|--------|-------|
| 0.1 | Define the missing entrance keyframes in `@theme` (fade-in, zoom-in-95, slide-in-from-bottom/right, + exit twins) so the existing 293 `animate-in` call sites start working. Prefer defining our own keyframes over adding the plugin dependency — we control easing/duration tokens in the same block. | `src/index.css` |
| 0.2 | Define `--color-rhozly-on-surface-variant` (muted text token, ~`#5c5f5d`) — un-breaks 165 usages. | `src/index.css` |
| 0.3 | Self-host **variable** Inter + Plus Jakarta Sans (preload, `font-display: swap`), replacing the render-blocking Google Fonts `@import`. Variable fonts kill the faux-bold problem without touching 2,614 `font-black` call sites (weights clamp to the real 800 max instead of synthesizing). | `src/index.css`, `index.html`, `public/fonts/` |
| 0.4 | Align PWA `theme-color` to `#075737`. | `index.html` |
| 0.5 | Brand the Toaster via `toastOptions` (surface-lowest bg, outline border, rounded-2xl, brand success/error) — instantly fixes 60+ call sites. | `src/App.tsx` |
| 0.6 | Delete dead `src/App.css`; remove the duplicate `motion` package (keep `framer-motion` for now; final keep/drop decided in Phase 2). | `src/App.css`, `package.json` |

*Tests:* visual smoke via existing Playwright suite (no selector changes). *App-reference:* none yet (34-accessibility.md unaffected — reduced-motion block already exempts these).

### Phase 1 — The token layer (the anti-AI-look foundation)

Expand `@theme` in `src/index.css` into a complete brand-locked system, then write it down:

- **Radius tokens:** `--radius-card: 1.5rem` (rounded-3xl, brand's 16–24px band), `--radius-control: 1rem`, `--radius-chip: 0.5rem`, pills stay `rounded-full`. Convention documented; stragglers (`rounded-[2.5rem]`, `lg`, `md`) migrated opportunistically per-surface in Phase 4, not by blind codemod.
- **Green-tinted shadow ramp** (3 steps: `--shadow-card` / `--shadow-raised` / `--shadow-overlay`) promoted from the existing hand-rolled `rgba(7,87,55,…)` one-offs — Stripe's "chromatic shadows" principle with Rhozly's green. Replaces default `shadow-md/lg/xl` as surfaces are touched.
- **Motion tokens:** duration steps (100/150/200/300), easings (`--ease-out-quart`, spring release `cubic-bezier(0.34,1.56,0.64,1)`), and the keyframes from 0.1 plus `fade-up`, `sparkle`, `pop` (for staggered grids).
- **Semantic status tokens** implementing the brand book's functional-colour recipe (amber=weather, blue=watering, sky=sensors, emerald=success, violet=AI, rose=watchlist, red=danger; each as `-fill/-line/-ink` mapped to the 50/200/700 recipe) so the 3,400 stock-palette usages get sanctioned, consistent equivalents.
- **`can-hover` variant** (`@media (hover:hover) and (pointer:fine)`) + project rule: no bare `hover:` without an `active:` twin or a `can-hover:` guard (kills sticky-hover on touch).
- **Brand gradient token** (`#063d28 → #075737`, currently duplicated as raw hex in `shepherdTheme.css`).
- **`motionTier()` util** in `src/lib/motion.ts` — returns `'high' | 'low' | 'off'` from `prefers-reduced-motion`, `deviceMemory`, `hardwareConcurrency`; every JS-driven effect reads it. Unit-tested.
- **Micro type sizes** `text-2xs`/`text-3xs` to absorb the 1,800+ arbitrary `text-[Npx]` uses over time.

**New docs:** `docs/DESIGN.md` (palette, type scale + tracking, radius, elevation ladder, motion tokens, icon rules, the can-hover/active rule, compositor-only animation law, sunlight-contrast rules) and a new app-reference cross-cutting file `99-cross-cutting/40-design-system.md` (+ 00-INDEX row).

*Tests:* Vitest for `motionTier()`; typecheck; no behavioural change. *App-reference updates:* new 40-design-system.md, 00-INDEX.md, touch-up 34-accessibility.md (motionTier + can-hover interplay).

### Phase 2 — The primitive tier (`src/components/ui/`)

Extract the six primitives the audit showed are copy-pasted everywhere, all built on Phase 1 tokens, all with `data-testid` passthrough:

| Primitive | Locks in | Source of truth |
|-----------|----------|-----------------|
| `<Button>` (primary/secondary/ghost/destructive × sm/md/lg) | Pill radius per brand book; ONE hover (bg shift, `can-hover`-gated) + press language (`active:scale-[0.97]`, spring release, `touch-manipulation`, no tap-highlight); one disabled opacity; 44px min target | best current recipes + brand p.6 |
| `<Card>` / `<Card interactive>` | `bg-rhozly-surface-lowest` (normalizes bg-white drift), hairline outline, `--radius-card`, `--shadow-card`; interactive = HomeDashboard hero's press/elevation language (the app's best existing card, generalized) | `HomeDashboard.tsx` hero |
| `<ModalShell>` / `<BottomSheet>` | Portal + `useFocusTrap` + ARIA + ONE overlay recipe + a `Z` scale constant + enter/exit motion — extracted from ConfirmModal, fixing the a11y gap in the ~50 untrapped modals as they migrate | `ConfirmModal.tsx` |
| `<TextField>` / `<SelectField>` | The filled surface-low language (most common today), border+soft-ring focus, label/error slots, 44px baked in | `AddTaskModal.tsx` recipe 1 |
| `<SegmentedTabs>` | Proper tablist ARIA + arrow keys + sliding active-pill indicator; ends the two-dialect split across 25+ files | `TaskList.tsx` dialect A |
| `<NoticeStrip tone>` | Token-derived tones for the 4 banners → picks up high-contrast support the raw-palette versions currently bypass | `OfflineBanner.tsx` |

Plus: an `<Icon>` wrapper enforcing Lucide sizes 16/20/24 at strokeWidth 1.75 (brand p.7); adopt `SurfaceLoader` on the ~15 highest-traffic loading paths and `EmptyState` in TaskList's inline duplicate. Migration is **incremental**: primitives land first, the top ~20 surfaces adopt in Phase 4; no big-bang codemod.

*Tests:* Vitest where logic exists; Playwright unaffected initially (testids preserved); Page Objects updated as surfaces adopt. *App-reference:* 40-design-system.md gains the primitive catalogue; 17-confirm-modal.md and 10-toaster.md touched.

### Phase 3 — Signature moments (the Hyperplexed layer, touch-adapted)

Verdicts from the technique research, mapped to Rhozly. Everything is `transform`/`opacity`-only, `motionTier()`-gated, one-shot:

| Technique (source video) | Verdict | Rhozly application |
|---|---|---|
| Layered offset press ("Twitch has Created the Ultimate CSS Hover Effect") | **Adopt app-wide** — the one hover effect that converts perfectly to `:active` | The press language already baked into `<Button>`/`<Card interactive>` in Phase 2 |
| Particle burst ("…Hover Effect This EXPLOSIVE") | **Adopt, event-driven** | Leaf/petal burst on task complete, watering logged, checklist finished — `spawnBurst(x,y)` util in `src/lib/burst.ts` (WAAPI, 12–16 particles, capped by `motionTier`, unit-tested) |
| Staggered grid ripple (AnimeJS grid video) | **Adopt, capped** | Entrance cascade on Shed grid / task list / planner grid: `Math.min(index,6) * 40ms`, ≤400ms total, IntersectionObserver-triggered below the fold, one-shot |
| Ambient photo glow (YouTube Ambient Mode genre) | **Adopt — best brand fit** | Plant photos get a blurred duplicate behind them (`scale-110 blur-3xl saturate-150 opacity-50`, static, no canvas) on plant card heroes, Plant Detail, Doctor results — the garden's own colours glow, exactly "green leads, colour follows" |
| Sparkle text (Linear "Shouldn't Be Possible") | **Adopt, one per screen** | The AI signature: sparkle accent (3 SVG stars, brand-green/tertiary-rose tinted) on the Plant Lens tile and AI result headers — replaces the violet-badge convention drifting in today |
| Text scramble ("Ultimate Hacker Effect") | **Adapt softly** | Too "hacker" for a warm garden brand as-is; a gentler letter-settle variant on the identified species name when Gemini resolves — Phase 5 (Plant Lens), optional |
| Glow-border cards (Linear hover) | **Desktop-only, later** | `can-hover`-gated green-tint variant on desktop plan cards — backlog, not in scope |
| Magic-mouse reveal (Canva) | **Feature idea, backlog** | "Rub to compare" before/after photos in Plant Doctor — genuinely good touch-native use; separate feature plan if wanted |
| Magnetic buttons, cursor-proximity text, Three.js pixelation, SVG turbulence | **Skip** | No cursor / wrong cost profile for a mobile WebView (bundle, battery, low-end GPU) |

Also codified here (from the mobile-adaptation research): backdrop-blur discipline (≤1 blurred surface per screen, ≤12px, never animated, high-opacity fallback), will-change budget (≤3 persistent app-wide), sunlight rules (no meaningful text below gray-800-equivalent, state never conveyed by glow alone, light mode is the outdoor mode).

*Tests:* Vitest for `burst.ts` + stagger helper; Playwright: assert reduced-motion path renders final state. *App-reference:* 40-design-system.md "signature moments" section.

### Phase 4 — Surface redesigns (audit impact order)

Each is its own PR-sized task adopting Phases 1–3; per-surface app-reference + e2e-test-plan rows updated in the same task.

1. **Shell & nav** — add a **mobile bottom tab bar** (Home / Plants / Planner / Plant Doctor / Tools; the `pb-28` reserve already exists), group the sidebar into labelled clusters (Garden / Plan / AI), soften the active state (left accent bar + tint instead of white pill), refine the header (deep-green gradient per brand's immersive header, tightened icon cluster). *Refs to update:* 01-header.md, 02-sidebar.md (fixing the stale-nav drift at the same time), 21-routing.md.
2. **Dashboard** — **merge the "Dashboard" and "Overview" sub-tabs into one home** (the #1 usability fix; Overview's remaining cards fold behind HomeMain's existing Simple/Detailed toggle), compose a real hero (greeting + status + brief at one visual weight hierarchy), replace the slash-separated day-strip numbers with per-day stacked-dot sparklines, rationalize the 22-tile stat wall (hide zeros, promote 3–4 headline metrics, demote the rest), **single-slot onboarding** (one promo/onboarding card at a time, priority-ordered; notification/PWA prompts become checklist steps). *Refs:* 17-home-main.md, 01-dashboard-tab.md, 06-getting-started-checklist.md, 30-onboarding-state.md.
3. **The Shed** — collapse 5 control rows into one toolbar (search + filter popover + view toggle), redesign the plant card (kebab overflow for the six ghost icons, keep favourite + Assign primary; Lucide chips replace emoji; image-forward ratio), genus-tinted initial placeholder system instead of the shared Unsplash pothos. *Refs:* 01-the-shed.md.
4. **Plant Lens** — camera-first mobile layout (near-full-bleed capture, actions as overlay sheet), one neutral treatment for the four action buttons (colored icons, not four pastel palettes), staged AI-wait experience ("Reading the photo… identifying… checking for issues…") over a blurred copy of the user's photo, sparkle signature on results, optional letter-settle species reveal. *Refs:* 02-plant-doctor.md, 13-ai-gemini.md (no API changes — presentation only).
5. **Routines** — type colour-coding via the status tokens (left accent keyed to the existing getTaskIcon colours — semantic, so sanctioned), a 30-day dot-track frequency strip replacing the "Next: date · date" footnote, always-visible actions on touch, real filter count badge. *Refs:* 07-blueprint-manager.md.
6. **Planner** — one primary "New Plan" with a split menu for the two Sage+ AI modes, plan-kind-tinted gradient cover placeholders, phase-progress bar on cards, radius normalized to `--radius-card`. *Refs:* 01-planner-dashboard.md.

### Phase 5 — Ease-of-use IA pass (cross-cutting, strings + routing)

The remaining usability top-10 not absorbed by Phase 4: prune **Quick Add to ~5 verbs** (and add "Diagnose a Plant" → `/doctor`); **one-name standardization** — "Routines" everywhere for blueprints, "Plant Doctor" everywhere for the lens (strings-only, outsized comprehension payoff); **merge Journal + Notes** into one surface with an attached/unattached filter; **re-parent orphan routes** (`/management` under Locations, `/schedule` as a Planner "Routines" tab, matchPaths fixed so the rail never goes blank); conditional nav for Integrations/Head Gardener (hide until relevant); Shepherd tour audit 25 → ~8. *Refs:* 23-global-quick-add.md, 21-routing.md, 11-global-journal.md, 03-location-manager.md, 07-blueprint-manager.md, 05-tools/01+02, plus Page Objects for every renamed label.

**Deliberately out of scope:** dark mode (brand book defines none; the token layer leaves the door open), the add-plant stepper consolidation and Instance-Edit tab merge (real feature work — separate plan if wanted), rub-to-compare, marquee, any WebGL.

## 6. Risks & mitigations

- **Playwright breakage from renamed labels/headings** — every Phase 4/5 task updates the affected Page Objects + `docs/e2e-test-plan/` rows in the same task; Phases 0–3 are selector-neutral.
- **Shepherd tours target nav/DOM that Phase 4.1/5 moves** — tour steps audited in the same tasks (flowRegistry.ts).
- **Wide visual diffs** — phases are incremental and per-surface; no blind codemods; `npm run typecheck` + `npm run build` gate every task (build is stricter than tsc — known project rule).
- **Perf regressions on low-end Android** — compositor-only law + motionTier + backdrop-blur/will-change budgets are codified in DESIGN.md and enforced in review; on-device throttled-CPU check added to the release checklist.
- **Font swap (0.3) shifts metrics slightly** — variable fonts are metric-compatible with the Google-hosted statics; verified visually before merging.
- **IA changes (Dashboard merge, Journal+Notes) alter deep links** — old `?view=overview` and `/notes` redirect to their new homes; 21-routing.md updated.

## 7. Implementation orchestration (per Model Routing Policy)

Phases 0–1: sonnet (routine/pattern work) with opus review. Phase 2 primitives + Phase 4 surface redesigns: opus (`uiux-feature-implementer`-grade), one surface at a time, fresh `code-reviewer` after each. Phase 3 effect utils: sonnet + `test-writer`. Phase 5: sonnet (strings/routing) with opus review on routing changes. Fable orchestrates, plans each task, and reviews cross-cutting integration. No deploys without explicit human go-ahead, as always.

## 8. Suggested approval granularity

Approve the whole plan, or start with **Phase 0 + 1** (invisible-to-slightly-visible foundation, fixes real bugs) and review the result before green-lighting the visible phases.
