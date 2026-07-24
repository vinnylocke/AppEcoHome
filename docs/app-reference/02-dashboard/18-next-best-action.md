# Next Best Action

> The Porch's single guided suggestion — ONE calm card that tells a new gardener the one thing to do next, deliberately without any counts. The Stage-4 sibling of the Workbench's ranked Attention inbox.

**Route / how to reach it:** Not a route — a section of the Home dashboard (`/dashboard`), rendered **only on The Porch** (persona `new`/`null`, the default posture). It is the `nextBestAction` entry in `HOME_PRESETS.porch.sectionOrder`; the Workbench omits it.
**Source files (entry points):**
- `src/components/home/NextBestAction.tsx`
- `src/components/home/HomeMain.tsx` (owns the posture composition + the shared, pre-filtered `attentionItems` list this card reads)

---

## Quick Summary

Next Best Action is the Porch's answer to "too much on the page": instead of an inbox of alerts and a wall of numbers, a newer gardener sees **one card, one suggestion, one tap**. It resolves the single most useful next step from a short priority ladder — the top real attention item if the garden flagged one, otherwise a gentle seasonal "browse what to plant" nudge — and shows no tallies at all. It is Porch-only by posture (the Workbench shows the full ranked Attention inbox instead), and it shares HomeMain's already-filtered attention list so the two postures never disagree about what matters most.

---

## Role 1 — Technical Reference

### Component graph

- `src/components/home/NextBestAction.tsx` — the whole surface: a single `<section data-testid="next-best-action">` wrapping one full-width `<button data-testid="next-best-action-cta">` (icon chip + "NEXT BEST THING TO DO" eyebrow + headline + one-line body + trailing arrow). No children.
- Mounted by `HomeMain` as the `nextBestAction` section (Porch `sectionOrder` only), immediately after the hero.

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `attentionItems` | `AttentionItem[]` | HomeMain's memoised, `ATTENTION_EXCLUDE_KINDS`-filtered attention list (from `useHomeOverview`) | Rung 1 of the ladder — `attentionItems[0]` is the top priority |
| `firstTaskTitle` | `string \| null` (optional) | **Wired since dashboard-nav-tasks-tray Stage 2 (2026-07-21, B6)** — HomeMain reads it synchronously from `TaskEngine.peekCache` (the same today cache key the compact TaskList warms), taking the first pending task's title; `null` on a cold first paint | Rung 2 of the ladder |

`AttentionItem` (from `src/hooks/useHomeOverview.ts`): `{ kind: string; title: string; body: string; route: string }`.

### State (local)

None. The card derives a single `Resolved` object (`{ icon, headline, body, go }`) inline from its props each render — no `useState`/`useReducer`.

### Data flow — read paths

- **No fetches of its own.** It is props-only. The attention data originates from HomeMain's `useHomeOverview(homeId)` call; HomeMain applies `ATTENTION_EXCLUDE_KINDS = ["overdue_tasks", "weather_alert"]` **once, in a memo**, and passes the result here — the SAME list the Workbench's `AttentionRow` renders. Filtering upstream (not in this component) is deliberate: it guarantees the Porch's one card and the Workbench's inbox rank identically.

### Data flow — write paths

None. The only action is navigation:

- **Rung 1 — first attention item** (`attentionItems[0]`): headline = `item.title`, body = `item.body`, icon = `AlertCircle`; tap → `navigate(item.route)`.
- **Rung 2 — first pending task** (`firstTaskTitle`): headline = the title, body = a fixed encouragement line, icon = `ListChecks`; tap → `navigate("/calendar")` (#12 — the calendar is the top-level Calendar section now). *(Wired in Stage 2 (B6) from `TaskEngine.peekCache` — the Porch now points at your actual next task when nothing is flagged. `null` on a cold first paint, so the ladder falls through to seasonal on a first-ever visit and fills from the next render once TaskList has fetched.)*
- **Rung 3 — seasonal fallback** ("Browse what to plant right now"), icon = `Sprout`; tap →
  - scrolls to the on-page learn section if present: `document.querySelector('[data-section="learn"]')?.scrollIntoView({ behavior: motionTier() === "off" ? "auto" : "smooth", block: "start" })` — the learn section is HomeMain's `SeasonalPicksCard` wrapper (`data-section="learn"`);
  - otherwise deep-links `navigate("/shed?open=add-plant")`.

The **no-counts contract** is a hard rule: none of the three rungs ever renders a bare tally (no "3 tasks", "2 overdue"). A unit test asserts the rendered text never matches `/\d+\s+(task|overdue|alert)/i`.

### Edge functions invoked

None directly. (Its data comes from HomeMain's `home-overview` call.)

### Cron / scheduled jobs that affect this surface

| Cron | What shows up here |
|------|--------------------|
| `run-automations` (5 min) / `integrations-ewelink-sync` / `analyse-weather` | Whatever the home flags (failed automation, low battery, dry soil, closing harvest) becomes rung 1's headline via `home-overview`'s `rankAttention` |

### Realtime channels

None of its own — it re-renders when HomeMain's inherited realtime wiring refreshes the overview data.

### Tier gating

None. Renders identically for Sprout / Botanist / Sage / Evergreen. It is gated by **posture** (Porch-only), not tier.

### Beta gating

None.

### Permissions / role-based UI

None.

### Error states

| State | What happens |
|-------|--------------|
| `home-overview` soft-failed (empty attention list) | The ladder falls straight through to the seasonal fallback — the card still renders one useful suggestion, never an error or an empty box |
| Learn section not mounted (e.g. a future posture without Seasonal Picks) | The seasonal fallback deep-links `/shed?open=add-plant` instead of scrolling |
| Reduced motion (`motionTier() === "off"`) | The scroll uses `behavior: "auto"` (no smooth animation) |

### Performance notes

- Zero data cost — props-only, no hooks, one derived object per render.
- One compositor-only hover transition; no looping animation.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

You don't open it — it opens for you, the moment a newer gardener lands on the Porch. The whole point of the redesign was that the old home page shouted the same numbers at you from seven places at once. For Sarah, who has a few plants and isn't yet fluent in the language of overdue counts and soil bands, that wall of figures is noise. Next Best Action replaces it with a single, warm instruction: *here is the one thing worth doing next.* No inbox to triage, no tallies to decode — just one card and one tap.

Marcus, the experienced gardener, never sees this card: his Workbench shows the full ranked Attention inbox because he *wants* the whole board. Same underlying priorities, two very different presentations — the newcomer gets calm guidance, the pro gets the console.

### Every flow on this page

1. **What the user sees:** one card headed "NEXT BEST THING TO DO", with an icon, a short headline, a one-line reason, and an arrow.
2. **What action they take:** a single tap anywhere on the card.
3. **What happens next:**
   - If the garden flagged something real (a harvest window closing on your tomatoes, a dry bed, a failed automation), the card *is* that thing — tapping deep-links you straight to it.
   - If nothing needs you, the card gently suggests "Browse what to plant right now" and scrolls you down to the Seasonal Picks (or, if that isn't on the page, opens the add-a-plant flow).
4. **Why a gardener cares:** it removes the paralysis of a busy screen. There is always exactly one recommended next step, chosen the same way the pro's inbox ranks its top item.
5. **Beginner framing** — "the app is telling me what to do next, and I trust it." **Expert framing** — "this is the head of the same priority queue my Workbench inbox shows, distilled to one line."

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "NEXT BEST THING TO DO" eyebrow | A fixed micro-label — this card is always the single recommended next step |
| Icon | A warning triangle for a real attention item, a checklist for a pending task, a sprout for the seasonal fallback |
| Headline | The attention item's title, or the task title, or "Browse what to plant right now" |
| Body line | A short reason or encouragement — never a count |
| Trailing arrow | Tap-through affordance; the whole card is the button |

There are, deliberately, **no numbers** on this card — no "3 tasks", no "2 overdue". Counts live on the hero and (on the Workbench) the console line.

### Tier-by-tier experience

Identical on every tier. Sprout through Evergreen all see the same one-card guidance on the Porch. (Whether the *underlying* attention item exists depends on your hardware and data, not your tier.)

### New user vs returning user vs power user

- **Brand new user** (no plants, nothing flagged): sees the seasonal "Browse what to plant right now" fallback — a calm way to get started.
- **Returning user** (a few plants): usually sees a real, specific next step when something needs attention, otherwise the seasonal nudge.
- **Power user:** doesn't see this card at all — they're on the Workbench with the full Attention inbox. (Anyone can switch to the Porch with the posture toggle to get the one-card view.)

### Beta user experience

No differences.

### Common mistakes / pitfalls

- **"Where's my list of alerts?"** The Porch shows only the single top one as this card. Flip the posture toggle to the Workbench for the full ranked inbox.
- **"It's only suggesting I browse plants — is it broken?"** No — that's the calm fallback shown when nothing actually needs you. It's good news.
- **Expecting a count on the card.** By design there isn't one — the Porch is deliberately number-light.

### Recommended workflows

1. **Daily glance:** read the hero sentence, then tap the Next Best Action card — it's the fastest path to the one thing worth doing.
2. **Nothing to do?** Follow the seasonal nudge into Seasonal Picks and get ahead of the season.
3. **Want the whole board?** Toggle to the Workbench for the full Attention inbox.

### What to do if something looks wrong

- **The card always shows the seasonal fallback even when you know a bed is dry:** the telemetry call (`home-overview`) may have soft-failed this visit — pull to refresh; if it persists, check the device on Integrations.
- **Tapping does nothing visible:** the seasonal fallback scrolls to Seasonal Picks lower on the page — scroll down to see where it took you.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — the parent surface; the posture composition, the shared `attentionItems` memo, and where this card sits in the Porch `sectionOrder`
- [Weather Alert Banner](./08-weather-alert-banner.md) — owns weather alerts (a `weather_alert` never reaches this card — it's excluded upstream)
- [Seasonal Picks Card](./14-seasonal-picks.md) — the seasonal-fallback scroll target (`data-section="learn"`) and the `/shed?open=add-plant` deep-link's spiritual cousin
- [Location Page (Drill-In)](./07-location-page.md) — a common deep-link destination for telemetry attention items
- [Garden Walk](./13-garden-walk.md) / [The Shed](../03-garden-hub/01-the-shed.md) — where the fallback's add-plant flow lands
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `home-overview` (`rankAttention`, the source of rung 1)
- [Design System — Tokens, Motion, Anti-Generic Rules](../99-cross-cutting/40-design-system.md) — `motionTier()` gates the scroll behaviour

## Code references for ongoing maintenance

- `src/components/home/NextBestAction.tsx` — the card: the `Resolved` ladder (attention → first task → seasonal fallback), the DOM-scroll to `[data-section="learn"]`, the `/shed?open=add-plant` fallback, the no-counts contract
- `src/components/home/HomeMain.tsx` — mounts it as the Porch's `nextBestAction` section; owns the memoised `attentionItems` (`ATTENTION_EXCLUDE_KINDS` filter) and the `[data-section="learn"]` wrapper it scrolls to
- `src/hooks/useHomeOverview.ts` — the `AttentionItem` type + the `home-overview` fetch feeding rung 1
- `src/lib/motionTier.ts` — gates smooth vs auto scroll
- `tests/unit/components/NextBestAction.test.ts` — the priority ladder (rungs 1–3), the scroll-vs-navigate branch, and the no-counts contract (5 tests)
- `tests/e2e/specs/home-main.spec.ts` — HOME-013 (on the Porch, the top attention item surfaces here)
