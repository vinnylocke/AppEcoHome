# Data Export Section

> GDPR-compliant data export. One button calls the `export-user-data` edge function, which returns a JSON file of everything the user owns — homes, plants, plans, journals, tasks, ailments. Downloaded directly to the device.

**Trigger:** Rendered inside Account Tab (Account Settings).
**Source files:**
- `src/components/GardenerProfile.tsx` — `DataExportSection()` function (~lines 243–305)
- `supabase/functions/export-user-data/index.ts` — edge fn

---

## Quick Summary

User taps "Download my data" → fetch POST to `export-user-data` with bearer token → server collects every row keyed to the user → returns a streamed JSON file → client triggers a browser download with filename `rhozly-export-YYYY-MM-DD.json`. Rate-limited to 3 exports per hour. Photos are referenced by URL, not bundled.

---

## Role 1 — Technical Reference

### Component graph

```
DataExportSection
├── Header (Save icon, "Your Data")
├── Description copy
├── Download button
│   ├── Loading state ("Preparing…" + spinner)
│   └── Idle state ("Download my data")
└── Rate-limit footnote
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `userId` | `string` | parent | Authentication only (token already includes it) |

### Local state

| State | Purpose |
|-------|---------|
| `exporting` | Request in flight |

### Data flow — read paths

```ts
const { data: { session } } = await supabase.auth.getSession();
const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/export-user-data`, {
  method: "POST",
  headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  body: "{}",
});
const blob = await res.blob();
// Trigger browser download
```

### Edge function: `export-user-data`

| Tables included (typical) |
|---------------------------|
| `user_profiles` |
| `homes` (you own) + `home_members` |
| `locations`, `areas`, `area_lux_readings` |
| `garden_layouts`, `garden_shapes` |
| `plants`, `inventory_items` |
| `plant_journal`, `yield_logs` |
| `plans`, `task_blueprints`, `tasks` |
| `plant_instance_ailments`, `ailments` |
| `community_guides` (authored), `community_guide_comments` (authored) |
| `chat_messages`, `plant_doctor_sessions` |
| `planner_preferences`, `home_quiz_completions`, `user_behaviour_summary` |
| `beta_feedback`, `user_achievements` |

Photos are referenced by URL — the JSON does not include the binary files (storage buckets are direct downloads).

### Rate limit

- 3 exports per hour, enforced server-side.

### Data flow — write paths

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — GDPR requires this for every user.

### Beta gating

None.

### Permissions

- Bearer token verifies user identity.
- RLS scopes the queries.

### Error states

| State | Result |
|-------|--------|
| Not signed in | Toast: "Not signed in." |
| Rate limited (429) | Toast with the server's message |
| Server error (5xx) | Toast: "Export failed" |
| Download blocked | Browser-dependent; some block downloads from non-user-gesture |

### Performance

- Single edge function call; JSON streamed.
- Large exports (10k+ plants) take several seconds — UI shows "Preparing…" loader.
- Browser download — no upload.

### Linked storage buckets

- Photo URLs reference Rhozly storage buckets directly (the export doesn't re-host).

---

## Role 2 — Expert Gardener's Guide

### Why use this section

Your right under GDPR — get a copy of everything Rhozly has on you. Useful for:
- Personal backup.
- Migrating to another tool (the JSON is machine-readable).
- Verifying what's stored before deleting your account.

### Every flow on this section

#### 1. Download

- Tap "Download my data" → loading spinner → file downloads.
- Filename includes today's date: `rhozly-export-2026-05-20.json`.

#### 2. (Implicit) Photos

- The JSON contains URLs to your photos.
- To save the photos themselves, open each URL in a browser and Save As — or use a download manager.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Description | Explains what gets included |
| Footnote | Rate limit + photo caveat |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Expecting photos in the ZIP.** The export is JSON only with photo URLs. Photos remain in their bucket.
- **Hitting the rate limit.** 3 per hour. Wait an hour and retry.
- **Trying to import the JSON elsewhere.** No tooling exists today; it's a backup format, not an interchange format.

### Recommended workflows

- **Before deleting your account:** export first, verify the file opens, then delete.
- **Periodic backup:** monthly export gives you a rolling snapshot.

### What to do if something looks wrong

- **Download fails:** check if the toast says "rate limited" — wait an hour.
- **File too small:** open it in a text editor; verify the tables you expect are there. If missing, file a bug.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Delete Account Modal](./08-delete-account.md)
- [Data Model — Homes (cross-cutting)](../99-cross-cutting/01-data-model-home.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — `DataExportSection`
- `supabase/functions/export-user-data/index.ts` — edge fn implementation
