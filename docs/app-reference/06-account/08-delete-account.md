# Delete Account Modal

> The destructive end-of-life flow. Wipes everything the user owns — homes, plants, plans, journals, sessions, achievements — then signs them out. Requires typing "DELETE" to confirm.

**Trigger:** "Delete Account" button at the bottom of Account Tab (Account Settings).
**Source files:**
- `src/components/GardenerProfile.tsx` — modal block (~lines 767+) + `deleteAccount()` function (~lines 500–528)
- `supabase/functions/delete-account/index.ts` — server-side purge

---

## Quick Summary

A confirmation modal with stark warning copy and a "type DELETE to confirm" gate. On confirm, calls the `delete-account` edge function with the user's bearer token. Server deletes all user-scoped data + the auth user. Client signs out → user lands on the Auth screen with everything gone.

---

## Role 1 — Technical Reference

### Component graph

```
Delete Account flow
├── Account Tab → red "Delete Account" button
└── Modal (when showDeleteModal === true)
    ├── Header (AlertTriangle icon, "Delete Account")
    ├── Warning copy
    ├── Type-DELETE input
    ├── Cancel button
    └── Confirm button (enabled when input === "DELETE")
```

### Local state (inside AccountTab)

| State | Purpose |
|-------|---------|
| `showDeleteModal` | Modal visibility |
| `deleteConfirmText` | The confirmation string |
| `isDeleting` | Action in flight |

### `deleteAccount()` flow

```ts
const { data: { session } } = await supabase.auth.getSession();
const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/delete-account`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    apikey: VITE_SUPABASE_PUBLISHABLE_KEY,
  },
});
if (!res.ok) throw new Error(...);
await supabase.auth.signOut();
```

### Edge function: `delete-account`

Tables purged (typical):

- `chat_messages`
- `plant_doctor_sessions`
- `plant_journal`, `yield_logs`
- `inventory_items`, `plants` (created by user)
- `tasks`, `task_blueprints`
- `plans`
- `garden_layouts`, `garden_shapes`
- `locations`, `areas`
- `home_members`, `homes` (if sole owner)
- `community_guides`, `community_guide_comments`, `community_guide_stars` (authored)
- `beta_feedback`, `user_achievements`, `planner_preferences`, `home_quiz_completions`
- `user_profiles`
- Storage cleanup: `plant-photos`, `plan-photos`, `community-guide-images`, `plant-doctor-images`, `visualiser-captures`, `plant-sprites`

Finally:

```ts
await supabaseAdmin.auth.admin.deleteUser(userId);
```

If the user co-owns a home with other members, behaviour depends on `home_members.role`:
- Sole owner → home + all nested data deleted.
- Co-owner / editor / viewer → user removed from `home_members`; home + data persist for other members.

### Data flow — write paths

All deletes happen server-side. Client only fires the request.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `cleanup-orphan-storage` (planned) | Sweeps storage for orphans 30d after row deletion |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- Bearer token authenticates user.
- Edge fn uses service role internally to bypass RLS for the cascade.

### Error states

| State | Result |
|-------|--------|
| No active session | Toast "No active session" |
| Edge fn 5xx | Toast with server message |
| Partial failure | Toast; user may need to retry |

### Performance

- Single fetch + signOut.
- Server side cascade is heavy — large accounts may take 5-10 s.

### Linked storage buckets

All buckets — purged for files owned by the deleted user.

---

## Role 2 — Expert Gardener's Guide

### Why use this section

The unhappy path. You're leaving Rhozly and want everything gone. GDPR right-to-erasure.

### Every flow on this modal

#### 1. Open modal

- Account Tab → scroll to bottom → "Delete Account" (red).

#### 2. Read the warning

- "This permanently deletes your account, all plants, plans, photos, tasks, ailments, journals, and chat history. This cannot be undone."

#### 3. Type "DELETE"

- Confirm button enables only when the input exactly matches "DELETE" (case-sensitive).

#### 4. Confirm

- Loading spinner → server purge → automatic sign-out → land on Auth screen.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Warning copy | What's about to be wiped |
| DELETE input | The gate against accidental taps |
| Confirm button | The actual nuke |

### Tier-by-tier experience

Same for every tier — premium users get the same destruction.

### Common mistakes / pitfalls

- **Mistaking it for sign-out.** Sign-out is in the User Profile Dropdown. Delete is permanent.
- **Forgetting to export first.** If you want a copy of your data, use [Data Export](./07-data-export.md) before tapping delete.
- **Co-owned homes.** If you co-own a home with someone, deleting your account removes you from `home_members` but the home survives for them. Confirm with co-owners before deleting.

### Recommended workflows

- **Pre-delete:** export data, screenshot anything you want, then delete.
- **If unsure:** sign out instead — you can come back any time.

### What to do if something looks wrong

- **Confirm button stays disabled:** check capitalisation — must be exactly `DELETE`.
- **Modal closes but you're still signed in:** edge fn errored. Re-open modal and retry.
- **"User still exists" error after delete:** edge fn cascade may have partial-failed. Contact support.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Data Export Section](./07-data-export.md)
- [Auth Screen](../01-onboarding/01-auth-screen.md)
- [Confirm Modal](../08-modals-and-overlays/17-confirm-modal.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — modal + `deleteAccount()` function
- `supabase/functions/delete-account/index.ts` — server cascade
