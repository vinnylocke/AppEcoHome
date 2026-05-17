# Plan — AI Task Optimiser

## Overview

A second "AI Analyse" button on the Optimise tab that sends a rich context bundle to Gemini and returns proposals of the same shape as the rule-based engine. Results from both engines are merged into a single list, each card badged as **Rule** or **AI**. AI analysis is gated behind `ai_enabled` on the user profile.

The AI can propose three things the rule engine cannot:
- **Frequency change** — adjust the `frequency_days` of an existing blueprint based on actual completion/postponement patterns
- **New blueprint** — create a blueprint from scratch (e.g. no Pest Control blueprint despite an active aphid ailment)
- **Retire** — archive a blueprint that has zero completions and persistent postponements/skips, suggesting it is not working for this area

---

## Extended Proposal Schema

### New scenario types (added to `ScenarioType`)

```typescript
export type ScenarioType =
  // Rule engine
  | "fragmentation" | "redundant" | "two-tier" | "pileup"
  // AI engine
  | "frequency-change" | "new-blueprint" | "retire";
```

### Extended `OptimisationProposal`

Two new optional fields added to the existing interface:

```typescript
export interface OptimisationProposal {
  // --- existing fields unchanged ---
  id: string;
  scenario: ScenarioType;
  areaId: string;
  category: OptimisableCategory;
  displayText: string;
  before: ProposalBeforeItem[];
  after: ProposalAfterItem[];
  blueprintsToArchive: string[];
  plantInstanceIdsForNewBlueprint: string[];
  newBlueprintTitle: string;
  newBlueprintFrequencyDays: number;
  newBlueprintDescription: string;

  // --- new fields ---
  source: "rule" | "ai";                                        // badge on card
  reasoning?: string;                                           // AI explanation
  frequencyChanges?: { blueprintId: string; newFrequencyDays: number }[]; // frequency-change scenario
}
```

**All existing rule-based proposals get `source: "rule"` and no `reasoning`.**

### How each new scenario maps to the proposal fields

| Scenario | `blueprintsToArchive` | `frequencyChanges` | new blueprint created |
|---|---|---|---|
| `frequency-change` | `[]` | `[{ blueprintId, newFrequencyDays }]` | No |
| `new-blueprint` | `[]` | — | Yes |
| `retire` | `[blueprintId]` | — | No |

---

## Context Bundle

The edge function collects the following before building the prompt. All data is scoped to the requested `areaId` and `homeId`.

### 1 — Blueprints in the area
From `task_blueprints` — `id`, `title`, `task_type`, `frequency_days`, `start_date`, `inventory_item_ids`, `area_id`. Same query as the rule engine (active + recurring + not archived).

### 2 — Task history (30 days)
From `tasks` — grouped by `blueprint_id`, counts of:
- `completed` — status = 'Completed'
- `postponed` — status = 'Postponed'
- `skipped` — status = 'Skipped'
- `overdue` — status = 'Pending' AND `due_date < today`

Only tasks whose `blueprint_id` is in the area blueprint set, and `due_date >= today - 30 days`.

### 3 — Inventory items in the area
From `inventory_items` — `id`, `plant_name`, `health_status`, `date_planted`, `area_id`. Only items where `area_id = areaId`.

### 4 — Active ailments / watchlist
From `ailments` joined with `ailment_plant_links` — ailment `title`, `category` (pest/disease/invasive), `severity`, linked `inventory_item_id`. Only ailments that are not archived and linked to plants in this area.

### 5 — Area & location info
From `areas` and `locations` — area `name`, `is_outside`; location `name`, `climate_zone` (if present).

### 6 — Home info
From `homes` — `hardiness_zone`, `latitude`, `longitude` (for seasonal context).

### 7 — Weather alerts
From `weather_alerts` — last 7 days, alert `type` and `severity` for this home. Not raw forecast data — just the alerts already stored.

---

## Edge Function: `optimise-area-ai`

**File:** `supabase/functions/optimise-area-ai/index.ts`

**Auth:** JWT required. Validates the user is a member of the home.

**Input (POST body):**
```json
{ "homeId": "uuid", "areaId": "uuid" }
```

**Steps:**
1. Verify JWT + home membership
2. Fetch all 7 context data sets in parallel (Promise.all)
3. Build prompt (see below)
4. Call Gemini (`gemini-2.0-flash`, JSON mode, `responseMimeType: "application/json"`)
5. Parse and validate response — strip any proposal referencing IDs not in the context
6. Return validated proposals as JSON

**Rate limit:** Use existing `rateLimit` shared module — 5 calls per user per hour (AI calls are expensive).

---

## Prompt Design

### System instruction

```
You are a garden task optimisation assistant for Rhozly, a plant care app.
Your job: analyse the recurring task blueprints and recent task history for one garden area and return improvement proposals as structured JSON.
You have access to plant health status, pest and disease alerts, weather conditions, and 30-day task completion patterns.
Return ONLY the JSON object — no explanation, no markdown, no preamble.
```

### User prompt (assembled server-side)

```
AREA: {areaName} ({is_outside ? "outdoor" : "indoor area"})
LOCATION: {locationName}
HOME: hardiness zone {hardinessZone}, latitude {lat}

== BLUEPRINTS IN THIS AREA ==
{for each blueprint:}
  ID: {id}
  Title: {title}
  Type: {task_type}
  Frequency: every {frequency_days} days
  Plants covered: {plant names from inventory_item_ids, or "area-level (all plants)"}

== TASK HISTORY (last 30 days) ==
{for each blueprint:}
  {title} ({id}): completed={n}, postponed={n}, skipped={n}, overdue={n}
  {if no history: "(no task history — blueprint may be new)"}

== PLANTS IN THIS AREA ==
{for each inventory item:}
  ID: {id}  Name: {plant_name}  Health: {health_status}  Planted: {date_planted ?? "unknown"}

== ACTIVE PEST / DISEASE ALERTS ==
{if none: "None"}
{for each ailment:}
  {category}: {title} — affecting: {linked plant names}

== RECENT WEATHER ALERTS (last 7 days) ==
{if none: "None"}
{for each alert: type + severity}

== YOUR TASK ==
Propose improvements to the task blueprints for this area. Follow these rules strictly:

ALLOWED task types to optimise: Watering, Harvesting, Pruning.
For Maintenance and Planting blueprints: you may ONLY propose "retire" — never frequency-change, consolidate, or create new ones.
Do NOT propose changes to blueprints with no task history — there is insufficient data.
Do NOT create a blueprint for a task type that already has an area-level blueprint in this area.
All blueprintId and instanceId values you output MUST exactly match IDs listed above.
Do NOT invent or guess IDs.

PROPOSAL TYPES YOU MAY USE:
- "frequency-change": adjust how often an existing blueprint fires (use frequencyChanges field)
- "new-blueprint": create a brand-new blueprint (use newBlueprintTitle, newBlueprintFrequencyDays, plantInstanceIdsForNewBlueprint)
- "retire": archive a blueprint that is clearly not being used or is counterproductive
- "fragmentation": consolidate multiple instance-level blueprints into one area blueprint
- "redundant": archive instance-level duplicates that an area blueprint already covers
- "two-tier": split mainstream plants from outlier plants
- "pileup": consolidate blueprints all firing on the same day

For each proposal write a "reasoning" field: 1–2 sentences explaining exactly why you are suggesting this change, citing the specific data (e.g. "This blueprint was postponed 8 times and completed 0 times in 30 days").

== REQUIRED OUTPUT FORMAT ==
Return a JSON object with this exact structure:
{
  "proposals": [
    {
      "scenario": "frequency-change|new-blueprint|retire|fragmentation|redundant|two-tier|pileup",
      "category": "Watering|Harvesting|Pruning|Maintenance|Planting",
      "reasoning": "string",
      "displayText": "short one-line summary of the proposal",
      "before": [{ "blueprintId": "uuid", "title": "string", "frequencyDays": number, "plantNames": ["string"] }],
      "after": [{ "title": "string", "frequencyDays": number, "plantNames": ["string"], "isNew": true|false, "retainedBlueprintId": "uuid or omit" }],
      "blueprintsToArchive": ["uuid"],
      "plantInstanceIdsForNewBlueprint": ["uuid"],
      "newBlueprintTitle": "string or empty",
      "newBlueprintFrequencyDays": number,
      "newBlueprintDescription": "string or empty",
      "frequencyChanges": [{ "blueprintId": "uuid", "newFrequencyDays": number }]
    }
  ]
}
If you have no proposals, return: { "proposals": [] }
```

---

## Hallucination Protection (Server-Side Validation)

After parsing Gemini's JSON, the edge function runs validation before returning. Any proposal that fails is silently dropped (not surfaced as an error).

**Checks:**
1. `blueprintsToArchive` — every UUID must exist in the context blueprint set
2. `frequencyChanges[].blueprintId` — must exist in context
3. `plantInstanceIdsForNewBlueprint` — every UUID must exist in the context inventory item set
4. `after[].retainedBlueprintId` — if present, must exist in context
5. `scenario` — must be one of the 7 allowed values
6. `category` — must be one of the 5 allowed values
7. `newBlueprintFrequencyDays` — must be a positive integer ≤ 365
8. If `frequencyChanges` is non-empty, `blueprintsToArchive` must be empty (can't archive and frequency-change the same blueprint)

A proposal that passes all checks is assigned `source: "ai"` before being returned.

---

## UI Changes

### `OptimisationProposalCard.tsx`
- Add source badge: **AI** (purple) or **Rule** (grey) in the header alongside the scenario badge
- Add `reasoning` field rendered below `displayText` when present — italicised, smaller text, prefixed with a small ✦ or quote icon

### `OptimiseTab.tsx`
- Add `aiEnabled: boolean` prop (passed from BlueprintManager)
- Add separate state: `aiProposals: OptimisationProposal[] | null`
- Add "AI Analyse" button — only visible when `aiEnabled` is true
  - Calls the `optimise-area-ai` edge function
  - Has its own loading state (`aiAnalysing`)
  - Requires an area to be selected (same as rule-based)
- Merged results list: `[...proposals, ...aiProposals]` sorted by scenario severity
  - If only rule proposals exist, show as now
  - If only AI proposals exist, show as now (with AI badges)
  - If both: merged, with badges distinguishing source
- `included` set covers both rule and AI proposal IDs
- Apply logic extended for new scenario types (see below)

### `BlueprintManager.tsx`
- Pass `aiEnabled` prop down to `OptimiseTab`
- `BlueprintManager` receives `aiEnabled: boolean` prop from `App.tsx`

### `App.tsx`
- Pass `aiEnabled={profile.ai_enabled ?? false}` to `BlueprintManager`

### Scenario badge colour map (additions)

| Scenario | Label | Colour |
|---|---|---|
| `frequency-change` | Frequency Change | `bg-sky-100 text-sky-800` |
| `new-blueprint` | New Blueprint | `bg-emerald-100 text-emerald-800` |
| `retire` | Retire | `bg-zinc-100 text-zinc-700` |

---

## Apply Logic Changes (`OptimiseTab.tsx`)

The `applyProposals` loop needs two new branches:

### `frequency-change`
```typescript
if (proposal.scenario === "frequency-change" && proposal.frequencyChanges?.length) {
  for (const change of proposal.frequencyChanges) {
    await supabase
      .from("task_blueprints")
      .update({ frequency_days: change.newFrequencyDays })
      .eq("id", change.blueprintId);
  }
  // No archive, no new blueprint — record the blueprint ID in allCreatedIds
  // so the session has a reference (reuse createdBlueprintIds loosely for undo awareness)
}
```

Note: frequency-change proposals cannot be "undone" in the same way (we'd need to know the old frequency). For the session record, `archived_blueprint_ids = []` and `created_blueprint_ids = []` — the session is still recorded for history but the Undo button will be disabled for sessions that contain only frequency changes.

### `new-blueprint`
No change needed — this already follows the `needsNewBlueprint = true` path.

### `retire`
No change needed — this follows the same path as `redundant` (archive only, no new blueprint, no junction table updates since `plantInstanceIdsForNewBlueprint = []`).

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/functions/optimise-area-ai/index.ts` | New — edge function |
| `src/lib/taskOptimiser.ts` | Modify — extend `ScenarioType`, `OptimisationProposal` |
| `src/lib/taskOptimiserAi.ts` | New — client-side call to edge function + response validation util |
| `src/components/OptimisationProposalCard.tsx` | Modify — source badge, reasoning field, new scenario colours |
| `src/components/OptimiseTab.tsx` | Modify — aiEnabled prop, AI Analyse button, merged results, extended apply |
| `src/components/BlueprintManager.tsx` | Modify — accept + pass aiEnabled prop |
| `src/App.tsx` | Modify — pass `aiEnabled` to `BlueprintManager` |

---

## Feedback & Regenerate

### New table: `optimiser_proposal_feedback`

```sql
CREATE TABLE optimiser_proposal_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id          uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  area_id          uuid REFERENCES areas(id) ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id      text NOT NULL,          -- client-generated id field from proposal
  proposal_snapshot jsonb NOT NULL,        -- {scenario, category, displayText, reasoning}
  rating           text NOT NULL CHECK (rating IN ('positive', 'negative')),
  created_at       timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, area_id, proposal_id)   -- one rating per user per proposal per area
);
```

RLS: user can insert and read own rows only.

### Thumbs up / thumbs down (per AI proposal)

- Rendered on `OptimisationProposalCard` when `source === "ai"`
- Immediate optimistic update — button pair disables after one rating
- On click: `INSERT INTO optimiser_proposal_feedback` with the proposal snapshot + rating
- Same pattern as `chat_feedback` in PlantDoctorChat

### Regenerate button

- Single "Regenerate AI results" button shown below the AI results section
- Opens a modal (`RegenerateReasonModal`) with:
  - Heading: "What would you like to be different?"
  - Textarea placeholder: "e.g. The suggestions weren't relevant, please focus more on watering gaps…"
  - Cancel / Regenerate buttons
- On confirm: re-calls `optimise-area-ai`, passing two additional fields in the request body:
  - `regenerateReason: string` — the user's typed reason
  - `previousNegativeFeedback: { proposalId, displayText, reasoning }[]` — fetched from `optimiser_proposal_feedback` for this user + area (negative ratings only, last 30 days)

### How feedback improves future AI calls

The edge function accepts `previousNegativeFeedback` and `regenerateReason` in the request body. If present, they are appended to the prompt before the output format section:

```
== PREVIOUS FEEDBACK FROM THIS USER ==
You previously analysed this area. The user rejected the following suggestions:
- [negative] "{displayText}" — AI reasoning was: "{reasoning}"
{if regenerateReason: User's regenerate reason: "{regenerateReason}"}
Do NOT repeat proposals the user has already rejected. Adjust your analysis accordingly.
```

This means every regeneration and every future AI analysis for the same area benefits from accumulated negative ratings — the AI won't keep suggesting things the user has already dismissed.

---

## Out of Scope (This Phase)

- Cross-area AI analysis (one area at a time, same as rule engine)
- AI suggestions for Maintenance task content/instructions
- Undo support for `frequency-change` proposals (undo button disabled for those sessions)
- Caching AI results (each Analyse call hits Gemini fresh)
- AI confidence scores (reasoning text is sufficient signal)
