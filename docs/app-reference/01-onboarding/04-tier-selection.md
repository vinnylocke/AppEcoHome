# Tier Selection

> One-time selection of the user's subscription tier — Sprout (free), Botanist, Sage, or Evergreen. Drives feature gating across the entire app.

**Trigger:** Shown after Home Setup if `profile.subscription_tier` is null.
**Source files:**
- `src/components/TierSelection.tsx` — the selector UI
- `src/constants/tiers.ts` — tier definitions

---

## Quick Summary

A side-by-side card grid (or stacked list on mobile) of all four tiers. Each card shows the icon, name, one-line vibe ("Best for: weekend gardeners with a few pots"), feature list, and a `goodFor` audience label. The user picks one, hits Continue, and `subscription_tier` plus `ai_enabled` plus `enable_perenual` flags get written to their profile.

---

## Role 1 — Technical Reference

### Component graph

```
TierSelection
├── Step indicator (Account · Home · Plan)
├── Title + subtitle
├── TierCard ×4 (Sprout / Botanist / Sage / Evergreen)
│   └── Each card:
│       ├── Icon
│       ├── Name + tier badge (e.g. "Most Popular")
│       ├── Vibe (one-line description)
│       ├── "Good for: ..." audience label
│       ├── Feature list (✓ rows)
│       └── (When selected) accent border + bg
├── Comparison Table (collapsible) — every feature × every tier
└── Continue button (calls onComplete)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `userId` | `string` | App.tsx | For the profile update |
| `onComplete` | `(tier, aiEnabled, perenualEnabled) => void` | App.tsx | Lifts the new tier values into App state |

### Tier definitions

From `src/constants/tiers.ts`:

| Tier | Price | aiEnabled | perenualEnabled | Notes |
|------|-------|-----------|-----------------|-------|
| Sprout | Free | false | false | Free baseline. Manual plant entries, no AI doctor, no Perenual provider. |
| Botanist | £X/mo | false | true | Adds Perenual plant database access. No AI. |
| Sage | £X/mo | true | true | Adds AI Plant Doctor + AssistantCard + AI generate-from-photo. |
| Evergreen | £X/mo | true | true | Top tier — same flags as Sage today; reserved for future Evergreen-exclusive features (Visualiser snapshots, advanced AI, etc.). |

Exact pricing strings live in `tiers.ts` and are subject to change.

### Data flow — write paths

```ts
supabase.from("user_profiles")
  .update({
    subscription_tier: selectedTier,
    ai_enabled:        TIERS[selectedTier].aiEnabled,
    enable_perenual:   TIERS[selectedTier].perenualEnabled,
  })
  .eq("uid", userId);
```

Then calls `onComplete(tier, aiEnabled, perenualEnabled)` so App.tsx can update its in-memory profile state without re-fetching.

### Edge functions invoked

None directly. Note: there's currently no payment integration — tier selection is "honour system" + admin-managed. Future billing integration would slot in here.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

This *is* the tier-gating screen — every other screen reads from `profile.subscription_tier`, `profile.ai_enabled`, and `profile.enable_perenual`.

### Beta gating

None.

### Permissions / role-based UI

None — the user is selecting for themselves only.

### Error states

| State | Result |
|-------|--------|
| Update fails | Error banner; user can retry |
| Network drops mid-flight | Same; profile may end up in a partial state |

### Performance notes

- Pure render. No fetches.
- Comparison table is hidden behind a collapse toggle for visual focus.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this screen

This is where you tell Rhozly how deeply you want it to help. The tiers are designed so a free user gets a working garden tracker (Sprout); an intermediate user gets access to the Perenual plant database for ID and care info (Botanist); an AI-engaged user gets the chatbot, photo diagnosis, and pattern insights (Sage); and an Evergreen user is committing to the full stack including features we're still building.

### Every flow on this screen

#### 1. Tap a tier card

- The card highlights with a coloured border. The feature list and "good for" label make the trade-off clear.
- You can change selection any time before tapping Continue.

#### 2. Read the comparison table

- Toggle "Compare features" to expand a table of every feature × every tier — useful when deciding between Botanist and Sage.

#### 3. Hit Continue

- Writes the tier to your profile. Lands you on the Garden Quiz prompt (or dashboard if you've already done the quiz).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Tier icon | Visual shorthand (🌱 / 🌿 / 🌳 / 🌲 etc.) |
| Vibe | One-line description of the intended user |
| Good for | Suggested audience |
| Feature list | What you get |
| "Most Popular" badge | Marketing pin — currently on Botanist |
| Compare features table | Full feature × tier matrix |

### Tier-by-tier experience on this screen

The screen itself is the same for everyone. The choice IS the differentiation. Once selected, every other screen behaves differently per the gating documented in tier-gating cross-cutting.

### New user vs returning user

- **Brand new user**: sees this once after Home Setup.
- **Returning user**: never sees this on the onboarding path again. To change tier later, go to Account Settings → Account tab → Switch Tier.

### Beta user experience

No difference. Beta status is a separate flag (`is_beta`) layered on top of any tier.

### Common mistakes / pitfalls

- **Picking Sprout to "save money" and then expecting AI features.** AI is paid. Sprout users see AI buttons gated with "AI tier required" messages.
- **Picking Evergreen for features not yet built.** Today Evergreen = Sage. Evergreen-exclusive features (Visualiser snapshots, advanced AI) are roadmap items — see deferred-items tracker.
- **Not reading "good for".** It's the one-line audience hint — most useful for deciding.

### Recommended workflows

- **Trying it out:** start on Sprout. Upgrade later.
- **Serious gardener with a phone:** Sage gives you the AI Plant Doctor + insights, which is the biggest value-add.

### What to do if something looks wrong

- **Selected tier didn't save:** check the AI button on Plant Doctor. If it still says "AI tier required" after picking Sage, the write failed. Go to Account → Switch Tier and re-pick.

---

## Related reference files

- [Home Setup](./03-home-setup.md)
- [Garden Quiz](./05-garden-quiz.md)
- [Account Tab](../06-account/01-account-tab.md) — tier switching post-onboarding
- [Tier Gating (cross-cutting)](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance

- `src/components/TierSelection.tsx` — UI
- `src/constants/tiers.ts` — tier definitions (single source of truth for tier metadata)
- `src/components/GardenerProfile.tsx` — Switch Tier flow (post-onboarding)
