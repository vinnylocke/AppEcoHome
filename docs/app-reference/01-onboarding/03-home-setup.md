# Home Setup

> The screen new users land on after first sign-in. Creates the user's first Home (the root of all garden data) or joins an existing one.

**Trigger:** Renders when there's an active session but `profile.home_id` is null. App.tsx wraps it as the only thing visible.
**Source file:** `src/components/HomeSetup.tsx`

---

## Quick Summary

Three-step wizard. Step 1 — Choose between Create New Home or Join Existing Home. Step 2 — for Create: Home name + postcode + country + timezone (auto-detected); for Join: paste a Home ID. Step 3 — Submit, calls `create_new_home` RPC or join workflow, fetches initial weather, returns to App which now has a `profile.home_id` and proceeds to the dashboard.

---

## Role 1 — Technical Reference

### Component graph

```
HomeSetup
├── Step indicator (Account · Home · Plan)
├── Step "selection"
│   ├── Create New Home tile → step = "create"
│   └── Join Existing Home tile → step = "join"
├── Step "create"
│   ├── Home Name input
│   ├── Postcode input
│   ├── Country select (from COUNTRIES constant)
│   ├── Timezone select (Intl.supportedValuesOf("timeZone"))
│   ├── Inferred Hemisphere chip (from country + timezone)
│   ├── Cancel (if hasExistingHome)
│   └── Submit
└── Step "join"
    ├── Home ID input
    ├── Cancel
    └── Submit
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `user` | `{ id, email? }` | App.tsx session.user | Caller identity |
| `onHomeCreated` | `(homeId: string) => void` | App.tsx | Lifts the new home id into session state |
| `onCancel` | `() => void \| undefined` | App.tsx | Only present when the user already has another home (multi-home flow) |
| `hasExistingHome` | `boolean` | App.tsx | Drives whether the X cancel button is shown |

### Local state

| State | Purpose |
|-------|---------|
| `step` | "selection" / "create" / "join" |
| `loading` | Submit in flight |
| `formError` | Top-of-form error |
| `homeName`, `postcode`, `country`, `timezone` | Create-flow fields |
| `homeId` | Join-flow field |

### Data flow — write paths

#### Create Home (RPC)

```ts
supabase.rpc("create_new_home", {
  home_name: homeName,
  postcode:  postcode.toUpperCase(),
  country,
  timezone,
});
```

The RPC server-side:
1. Inserts a `homes` row.
2. Geocodes the postcode (server-side via Nominatim or similar — depends on cron config) → sets `lat`, `lng`.
3. Computes `hardiness_zone` from lat/lng if available.
4. Inserts a `home_members` row with role `"owner"` and full permission set.
5. Updates the caller's `user_profiles.home_id`.

Then client-side calls:

```ts
supabase.functions.invoke("sync-weather", { body: { home_id: newHomeId } });
```

To get an initial `weather_snapshots` row so the dashboard has data when the user lands.

#### Join Home

```ts
supabase.from("home_members").insert({ home_id: pastedHomeId, user_id: user.id, role: "member" });
```

Subject to RLS — only allowed if the home permits open joins (currently any user can join any home_id given the ID — this is a soft security model in beta). When QR invite ships (deferred), tokens replace pasted IDs.

### Edge functions invoked

| Function | When | Input | Output |
|----------|------|-------|--------|
| `sync-weather` | After successful home creation | `{ home_id }` | First weather_snapshots row |

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `sync-weather` | Continues hourly after the initial trigger |

### Realtime channels

None during setup — the user isn't subscribed to anything yet.

### Tier gating

None — every user goes through Home Setup, regardless of tier.

### Beta gating

None.

### Permissions / role-based UI

- Cancel button (X) only shows when `hasExistingHome` — i.e. the user is creating a *second* home from Home Management.

### Error states

| State | Result |
|-------|--------|
| RPC fails | "We couldn't create your home right now. Please try again." |
| sync-weather fails | Logged but doesn't block — user still proceeds |
| Postcode invalid | Geocoding may fail silently; weather will be empty until manually fixed |
| Join with bad home_id | RLS error surfaced as generic banner |

### Performance notes

- Country list from `src/constants/countries.ts` (compile-time constant).
- Timezone list from `Intl.supportedValuesOf("timeZone")` (browser-built-in, no fetch).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this screen

This is the moment your account becomes a garden. The Home is the root container — everything else (locations, plants, tasks, plans) lives inside it. Postcode is the most important field — it drives the weather data, the hardiness zone, and the hemisphere-aware seasonal calculations across the rest of the app.

### Every flow on this screen

#### 1. Create New Home (default)

- Tap "Create New Home" tile.
- Fill in:
  - **Home Name** — anything descriptive ("Cottage Garden", "47 Acacia Road", "Mum's House"). Just a label.
  - **Postcode** — UK postcode by default; the field is freeform so any country format works.
  - **Country** — drives the hemisphere inference and the postcode format hint.
  - **Timezone** — auto-detected from your browser. Override if you're setting up someone else's garden remotely.
- The Hemisphere chip below shows the inferred Northern / Southern based on country + timezone.
- Submit. You're now on the dashboard.

#### 2. Join Existing Home

- Used by household members. Tap "Join Existing Home" → paste the Home ID shared by the original owner.
- The owner can find their Home ID in Home Management → Multiple Homes.

#### 3. Cancel (subsequent runs)

- Only visible if you already have at least one home — i.e. you're adding a *second* home. The X dismisses this screen.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Step indicator | Account → Home → Plan (overall onboarding progress) |
| Home Name | Free text label |
| Postcode | Used for weather + hardiness zone |
| Country | Drives format + hemisphere |
| Timezone | All scheduling uses local time of the home, not the user's device |
| Hemisphere chip | Northern / Southern — affects seasonal labels across the app |

### Tier-by-tier experience

Same for every tier. Tier selection comes AFTER home setup.

### New user vs returning user

- **Brand new user**: sees this once. Submits it. Never sees it again unless they create a second home.
- **Returning user**: only sees it from Home Management → "Add new home" flow.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Skipping the postcode.** No postcode = no weather data = no frost alerts = no microclimate context. Make sure it's filled.
- **Wrong country.** Affects hemisphere; affects which months count as "spring" everywhere in the app. Double-check.
- **Pasting full address into postcode.** Just the postcode. The geocoding lookup needs the raw postcode string.
- **Timezone defaulting wrongly.** If you're using a VPN that puts your browser in a different timezone, override manually.

### Recommended workflows

- **Fresh sign up:** create your first home immediately, before anything else.
- **Setting up a family member's garden:** join their existing home with their Home ID rather than creating a new one — keeps everyone on the same data.

### What to do if something looks wrong

- **Weather doesn't load on dashboard after setup:** postcode geocoding failed. Open Home Management → re-enter postcode.
- **Hemisphere chip shows wrong:** select a different country to override.
- **"We couldn't create your home" error:** check network. Try again. If persistent, capture the error ID from any subsequent crash and report it.

---

## Related reference files

- [Auth Screen](./01-auth-screen.md)
- [Welcome Modal](./02-welcome-modal.md)
- [Tier Selection](./04-tier-selection.md)
- [Home Management Overview](../07-management/01-home-management-overview.md)
- [Weather (cross-cutting)](../99-cross-cutting/27-weather.md)
- [Hemisphere & Seasonality (cross-cutting)](../99-cross-cutting/29-seasonality.md)

## Code references for ongoing maintenance

- `src/components/HomeSetup.tsx` — entire component
- `src/constants/countries.ts` — country list
- `src/lib/seasonal.ts` — hemisphere inference + season calculations
- `supabase/migrations/*homes*` — homes schema
- DB function: `create_new_home(home_name, postcode, country, timezone)` — defined in migrations
