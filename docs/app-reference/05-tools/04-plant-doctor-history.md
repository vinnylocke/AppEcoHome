# Plant Doctor History

> Past Plant Doctor sessions — every Identify / Diagnose / Pest scan you've ever run, with the photo, results, confirmation status, and a search/filter UI.

**Trigger:** "History" tab inside Plant Doctor screen.
**Source files:**
- `src/components/PlantDoctorHistory.tsx`
- `src/hooks/usePlantDoctorSessions.ts` — fetch + confirm

---

## Quick Summary

A list of `plant_doctor_sessions` rows for the current user, newest first. Each card shows the thumbnail, action type, top candidate (with confidence if available), date, and a confirmation badge. Expand to see all candidates + chips. Search box filters by candidate name. Confirming a candidate writes back to the row to feed AI training.

---

## Role 1 — Technical Reference

### Component graph

```
PlantDoctorHistory
├── Search bar
├── Loading state
├── Empty state ("No past sessions yet")
└── SessionCard list (newest first)
    └── Card
        ├── Thumbnail (or ImageOff icon if missing)
        ├── Header row (action type icon, date)
        ├── Top candidate (name, scientific, confidence pill)
        ├── Confirmed badge (if confirmed)
        ├── Expand chevron
        └── Expanded body
            ├── All candidates as chips
            ├── Per-candidate Confirm button
            └── Open Image (lightbox)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `sessions` | `PlantDoctorSession[]` | `usePlantDoctorSessions` hook | List |
| `isLoading` | `boolean` | hook | Spinner state |
| `onLoad` | `() => void` | hook | Re-fetch trigger |

### `PlantDoctorSession` shape

```ts
{
  id, action: "identify" | "diagnose" | "pest",
  imageUrl, created_at,
  results: {
    possible_names?: SessionCandidate[],
    possible_diseases?: SessionCandidate[],
    possible_pests?: SessionCandidate[],
    plant_name?, scientific_name?,
  },
  confirmed_value?: string | null,
}

type SessionCandidate = string | { name: string; scientific_name?: string; confidence?: number };
```

The string union exists because older sessions stored bare strings; the hook normalises both shapes.

### Data flow — read paths (via `usePlantDoctorSessions`)

```ts
supabase.from("plant_doctor_sessions")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .limit(50);
```

Plus per-session signed URL generation for `imageUrl` if the bucket is private.

### Data flow — write paths

#### Confirm a candidate
```ts
supabase.from("plant_doctor_sessions")
  .update({ confirmed_value: name })
  .eq("id", sessionId);
```
The hook exposes this as `confirmSession(id, value)`.

### Edge functions invoked

None — pure DB CRUD.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `cleanup-doctor-images` (planned) | Removes session images older than N days |

### Realtime channels

None.

### Tier gating

- Visible to every tier — historical sessions persist regardless of current tier. If a user downgrades, they can still see history but can't run new sessions.

### Beta gating

None.

### Permissions

- Session rows are user-scoped (not home-scoped) — only the creator sees them.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Empty state with retry implicit on re-open |
| Image URL expired | `ImageOff` icon |
| Confirm fails | Toast |

### Performance

- Fetches latest 50 sessions; older paginated on demand.
- Each card is a `<details>`-style toggle; expanded body lazy-renders.

### Linked storage buckets

- `plant-doctor-images` — `imageUrl` source

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

Every AI scan you've ever done is here. Useful for:
- Looking up "what was that plant I identified last month?"
- Tracking how a sick plant has been diagnosed over multiple visits.
- Confirming the AI's top guess against the actual outcome ("yes, this was rust" / "no, it was downy mildew").

### Every flow on this tab

#### 1. Browse sessions

- Newest first.
- Tap a card to expand → see all candidates + thumbnails.

#### 2. Search

- Free-text box filters by candidate name.
- Useful for "did I ever identify a hellebore?" → type "hellebore".

#### 3. Confirm a candidate

- Inside the expanded card, tap "Confirm this is correct" on the candidate that matched reality.
- Feeds AI training; helps you (the next time you scan a similar plant, results improve).

#### 4. Open the photo

- Tap the thumbnail to see the full image in a lightbox.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Action icon | Identify / Diagnose / Pest |
| Date | When the scan ran |
| Top candidate | AI's most-likely answer |
| Confidence pill | Score 0-100% if returned by the AI |
| Confirmed badge | You've confirmed the correct answer |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Read access to history. |
| Sage / Evergreen | Confirm feedback is more impactful — AI uses it to improve your future scans. |

### Common mistakes / pitfalls

- **Confirming the wrong candidate.** Don't confirm if unsure — leave it blank rather than mis-train.
- **Expecting confirmations to undo.** Confirm is one-way today (no edit). Pick carefully.
- **Searching by symptom.** Search matches candidate names; symptoms are inside the diagnosis text and aren't indexed.

### Recommended workflows

- **Post-scan:** every successful scan → confirm the right candidate. Costs you 2 seconds, saves the AI from repeating the same wrong guesses.
- **Re-identify:** find the past session, expand, see the photo, compare to today's plant — useful for "is this the same one or a different one?"

### What to do if something looks wrong

- **Missing session:** check the user is the same — sessions are user-scoped. If you logged in from a different account, you won't see them.
- **Image broken:** signed URL may have expired. Re-open the tab to regenerate.

---

## Related reference files

- [Plant Doctor](./02-plant-doctor.md)
- [Plant Doctor Chat](./03-plant-doctor-chat.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/PlantDoctorHistory.tsx`
- `src/hooks/usePlantDoctorSessions.ts`
- `supabase/migrations/*_plant_doctor_sessions.sql` — schema
- `plant-doctor-images` storage bucket policies
