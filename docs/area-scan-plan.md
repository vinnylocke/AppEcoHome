# Area Scan Feature — Full Build Plan

## Overview

Allow users to photograph or upload an image of a garden area and receive an AI-powered deep analysis: plant identification with confidence scores, health flags, pruning advice, companion suggestions, capacity assessment, maintenance scheduling, and soil/conditions notes. Identified pests and diseases are linked to the area's AilmentWatchlist. The scan can generate tasks (one-off and recurring) with Accept/Edit/Dismiss UI. Every scan is persisted against the area and visible in a scan history panel. Weather-aware advice is injected from the existing weather snapshot.

**AI model**: Gemini cascade via the existing `callGeminiCascade` from `supabase/functions/_shared/gemini.ts` — no new model setup required.

---

## Execution Order

1. Phase 1 — Schema & Storage
2. Phase 2 — Edge Function (Core AI)
3. Phase 3 — Frontend Scan Flow (capture → results)
4. Phase 4 — Plant Linking & Bulk Import
5. Phase 5 — Task Suggestions
6. Phase 6 — Pest/Disease Linking & AilmentWatchlist
7. Phase 7 — History, Badges & Polish
8. Phase 8 — AI Pattern Engine Integration

Each phase is independently deployable. Complete Phase 1–3 first to get a working end-to-end loop.

---

## Phase 1 — Schema & Storage

### Goal
Establish the database tables and Storage bucket that all later phases write into.

### 1.1 — Supabase Migration

Create `supabase/migrations/<timestamp>_area_scans.sql`:

```sql
-- Area scan records persisted against an area
create table area_scans (
  id           uuid primary key default gen_random_uuid(),
  home_id      uuid not null references homes(id) on delete cascade,
  area_id      uuid not null references areas(id) on delete cascade,
  image_url    text,                    -- Supabase Storage public URL
  image_path   text,                    -- Storage path for deletion
  analysis     jsonb not null,          -- Full structured AI response (see schema below)
  questions    jsonb,                   -- Pre-scan answers supplied by user
  weather_snap jsonb,                   -- Snapshot of latest weather at scan time
  created_at   timestamptz default now()
);

create index on area_scans (area_id, created_at desc);
create index on area_scans (home_id, created_at desc);

-- Link pests/diseases surfaced in a scan to this area
-- Connects area_scans → ailments (AilmentWatchlist table)
create table area_scan_ailments (
  id           uuid primary key default gen_random_uuid(),
  area_scan_id uuid not null references area_scans(id) on delete cascade,
  ailment_id   uuid not null references ailments(id) on delete cascade,
  notes        text,                    -- AI note about this ailment in this scan
  severity     text check (severity in ('mild','moderate','severe')),
  created_at   timestamptz default now(),
  unique (area_scan_id, ailment_id)
);

-- RLS
alter table area_scans enable row level security;
alter table area_scan_ailments enable row level security;

create policy "home members" on area_scans
  using (home_id in (select home_id from home_members where user_id = auth.uid()));
create policy "home members" on area_scan_ailments
  using (area_scan_id in (select id from area_scans where home_id in (
    select home_id from home_members where user_id = auth.uid()
  )));
```

### 1.2 — Supabase Storage Bucket

In the Supabase dashboard (or via migration), create bucket `area-scans`:
- Public: true (images are displayed in-app)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 10 MB

### 1.3 — Analysis JSON Shape

This is the canonical shape stored in `area_scans.analysis`. The edge function must return this shape.

```json
{
  "summary": "string — 2-3 sentence overview of the area",
  "capacity": {
    "current_count": 4,
    "estimated_max": 6,
    "label": "Well stocked" | "Room to grow" | "Near capacity" | "Overcrowded"
  },
  "plants": [
    {
      "identified_name": "Lavender",
      "scientific_name": "Lavandula angustifolia",
      "confidence": 0.87,
      "health_status": "good" | "warning" | "issue",
      "health_notes": "string",
      "pruning_advice": "string or null",
      "position_suitability": "good" | "marginal" | "poor",
      "position_notes": "string"
    }
  ],
  "companions": [
    {
      "name": "string",
      "reason": "string"
    }
  ],
  "maintenance": [
    {
      "title": "string",
      "description": "string",
      "urgency": "now" | "this_week" | "this_month" | "seasonal",
      "recurring": false,
      "frequency_days": null
    }
  ],
  "pests_diseases": [
    {
      "name": "string",
      "type": "pest" | "disease",
      "severity": "mild" | "moderate" | "severe",
      "affected_plants": ["string"],
      "notes": "string",
      "action_needed": "string"
    }
  ],
  "soil_conditions": {
    "observed_medium": "string or null",
    "drainage_notes": "string or null",
    "recommendations": "string or null"
  },
  "weather_advice": "string or null"
}
```

---

## Phase 2 — Edge Function: `scan-area`

### Goal
New Supabase Edge Function that accepts an image + context, calls the Gemini cascade, and returns the structured analysis JSON.

### 2.1 — File

`supabase/functions/scan-area/index.ts`

### 2.2 — Request Shape

```typescript
interface ScanAreaRequest {
  homeId: string;
  areaId: string;
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  // User answers to pre-scan questions (Phase 3 adds these)
  questions?: Record<string, string>;
  // Weather snapshot injected by frontend (from existing weather state)
  weatherSnap?: {
    temp_c?: number;
    condition?: string;
    humidity?: number;
    wind_kph?: number;
  };
}
```

### 2.3 — Implementation Pattern

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";

const FN = "scan-area";

// — Response schema enforced by Gemini JSON mode
const RESPONSE_SCHEMA = { /* matches the canonical JSON shape from Phase 1 */ };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { homeId, areaId, imageBase64, mimeType, questions, weatherSnap } = await req.json();

  // 1. Fetch area + location context from DB for richer prompt
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: area } = await supabase
    .from("areas")
    .select("name, growing_medium, medium_ph, light_intensity_lux, locations(name, is_outside)")
    .eq("id", areaId)
    .single();

  // 2. Fetch existing plants in this area for context
  const { data: existingPlants } = await supabase
    .from("inventory_items")
    .select("plant_name, identifier")
    .eq("area_id", areaId)
    .neq("status", "Archived");

  // 3. Build prompt
  const weatherContext = weatherSnap
    ? `Current weather: ${weatherSnap.condition}, ${weatherSnap.temp_c}°C, humidity ${weatherSnap.humidity}%, wind ${weatherSnap.wind_kph} km/h.`
    : "";

  const existingPlantsContext = existingPlants?.length
    ? `Known plants already logged in this area: ${existingPlants.map(p => p.plant_name).join(", ")}.`
    : "No plants currently logged in this area.";

  const questionContext = questions
    ? Object.entries(questions).map(([q, a]) => `${q}: ${a}`).join("\n")
    : "";

  const userText = `Analyse this garden area image thoroughly.

Area: ${area?.name} (${area?.locations?.is_outside ? "outdoor" : "indoor"})
Location: ${area?.locations?.name}
Growing medium: ${area?.growing_medium || "unknown"}
pH: ${area?.medium_ph || "unknown"}, Light intensity: ${area?.light_intensity_lux || "unknown"} lux
${existingPlantsContext}
${weatherContext}
${questionContext}

Provide: plant identification with confidence scores, health assessment, pruning advice, space/capacity evaluation, companion suggestions, maintenance schedule, pest/disease detection, and soil/conditions notes.
Include weather-aware advice where weather data is available.`;

  const messages = toMessages([
    { inlineData: { data: imageBase64, mimeType: mimeType ?? "image/jpeg" } },
    { text: userText },
  ]);

  // 4. Call the cascade — reuses all retry/fallback logic from _shared/gemini.ts
  const raw = await callGeminiCascade(
    Deno.env.get("GEMINI_API_KEY")!,
    FN,
    messages,
    {
      systemPrompt: "You are an expert horticulturalist and garden diagnostician. Analyse garden area images and return structured JSON assessments covering plant health, identification, pests, maintenance, and space management. Always return valid JSON matching the provided schema.",
      temperature: 0.3,
      maxOutputTokens: 3000,
      responseSchema: RESPONSE_SCHEMA,
      models: ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"],
      logContext: { homeId, areaId },
    },
  );

  const analysis = JSON.parse(raw);
  return new Response(JSON.stringify(analysis), { headers: corsHeaders });
});
```

### 2.4 — Deploy

```bash
supabase functions deploy scan-area
```

The function requires `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` — all already set in the project's function secrets.

---

## Phase 3 — Frontend Scan Flow

### Goal
Add a "Scan Area" button to `AreaDetails.tsx` that opens a full scan flow: image capture/upload → optional pre-scan questions → loading state → structured results display.

### 3.1 — New Component: `AreaScanModal.tsx`

**Location**: `src/components/AreaScanModal.tsx`

**Responsibilities**:
- Image capture (mobile camera via `<input type="file" accept="image/*" capture="environment">`)
- Image upload from file picker
- Image preview + crop/rotate if needed
- Pre-scan question panel (extensible registry — see 3.2)
- Loading/progress state with step messages ("Uploading...", "Analysing plants...", "Building recommendations...")
- Results display (see 3.3)
- Save scan to `area_scans` table
- Pass result up to parent for badge update

**Props**:
```typescript
interface AreaScanModalProps {
  homeId: string;
  area: any;           // area row with location joined
  weatherSnap?: any;   // from existing weather context
  onClose: () => void;
  onScanSaved: (scan: any) => void;
}
```

**Scan flow states** (internal):
```
idle → capturing → previewing → questioning → uploading → analysing → results → saved
```

### 3.2 — Pre-Scan Question Registry

**Location**: `src/lib/scanQuestions.ts`

Pattern mirrors `_shared/weatherRules` — an array of question modules, each a plain object:

```typescript
export interface ScanQuestion {
  id: string;
  question: string;
  type: "yesno" | "select" | "text";
  options?: string[];     // for "select" type
  alwaysAsk: boolean;    // false = only ask if relevant (e.g., only ask pest question if area has known pest history)
}

export const SCAN_QUESTIONS: ScanQuestion[] = [
  {
    id: "recent_watering",
    question: "When did you last water this area?",
    type: "select",
    options: ["Today", "Yesterday", "2–3 days ago", "A week ago", "Unsure"],
    alwaysAsk: true,
  },
  {
    id: "recent_fertilising",
    question: "Have you fertilised recently?",
    type: "yesno",
    alwaysAsk: false,
  },
  {
    id: "known_pest_issues",
    question: "Are you aware of any pest or disease issues in this area?",
    type: "text",
    alwaysAsk: false,
  },
  {
    id: "main_concern",
    question: "What's your main concern with this area right now?",
    type: "select",
    options: ["General check-up", "Plant health", "Pests or disease", "Space planning", "Just curious"],
    alwaysAsk: true,
  },
];
```

Adding a new question = add one entry to the array. No other changes needed.

### 3.3 — Results Display

The results panel in `AreaScanModal` renders sections driven by the analysis JSON:

| Section | Source field | Display |
|---------|-------------|---------|
| Summary | `analysis.summary` | Prose paragraph at top |
| Capacity | `analysis.capacity` | Badge + count chip |
| Plants | `analysis.plants[]` | Card per plant — name, confidence bar, health status pill, notes, pruning advice |
| Companions | `analysis.companions[]` | Suggestion chips with reason tooltip |
| Maintenance | `analysis.maintenance[]` | Task-preview cards with urgency label (Phase 5 adds Accept/Dismiss) |
| Pests & Diseases | `analysis.pests_diseases[]` | Alert cards with severity badge (Phase 6 adds link-to-watchlist) |
| Soil | `analysis.soil_conditions` | Condensed info row |
| Weather advice | `analysis.weather_advice` | Callout if present |

### 3.4 — Image Upload to Storage

Before calling the edge function, upload the image to Supabase Storage:

```typescript
const filePath = `${homeId}/${areaId}/${Date.now()}.jpg`;
const { data: uploaded } = await supabase.storage
  .from("area-scans")
  .upload(filePath, blob, { contentType: mimeType, upsert: false });
const imageUrl = supabase.storage.from("area-scans").getPublicUrl(filePath).data.publicUrl;
```

Then pass `imageBase64` (not the URL) to the edge function. The URL is stored in `area_scans.image_url` after saving.

### 3.5 — Save Scan

After receiving analysis from the edge function, insert into `area_scans`:

```typescript
const { data: scan } = await supabase.from("area_scans").insert({
  home_id: homeId,
  area_id: area.id,
  image_url: imageUrl,
  image_path: filePath,
  analysis,
  questions,
  weather_snap: weatherSnap,
}).select().single();
```

### 3.6 — Entry Point in AreaDetails

Add a "Scan Area" button to `AreaDetails.tsx` in the header row alongside the existing actions:

```tsx
<button onClick={() => setShowScanModal(true)}
  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rhozly-primary/10 text-rhozly-primary hover:bg-rhozly-primary/20 font-bold text-sm transition-colors">
  <Camera className="w-4 h-4" />
  Scan Area
</button>
```

Pass `area`, `homeId`, and current `weatherSnap` (sourced from context or prop) to `AreaScanModal`.

---

## Phase 4 — Plant Linking & Bulk Import

### Goal
After a scan, give the user the ability to match each identified plant to an existing inventory item (or bulk import new ones from the shed/BulkSearchModal).

### 4.1 — Plant Matching UI

In the results plants section, each plant card shows a "Link to plant" dropdown:

- Fetches `inventory_items` for the area (and the wider home as fallback)
- Renders a searchable select — `identified_name` pre-fills the search
- If a match is found by name similarity, auto-suggest it with a confidence indicator
- User can confirm, pick a different one, or skip

Matching logic (frontend only, no AI needed):

```typescript
const suggestMatch = (identifiedName: string, inventoryItems: any[]) => {
  const lower = identifiedName.toLowerCase();
  return inventoryItems.find(item =>
    item.plant_name?.toLowerCase().includes(lower) ||
    lower.includes(item.plant_name?.toLowerCase())
  ) ?? null;
};
```

### 4.2 — Bulk Import for Unlinked Plants

For plants that have no match in the inventory, show an "Add to Shed" button that:
1. Sets `bulkSearchQuery` to the identified plant name
2. Opens `BulkSearchModal` (already exists in TheShed — reuse via navigation or inline)

For the inline path, pass the identified name as the initial search query:

```typescript
// In AreaDetails or AreaScanModal, after user clicks "Add to Shed":
navigate("/shed", {
  state: {
    returnTo: location.pathname + location.search,
    bulkSearchQuery: plant.identified_name,
  },
});
```

`TheShed` reads `location.state.bulkSearchQuery` on mount and opens `BulkSearchModal` with that pre-filled.

### 4.3 — Persisting Links

After user links a plant, store the association in `area_scans.analysis` (update the specific plant entry with `linked_inventory_item_id`) or in a separate `area_scan_plant_links` table if formal querying is needed later. Start with updating the JSONB.

### 4.4 — Confidence Indicators

The plant cards display a visual confidence bar:

```tsx
const pct = Math.round(plant.confidence * 100);
// e.g. 87% — "High confidence"
const label = pct >= 80 ? "High" : pct >= 55 ? "Moderate" : "Low";
```

Show confidence level in muted text below the plant name. Low confidence (<55%) adds a warning note: "AI is uncertain — verify before acting."

---

## Phase 5 — Task Suggestions

### Goal
The `analysis.maintenance[]` array drives task suggestion cards. User can Accept (creates the task/blueprint), Edit (pre-fills the task creation form), or Dismiss each suggestion.

### 5.1 — Task Suggestion Cards

Each maintenance item in the results becomes a suggestion card:

```tsx
<div key={i} className="...">
  <div className="flex-1">
    <p className="font-bold">{suggestion.title}</p>
    <p className="text-sm text-muted">{suggestion.description}</p>
    <span className={`badge urgency-${suggestion.urgency}`}>{suggestion.urgency}</span>
    {suggestion.recurring && (
      <span className="badge">Repeats every {suggestion.frequency_days}d</span>
    )}
  </div>
  <div className="flex gap-2">
    <button onClick={() => handleAccept(suggestion)}>Accept</button>
    <button onClick={() => handleEdit(suggestion)}>Edit</button>
    <button onClick={() => handleDismiss(i)}>Dismiss</button>
  </div>
</div>
```

### 5.2 — Accept Flow

**One-off task** (`suggestion.recurring === false`):

```typescript
await supabase.from("tasks").insert({
  home_id: homeId,
  area_id: area.id,
  location_id: area.location_id,
  title: suggestion.title,
  description: suggestion.description,
  due_date: derivedueDateFromUrgency(suggestion.urgency), // today, +3d, +7d, +30d
  status: "Pending",
  source: "scan",
});
```

**Recurring task** (`suggestion.recurring === true`):

```typescript
await supabase.from("task_blueprints").insert({
  home_id: homeId,
  area_id: area.id,
  location_id: area.location_id,
  title: suggestion.title,
  description: suggestion.description,
  start_date: today,
  frequency_days: suggestion.frequency_days,
  is_recurring: true,
  task_type: "General",
  source: "scan",
});
```

After insert, call `generate-tasks` edge function for the new blueprint (same pattern used elsewhere).

**`derivedueDateFromUrgency`**:

```typescript
const derivedueDateFromUrgency = (urgency: string): string => {
  const today = new Date();
  const offsets: Record<string, number> = {
    now: 0, this_week: 3, this_month: 7, seasonal: 30,
  };
  today.setDate(today.getDate() + (offsets[urgency] ?? 0));
  return today.toISOString().split("T")[0];
};
```

### 5.3 — Edit Flow

Opens the existing `TaskModal` (or `TaskCreateForm`) pre-filled with the suggestion data. User edits title/description/date, then saves.

### 5.4 — Persist Accepted/Dismissed State

After user actions, update `area_scans.analysis` JSONB to mark each suggestion's state:

```typescript
// accepted_suggestions: string[] of suggestion titles that were accepted
// dismissed_suggestions: string[] of suggestion titles that were dismissed
```

This prevents the same suggestion reappearing on re-open.

---

## Phase 6 — Pest/Disease Linking & AilmentWatchlist

### Goal
Pests and diseases surfaced in the scan can be linked to the area's AilmentWatchlist entries. If an ailment doesn't exist yet, the user can create it.

### 6.1 — Pest/Disease Result Cards

Each `analysis.pests_diseases[]` entry renders a card:

```tsx
<div className={`alert-card severity-${pest.severity}`}>
  <Bug/Biohazard icon />
  <div>
    <p className="font-bold">{pest.name}</p>
    <p className="text-sm">{pest.notes}</p>
    <p className="text-xs text-muted">Affects: {pest.affected_plants.join(", ")}</p>
  </div>
  <button onClick={() => handleLinkAilment(pest)}>Link to Watchlist</button>
</div>
```

### 6.2 — Link to Existing Ailment

When user clicks "Link to Watchlist":

1. Open a small popover/sheet with the home's ailments list (fetched from `ailments` table, filtered to `pest`/`disease` type matching `pest.type`)
2. Allow search by name
3. On select, insert into `area_scan_ailments`:

```typescript
await supabase.from("area_scan_ailments").insert({
  area_scan_id: scanId,
  ailment_id: selectedAilment.id,
  notes: pest.notes,
  severity: pest.severity,
});
```

### 6.3 — Create New Ailment from Scan

If no matching ailment exists, show "Create new ailment" option. Pre-fill `AilmentWatchlist`'s create form with:

- `name`: `pest.name`
- `type`: `pest.type` ("pest" | "disease")
- `description`: `pest.notes`
- `affected_plants`: `pest.affected_plants`
- `source`: "ai"

After creation, immediately link via `area_scan_ailments`.

### 6.4 — Area Ailment Badge

In `AreaDetails`, show active ailments linked to any scan for this area:

```typescript
// Fetch: area_scan_ailments → ailments for scans in this area
const { data: activeAilments } = await supabase
  .from("area_scan_ailments")
  .select("ailments(id, name, type, thumbnail_url)")
  .in("area_scan_id", areaScansForThisArea.map(s => s.id));
```

Display as compact alert chips below the area header. Clicking navigates to the AilmentWatchlist entry.

### 6.5 — Area Cards "Last Scanned" + Pest Warning

On `LocationPage.tsx` area cards, add two badges:

- **"Last scanned X days ago"** — drives the re-scan nudge (Phase 8)
- **Pest/disease warning dot** — red dot if any active high-severity ailment is linked to this area's scans

---

## Phase 7 — Scan History, Capacity Badge & Polish

### Goal
Persist and surface scan history in AreaDetails and show a capacity badge on area cards.

### 7.1 — Scan History Panel

In `AreaDetails.tsx`, add a "Scan History" tab or collapsible section:

```typescript
const { data: scans } = await supabase
  .from("area_scans")
  .select("id, image_url, analysis, created_at")
  .eq("area_id", area.id)
  .order("created_at", { ascending: false })
  .limit(10);
```

Each history entry shows:
- Thumbnail of the scan image
- Date of scan
- Capacity label from that scan (`analysis.capacity.label`)
- Health summary (count of good/warning/issue plants)
- Click to expand full results (re-renders the same results view with historical data)

### 7.2 — Capacity Badge on Area Cards

After at least one scan, `area_scans` stores `analysis.capacity`. Add capacity label to area tiles in `LocationPage`:

```typescript
// Derive from most recent scan — join in the areas query or fetch separately
const latestCapacityLabel = latestScan?.analysis?.capacity?.label;
```

Renders as a subtle pill below the plant count:
- "Room to grow" → green
- "Well stocked" → blue
- "Near capacity" → amber
- "Overcrowded" → red

### 7.3 — "Last Scanned" Timestamp

On area cards in `LocationPage`:

```tsx
{lastScannedAt && (
  <p className="text-xs text-rhozly-on-surface/40">
    Scanned {formatRelativeTime(lastScannedAt)}
  </p>
)}
```

### 7.4 — Image Deletion on Scan Delete

If user deletes a scan from history, also remove the Storage object:

```typescript
await supabase.storage.from("area-scans").remove([scan.image_path]);
await supabase.from("area_scans").delete().eq("id", scan.id);
```

---

## Phase 8 — AI Pattern Engine Integration

### Goal
Feed scan activity into `user_events` for the AI pattern engine, and surface a re-scan nudge via the AI assistant when a scan is overdue.

### 8.1 — Log Events

Import `logEvent` and `EVENT` from `src/events/registry.ts` (already used in AilmentWatchlist and other components).

Log these events:

```typescript
// On scan completed
logEvent(EVENT.AREA_SCAN_COMPLETED, {
  area_id: area.id,
  area_name: area.name,
  plant_count: analysis.plants.length,
  pests_found: analysis.pests_diseases.length > 0,
  capacity_label: analysis.capacity.label,
});

// On task accepted from scan
logEvent(EVENT.SCAN_TASK_ACCEPTED, {
  area_id: area.id,
  task_title: suggestion.title,
  urgency: suggestion.urgency,
});

// On ailment linked from scan
logEvent(EVENT.SCAN_AILMENT_LINKED, {
  area_id: area.id,
  ailment_name: pest.name,
  severity: pest.severity,
});
```

Add `AREA_SCAN_COMPLETED`, `SCAN_TASK_ACCEPTED`, `SCAN_AILMENT_LINKED` to `src/events/registry.ts`.

### 8.2 — Re-Scan Nudge Pattern

Add to `supabase/functions/_shared/patterns/` a new pattern module: `areaNotScanned.ts`:

```typescript
// Fires if an area has not been scanned in 30+ days AND has active plants
export const areaNotScanned = {
  id: "area_not_scanned",
  check: async (supabase, homeId) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Areas with plants that haven't been scanned in 30d
    const { data: areas } = await supabase
      .from("areas")
      .select("id, name, inventory_items(count), area_scans(created_at)")
      .eq("home_id", homeId)
      // only areas with at least one plant
      .gt("inventory_items.count", 0);

    const stale = areas?.filter(a => {
      const lastScan = a.area_scans?.[0]?.created_at;
      return !lastScan || new Date(lastScan) < thirtyDaysAgo;
    }) ?? [];

    return stale.map(a => ({
      pattern_id: "area_not_scanned",
      area_id: a.id,
      area_name: a.name,
      message: `${a.name} hasn't been scanned in over 30 days — a quick photo can catch issues early.`,
    }));
  },
};
```

Register in `_shared/patterns/index.ts`. The existing `pattern-scan` function picks it up automatically.

### 8.3 — AI Assistant Nudge Surface

The AI assistant (`plant-doctor` context) can surface the re-scan nudge when the user is viewing `AreaDetails`. The `usePlantDoctor` context already receives area context — extend `setPageContext` to include `lastScannedAt`:

```typescript
setPageContext({
  action: `Inspecting Area: ${area.name}`,
  // ... existing fields ...
  lastScannedAt: latestScan?.created_at ?? null,
});
```

The `plant-doctor-ai` system prompt can then note: "If lastScannedAt is over 30 days ago or null, suggest the user scan the area."

---

## Files Created / Modified Summary

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/<ts>_area_scans.sql` | Schema — area_scans + area_scan_ailments |
| `supabase/functions/scan-area/index.ts` | Edge function — AI analysis |
| `src/components/AreaScanModal.tsx` | Main scan UI: capture → questions → results |
| `src/lib/scanQuestions.ts` | Extensible pre-scan question registry |
| `supabase/functions/_shared/patterns/areaNotScanned.ts` | Pattern for 30-day re-scan nudge |

### Modified Files
| File | Change |
|------|--------|
| `src/components/AreaDetails.tsx` | Add "Scan Area" button, scan history panel, ailment badges |
| `src/components/LocationPage.tsx` | Add capacity badge + last scanned timestamp on area cards |
| `src/events/registry.ts` | Add AREA_SCAN_COMPLETED, SCAN_TASK_ACCEPTED, SCAN_AILMENT_LINKED |
| `supabase/functions/_shared/patterns/index.ts` | Register areaNotScanned pattern |

---

## Edge Cases

- **No plants in area**: Scan still runs. AI notes that no plants were detected and suggests importing via BulkSearch.
- **Low-confidence ID (<55%)**: Show warning card. Do not auto-suggest task creation until user confirms the plant.
- **Network failure mid-upload**: Image upload happens before edge function call. If upload succeeds but edge function fails, surface a "Retry analysis" button. Never lose the uploaded image.
- **Image too large**: Resize to max 1920×1920 client-side before base64 encoding. Use Canvas API.
- **Scan on area with no location_id**: Edge function handles gracefully — location context just shows "unknown".
- **Duplicate pest linking**: `area_scan_ailments` has a unique constraint on `(area_scan_id, ailment_id)` — duplicate insert silently no-ops.
- **Old browser / no camera**: File picker fallback always present. Camera capture is progressive enhancement.

---

## Non-Goals (Explicit)

- Real-time scan streaming (one-shot analysis only)
- Video analysis
- Multi-area batch scans
- Server-side image resizing (client handles this)
- Offline scan capability
