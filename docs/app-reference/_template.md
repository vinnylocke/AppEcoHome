<!--
  Copy this file when adding a new app-reference doc, then delete this comment block.

  Rules (also in CLAUDE.md → "App-reference documentation is mandatory"):
  1. EVERY file has BOTH Role 1 (technical) AND Role 2 (gardener). No exceptions.
  2. Section headings inside each role match this template — don't invent new ones.
  3. Role 1 tone: precise + factual. Role 2 tone: warm + opinionated. Never blur them.
  4. Add this file to docs/app-reference/00-INDEX.md in the right folder section.
  5. Code references go in the final section so future readers know where to look.
  6. Cross-link liberally in "Related reference files".
-->

# [Area Name]

> **One-line summary** describing what this surface is for. Aim for a phrase a beginner gardener and a senior dev would both nod at.

**Route / how to reach it:** `/path` or "Open via X button in Y modal"
**Source files (entry points):**
- `src/components/Foo.tsx`
- `src/components/sub/Bar.tsx`

---

## Quick Summary

2–3 sentences. What does this screen exist for, and what's the dominant intent of someone opening it?

---

## Role 1 — Technical Reference

### Component graph

Bullet list of every component rendered on this surface. Each line includes the file path and a one-line role.

### Props received

If this surface is a component (modal / tab), list every prop with its type and what passes it.

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| ... | ... | ... | ... |

### State (local)

Every `useState` / `useReducer` declared in the entry component. What it holds, what writes to it, what reads it.

### Data flow — read paths

For each query the surface makes (Supabase, edge fn, external API), document:

- **What it calls** (`supabase.from('table').select(...)` / `supabase.functions.invoke('fn-name')` / `fetch(url)`)
- **When it fires** (mount, prop change, user action, realtime event)
- **Input shape** (TypeScript interface or example payload)
- **Output shape** (same)
- **RLS / auth gate** (`requireAuth`, `guardAiByHome`, RLS policies that apply)
- **Caching** (in-memory, sessionStorage, localStorage, Supabase response cache, image proxy)

### Data flow — write paths

Every mutation the surface produces.

- **Triggered by** (button, drag, modal save, automation)
- **Input shape**
- **Side effects** (cascades to other tables, realtime broadcasts, automation triggers)
- **Optimistic UI** (yes / no, and which state it touches)
- **Offline behaviour** (does it queue via `offlineQueue.enqueue()`?)
- **Error path** (toast, Sentry capture, retry)

### Edge functions invoked

Per function: name, when it's called, input, output, what it touches downstream.

### Cron / scheduled jobs that affect this surface

Even if the screen doesn't call them, list any cron job whose output shows up here.

### Realtime channels

Any `supabase.channel()` subscriptions the surface joins, and what triggers re-fetch.

### Tier gating

What does this surface look like for:
- **Sprout** (free)
- **Botanist** (paid, no AI)
- **Sage** (paid + AI)
- **Evergreen** (top tier, everything unlocked)

Field-by-field if behaviour differs.

### Beta gating

What appears only for `profile.is_beta = true`? (BetaFeedbackBanner, beta-only features.)

### Permissions / role-based UI

For multi-member homes, what changes based on `can("permission.key")` checks? Reference exact permission keys used.

### Error states

Every catchable error path on the surface:
- Network failure → ?
- Empty data → ?
- Stale cache → ?
- Auth expired → ?
- Tier insufficient → ?

### Performance notes

- Lazy-loaded components
- Image optimisation
- Realtime subscription costs
- Known slow queries

### Linked storage buckets

If the surface uploads / reads from Supabase Storage, list the buckets and path patterns.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

3–4 paragraphs. What life-with-a-garden problem does this screen solve? Frame it for both a Sarah (amateur) and a Marcus (expert).

### Every flow on this page

For each interactive element on the screen, document:

1. **What the user sees** (the visible affordance)
2. **What action they take** (tap / drag / scroll)
3. **What happens next** (the immediate visible result, and any background work)
4. **Why a gardener cares** (when would this matter to them, what insight does it give)
5. **Beginner framing** vs **expert framing** — same flow, different mental models

### Information on display — what every field means

Every label, number, chip, icon, status colour on the surface. Be explicit. "Lux ≥ 50,000 = full sun" type explanations.

### Tier-by-tier experience

How is the page different for Sprout / Botanist / Sage / Evergreen users? Where do upgrade gates appear?

### New user vs returning user vs power user

- **Brand new user** (no home, no plants): what do they see? Where are they nudged next?
- **Returning user** (a few plants, a few tasks): typical glance pattern.
- **Power user** (50+ plants, multiple locations, devices wired in): how does the surface stay useful?

### Beta user experience

Anything they see that non-beta users don't.

### Common mistakes / pitfalls

What does a gardener typically misunderstand on this screen? E.g. "users assume Lux is a daily reading not a snapshot."

### Recommended workflows

A short "to do X, follow this path" recipe for the 2–3 most common goals on this surface.

### What to do if something looks wrong

The user's recovery actions. "Refreshed but still stale? Tap the cloud chip / re-sync / clear cache."

---

## Related reference files

- Link to every other doc that materially overlaps.

## Code references for ongoing maintenance

- `src/components/Foo.tsx:42` — entry point
- `supabase/functions/bar/index.ts` — edge function this surface calls
- `supabase/migrations/YYYYMMDD_baz.sql` — schema this surface depends on
