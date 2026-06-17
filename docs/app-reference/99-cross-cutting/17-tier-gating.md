# Tier Gating — Sprout / Botanist / Sage / Evergreen

> Four subscription tiers gate features. Two flags on `user_profiles` drive gating: `ai_enabled` (Sage / Evergreen) and `enable_perenual` (Botanist+). The tier itself is stored in `subscription_tier`.

---

## Quick Summary

| Tier | `ai_enabled` | `enable_perenual` | Highlights |
|------|-------------|--------------------|------------|
| Sprout (free) | false | false | Manual everything + **5 free Plant Doctor identifications per rolling 7-day window** (Sprint 3, 2026-06-15). No diagnosis. No Perenual. |
| Botanist | false | true | + Perenual plant database. Same free identify quota as Sprout. |
| Sage | true | true | + AI Plant Doctor (identify + diagnose + pest + Multi-ID, all unlimited) + Chat + photo-to-task + AI optimise |
| Evergreen | true | true | Same flags as Sage; reserved for future exclusives (Visualiser AI, advanced AI) |

**Free Plant Doctor identify carve-out (Sprint 3, 2026-06-15):** `identify_vision` is the only AI action a Sprout / Botanist user can call. It runs against a sliding-window quota (5 per 7 days, no calendar reset — every call's 7-day-old slot drops off as new ones land). Helper: [`supabase/functions/_shared/identifyQuota.ts`](../../../supabase/functions/_shared/identifyQuota.ts). Recorded via the existing `ai_usage_log` table — no new schema. Quota state is returned on every successful identify response so the client can update its badge without a second round-trip.

**Tier defaulting (Sprint 3, 2026-06-15):** New users no longer hit a Tier Selection screen on signup. The App.tsx onboarding flow now auto-assigns `'sprout'` + `ai_enabled = false` + `enable_perenual = false` when a profile lands with `subscription_tier IS NULL`. Upgrade is reachable via the `Upgrade Rhozly` entry in the user dropdown → `/gardener` (Account tab houses the picker).

---

## Role 1 — Technical Reference

### `TIERS` constant

Lives in `src/constants/tiers.ts`:

```ts
[
  { id: "sprout",    name: "Sprout",    ai_enabled: false, enable_perenual: false, ... },
  { id: "botanist",  name: "Botanist",  ai_enabled: false, enable_perenual: true,  ... },
  { id: "sage",      name: "Sage",      ai_enabled: true,  enable_perenual: true,  ... },
  { id: "evergreen", name: "Evergreen", ai_enabled: true,  enable_perenual: true,  ... },
]
```

### `user_profiles` columns

| Column | Type |
|--------|------|
| `subscription_tier` | text |
| `ai_enabled` | bool |
| `enable_perenual` | bool |

### Tier switch flow

In Account Tab → Switch Tier:

```ts
supabase.from("user_profiles").update({
  subscription_tier: tier.id,
  ai_enabled: tier.ai_enabled,
  enable_perenual: tier.enable_perenual,
}).eq("uid", userId);
```

Then `onTierChange()` lifts flags into App state so the rest of the app re-renders.

### Gated surfaces (non-exhaustive)

| Feature | Gate |
|---------|------|
| Plant Doctor Identify / Diagnose / Pest / Multi-ID | `ai_enabled` |
| Plant Doctor Chat | `ai_enabled` |
| AI Assistant Card | `ai_enabled` |
| New Plan Form (AI blueprint) | `ai_enabled` |
| Regenerate plan | `ai_enabled` |
| Photo-to-task in AddTaskModal | `ai_enabled` |
| Optimise tab AI proposals | `ai_enabled` |
| AI Area Coach tab (Area Metrics modal) | `ai_enabled` |
| Plant Visualiser AI sprite gen | `ai_enabled` |
| Plant Camera AI analysis | `ai_enabled` |
| Area Scan Modal | `ai_enabled` |
| Microclimate Report AI summary (planned) | `ai_enabled` |
| Perenual tab in BulkSearch | `enable_perenual` |
| Perenual care details fetch | `enable_perenual` |
| Garden Layout 3D view | (Sage/Evergreen — soft gate) |

### Client + server enforcement

- Client gates the UI (hides / paywall messaging).
- Edge functions re-verify (`if (!profile.ai_enabled) return 403`).

### "Honour system" billing

Today, tier selection is self-service with no payment integration. Admin-managed in practice. Payment integration is a roadmap item.

---

## Role 2 — Expert Gardener's Guide

### Why tiers exist

To match the cost of running AI to the users who actually use it. AI calls cost real money; basic use cases don't need them.

### Implications

- Pick the right tier for your usage.
- Switch any time via Account Tab.
- Downgrading isn't destructive — your data persists; only feature access changes.

---

## Related reference files

- [Tier Selection](../01-onboarding/04-tier-selection.md)
- [Account Tab](../06-account/01-account-tab.md)
- [AI — Gemini](./13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/constants/tiers.ts`
- `src/App.tsx` — passes `aiEnabled` + `perenualEnabled` as props throughout
- Each edge function self-verifies via profile lookup
