# Onboarding State — `user_profiles.onboarding_state` jsonb

> A jsonb column on `user_profiles` that tracks which onboarding surfaces the user has seen / dismissed / completed. Lets Rhozly avoid re-showing the welcome modal, getting-started checklist, notification opt-in, etc. once they're done.

---

## Quick Summary

```ts
user_profiles.onboarding_state: {
  welcome_modal: "completed" | "dismissed",
  getting_started: {
    quiz_done: boolean,
    location_added: boolean,
    plant_added: boolean,
    plant_assigned: boolean,
    schedule_added: boolean,
  },
  notification_opt_in: "granted" | "denied" | "dismissed",
  pwa_install: "installed" | "dismissed",
  // ... per-surface state
}
```

---

## Role 1 — Technical Reference

### Migration

`supabase/migrations/20260516000000_add_onboarding_state.sql` adds the column with `default '{}'::jsonb`.

### Read pattern

```ts
const state = profile.onboarding_state ?? {};
if (!state.welcome_modal) {
  // show welcome
}
```

### Write pattern

```ts
supabase.from("user_profiles")
  .update({ onboarding_state: { ...prev, welcome_modal: "completed" } })
  .eq("uid", userId);
```

### Surfaces

| Surface | Key |
|---------|-----|
| [Welcome Modal](../01-onboarding/02-welcome-modal.md) | `welcome_modal` |
| [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) | `getting_started.*` |
| [Notification Opt-In](../01-onboarding/07-notification-opt-in.md) | `notification_opt_in` |
| [PWA Install](../01-onboarding/08-pwa-install.md) | `pwa_install` (paired with localStorage) |

### Why jsonb

Avoids a wide column proliferation. Each onboarding surface gets a sub-key without a schema migration.

### Trade-off

No easy SQL filtering by state (would need `WHERE onboarding_state ->> 'welcome_modal' IS NULL`). Acceptable since reads are per-user.

### Reset

Users can re-trigger onboarding via Account Settings (planned). Today, manual SQL.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

You don't see the welcome modal twice. The getting-started checklist disappears once you've completed each step. The notification opt-in only asks once. All driven by this column.

### Implications

- If you reinstall Rhozly natively, the column persists across devices (DB-backed, not localStorage).
- Some surfaces use both jsonb + localStorage (PWA) for belt-and-braces.

---

## Related reference files

- [Welcome Modal](../01-onboarding/02-welcome-modal.md)
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md)
- [Notification Opt-In](../01-onboarding/07-notification-opt-in.md)
- [PWA Install Prompt](../01-onboarding/08-pwa-install.md)

## Code references for ongoing maintenance

- `supabase/migrations/20260516000000_add_onboarding_state.sql`
- `src/App.tsx` — onboarding state reads + writes
