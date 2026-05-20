# Wave 1 — Visual Lens (Analyse action) — sub-plan

Parent plan: [mobile-quick-access-screen.md](./mobile-quick-access-screen.md)

## Goal

Ship the **Analyse** action server-side first, with the result card and task generation working on the existing `/doctor` screen. This lets us validate AI quality on desktop before building the mobile shell in Wave 2.

## What the user gets after this wave

On `/doctor`, take/upload a photo → tap **Analyse** (highlighted as primary, first in the row) → see a single result card covering:

1. **Identification** — common + scientific name, confidence.
2. **Health & sunlight check** — overall state, whether the light level looks appropriate.
3. **Pruning** — method, where to cut, how to cut, tips.
4. **Propagation** — method, when to do it, step-by-step.
5. **Edibility & ripeness** (if edible) — ripe / near ripe / not yet + days-until-ripe estimate.
6. *(conditional)* **Disease** — name, cure methods, prevention methods.
7. *(conditional)* **Pest** — name, removal methods, prevention methods.

Plus a **Suggested Tasks** block at the bottom — pre-checked, one tap to add to the user's calendar. The tasks are produced by the same Gemini call (no second round trip).

## App-reference files consulted

- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md) — current screen wiring; action buttons + result rendering.
- [05-tools/03-plant-doctor-chat.md](../app-reference/05-tools/03-plant-doctor-chat.md) — the chat already produces `suggested_tasks` in the rich shape we'll reuse.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini call patterns (`callGeminiCascade`, `toMessages`, `responseSchema`).
- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — `task_blueprints` + `tasks` shape.
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — where the new action gets catalogued.

Source files studied:
- [supabase/functions/plant-doctor/index.ts](../../supabase/functions/plant-doctor/index.ts) (1247 lines) — single edge fn, action-discriminated. New action lands here.
- [supabase/functions/plant-doctor-ai/index.ts](../../supabase/functions/plant-doctor-ai/index.ts) — the chat's `suggested_tasks` schema. We reuse this exact shape.
- [src/services/plantDoctorService.ts](../../src/services/plantDoctorService.ts) — `analyzeImage`, `applyTreatmentPlan` (treatment-plan writer; we won't need this path).
- [src/components/TaskActionButtons.tsx](../../src/components/TaskActionButtons.tsx) — the existing UI that converts `suggested_tasks[]` into rows in `task_blueprints` + `tasks` + `task_dependencies`. Reused verbatim.
- [src/components/PlantDoctor.tsx](../../src/components/PlantDoctor.tsx) (~1673 lines) — adds the new Analyse button + new result section.

## Architecture decisions

### Decision 1 — One Gemini call, not two

Tempting alternative: Analyse returns the analysis; user taps "Generate tasks" → second Gemini call (existing `generate_remedial_plan`).

**Rejected.** Doubles cost + latency. Users have already opted in by tapping Analyse — they want everything. Returns one combined payload with both the structured analysis and the `suggested_tasks` array. User chooses which tasks to commit via the existing `TaskActionButtons` UI (checkboxes, tap to save).

### Decision 2 — Reuse the chat's `suggested_tasks` schema verbatim

The chat already produces tasks in this shape:

```ts
type SuggestedTask = {
  title: string;
  description: string;
  task_type: "Planting" | "Watering" | "Harvesting" | "Maintenance";
  due_in_days: number;              // relative offset from today
  is_recurring: boolean;
  frequency_days: number | null;    // when is_recurring=true
  end_offset_days: number | null;   // when is_recurring=true
  depends_on_index: number | null;  // chains: "do X then Y after Z days"
};
```

This is richer than the diagnose path's `remedial_schedules` (which always starts today). We need `due_in_days` because the Analyse output legitimately includes future-dated tasks: *"prune in 6 weeks"*, *"check ripeness in 5 days"*, *"take cuttings in late spring"*.

Using the chat's exact schema means the `AnalyseResultCard` can drop `<TaskActionButtons tasks={result.suggested_tasks} homeId={...} />` directly — zero new task-writing code, zero divergent task-creation paths.

### Decision 3 — `task_type` stays restricted to the existing four

Gemini is constrained to `Planting | Watering | Harvesting | Maintenance` — the same set the rest of the app uses (BlueprintManager, task filters, automations all key off this enum). New pseudo-types like "Pruning" or "Propagation" become Maintenance with descriptive titles. This avoids cascading enum changes across the app.

### Decision 4 — Prompt rules borrowed from `generate_remedial_plan`

The remedial-plan prompt (index.ts:1060-1071) has battle-tested rules:
- One-off tasks for immediate triage / environmental changes / habits (`is_recurring: false`)
- NO duplicate watering — if watering routine changes, single one-off Maintenance task
- Recurring only for active treatments
- Max 14–21 days end_offset for recurring

We carry these forward + extend them for the Analyse-specific cases (pruning windows, harvest reminders, propagation timing).

### Decision 5 — Analyse runs the same `enforceRateLimit` + tier gate as Diagnose

No new gating logic. Sage/Evergreen only. Costs one Gemini call per Analyse, same envelope as Diagnose.

## Server-side changes

### `supabase/functions/plant-doctor/index.ts`

Add a single new action `analyse_comprehensive` next to `diagnose` (~line 1035). New constants near the schema block:

```ts
// Rich combined schema — analysis + suggested tasks in one payload.
const ANALYSE_COMPREHENSIVE_SCHEMA = {
  type: "OBJECT",
  properties: {
    identification: {
      type: "OBJECT",
      properties: {
        common_name:     { type: "STRING" },
        scientific_name: { type: "ARRAY", items: { type: "STRING" } },
        confidence:      { type: "INTEGER", description: "0-100" },
      },
      required: ["common_name", "scientific_name", "confidence"],
    },
    health: {
      type: "OBJECT",
      properties: {
        state: {
          type: "STRING",
          enum: ["healthy", "stressed", "diseased", "pest_damaged"],
        },
        notes: { type: "STRING" },
        sunlight_appears_appropriate: { type: "BOOLEAN", nullable: true },
        sunlight_notes:               { type: "STRING",  nullable: true },
      },
      required: ["state", "notes"],
    },
    pruning: {
      type: "OBJECT",
      properties: {
        method:       { type: "STRING" },
        where_to_cut: { type: "STRING" },
        how_to_cut:   { type: "STRING" },
        tips:         { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["method", "where_to_cut", "how_to_cut", "tips"],
    },
    propagation: {
      type: "OBJECT",
      properties: {
        method: { type: "STRING" },
        when:   { type: "STRING", description: "Relative to user's hemisphere — e.g. 'late spring', 'now'" },
        steps:  { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["method", "when", "steps"],
    },
    edibility: {
      type: "OBJECT",
      nullable: true,
      properties: {
        is_edible:                  { type: "BOOLEAN" },
        ripeness:                   { type: "STRING", nullable: true, enum: ["not_yet", "near_ripe", "ripe", "overripe"] },
        estimated_days_until_ripe:  { type: "INTEGER", nullable: true },
        notes:                      { type: "STRING",  nullable: true },
      },
      required: ["is_edible"],
    },
    disease: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name:                { type: "STRING" },
        cure_methods:        { type: "ARRAY", items: { type: "STRING" } },
        prevention_methods:  { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["name", "cure_methods", "prevention_methods"],
    },
    pest: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name:                { type: "STRING" },
        removal_methods:     { type: "ARRAY", items: { type: "STRING" } },
        prevention_methods:  { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["name", "removal_methods", "prevention_methods"],
    },
    // Identical shape to chat's suggested_tasks — TaskActionButtons consumes directly.
    suggested_tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title:           { type: "STRING" },
          description:     { type: "STRING" },
          task_type:       { type: "STRING", enum: ["Planting", "Watering", "Harvesting", "Maintenance"] },
          due_in_days:     { type: "INTEGER", description: "0 = today, N = N days from now" },
          is_recurring:    { type: "BOOLEAN" },
          frequency_days:  { type: "INTEGER", nullable: true },
          end_offset_days: { type: "INTEGER", nullable: true },
          depends_on_index: { type: "INTEGER", nullable: true },
        },
        required: ["title", "description", "task_type", "due_in_days", "is_recurring"],
      },
    },
  },
  required: ["identification", "health", "pruning", "propagation", "suggested_tasks"],
};
```

Handler block (next to `if (action === "diagnose")`):

```ts
if (action === "analyse_comprehensive") {
  if (!imageBase64) throw new Error("No image data provided.");
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

  // Reuse the same environmental enrichment block diagnose uses (area, lux,
  // companions, recent tasks, weather). Same Promise.all, same envBlock build.
  // Extract into a small helper `buildEnvBlock(supabase, { inventoryItemId, areaId, homeId })`
  // so diagnose + analyse share it.

  const plantContext = targetPlant
    ? `This plant is a "${targetPlant}". Use this to ground your identification.`
    : "The plant species is unknown — identify it from the image.";

  const promptText = `${plantContext}
${locationLine ? `Gardener location: ${locationLine}. Use regional climate to time pruning, propagation, and harvest windows.` : ""}${envBlock}

You are doing a COMPREHENSIVE analysis of the plant in this photo. Fill in EVERY section of the response schema based on what you can see + the context above.

IDENTIFICATION: Best guess at common + scientific name; confidence 0-100.

HEALTH: Overall state (healthy / stressed / diseased / pest_damaged). Sunlight check: based on the leaf colour and the area's sunlight context, is the light level appropriate? Null if unclear from the photo.

PRUNING: How would an experienced gardener prune this plant? Where on the plant to cut, how to make the cut, and 2-4 tips.

PROPAGATION: Best propagation method, when to do it (relative to the user's hemisphere — '${hemisphere}'), and 3-5 ordered steps.

EDIBILITY: Is any part edible? If so, what does the ripeness in the photo look like (or null if not visible)? If 'not_yet' or 'near_ripe', estimate days_until_ripe.

DISEASE: Only fill if you see clear disease symptoms. Include cure + prevention methods. Null otherwise.

PEST: Only fill if you see pests or pest damage. Include removal + prevention methods. Null otherwise.

SUGGESTED_TASKS: 2-6 actionable tasks the user should add to their calendar based on EVERYTHING above. CRITICAL RULES:
1. task_type MUST be one of: 'Planting' | 'Watering' | 'Harvesting' | 'Maintenance'. Pruning, propagation prep, treatments = 'Maintenance'.
2. due_in_days: 0 for today, N for "do this in N days". Pruning windows: pick a date inside the plant's correct pruning month for ${hemisphere}.
3. is_recurring=true ONLY for active ongoing treatments (e.g. spray neem weekly for 21 days). NEVER for watering routines.
4. For recurring tasks, end_offset_days <= 21.
5. depends_on_index: use null unless one task naturally chains from another (e.g. "take cuttings" then "transplant cuttings in 6 weeks" → second task depends_on_index of the first).
6. If the plant looks ripe or near-ripe, add a "Harvesting" task with appropriate due_in_days.
7. If a disease or pest is present, prioritise treatment tasks at the top of the array.`;

  const { text: rawText, usage } = await callGeminiCascade(
    apiKey, FN,
    toMessages([promptText, { inlineData: { data: cleanBase64, mimeType: mimeType || "image/jpeg" } }]),
    { responseSchema: ANALYSE_COMPREHENSIVE_SCHEMA, logContext: { action } },
  );
  const parsed = JSON.parse(rawText);
  await logAiUsage(supabase, {
    homeId: homeId ?? null,
    userId: callerUserId,
    functionName: FN,
    action: "analyse_comprehensive",
    usage,
  });
  log(FN, "result", {
    action,
    identifiedAs: parsed.identification?.common_name,
    healthState: parsed.health?.state,
    hasDisease: !!parsed.disease,
    hasPest: !!parsed.pest,
    suggestedTasksCount: (parsed.suggested_tasks ?? []).length,
  });
  return new Response(rawText, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

The environmental-enrichment block (currently inlined in the `diagnose` action, lines 902-998) gets extracted to a small private helper `buildEnvBlock()` so both diagnose and analyse share it. Pure refactor, no behaviour change.

### `src/services/plantDoctorService.ts`

Add the action to the union + a typed method:

```ts
export type AnalyseResult = {
  identification: { common_name: string; scientific_name: string[]; confidence: number };
  health: {
    state: "healthy" | "stressed" | "diseased" | "pest_damaged";
    notes: string;
    sunlight_appears_appropriate: boolean | null;
    sunlight_notes: string | null;
  };
  pruning: { method: string; where_to_cut: string; how_to_cut: string; tips: string[] };
  propagation: { method: string; when: string; steps: string[] };
  edibility: {
    is_edible: boolean;
    ripeness: "not_yet" | "near_ripe" | "ripe" | "overripe" | null;
    estimated_days_until_ripe: number | null;
    notes: string | null;
  } | null;
  disease: { name: string; cure_methods: string[]; prevention_methods: string[] } | null;
  pest: { name: string; removal_methods: string[]; prevention_methods: string[] } | null;
  suggested_tasks: SuggestedTask[]; // SuggestedTask imported from TaskActionButtons
};

analyseComprehensive(params: {
  homeId?: string;
  imageBase64: string;
  mimeType: string;
  targetPlant?: string;
  inventoryItemId?: string;
  areaId?: string;
  deviceLat?: number;
  deviceLng?: number;
}): Promise<AnalyseResult> {
  return invoke({ action: "analyse_comprehensive", ...params });
}
```

`SuggestedTask` gets exported from `TaskActionButtons.tsx` (currently a local interface) so the service can import it.

## Client-side changes

### New file — `src/components/lens/AnalyseResultCard.tsx`

A self-contained renderer for `AnalyseResult`. Six fixed sections + two conditional + the task suggestions:

```
<AnalyseResultCard result={result} homeId={homeId} onTasksAdded={...}>
  <Section icon={Sprout} title="Identification" /> // name, sci name, confidence chip
  <Section icon={Heart}  title="Health & Light"   /> // state pill, sunlight check
  <Section icon={Scissors} title="Pruning"        /> // method, where/how/tips
  <Section icon={Sprout} title="Propagation"      /> // method, when, ordered steps
  {result.edibility?.is_edible && <Section icon={Wheat} title="Edibility & Ripeness" />}
  {result.disease && <Section icon={Syringe} title="Disease" />}
  {result.pest    && <Section icon={Bug}     title="Pest"    />}
  <TaskActionButtons tasks={result.suggested_tasks} homeId={homeId} onSuccess={onTasksAdded} />
</AnalyseResultCard>
```

Visual treatment:
- Sections collapse-by-default after the first 2 (Identification + Health always open; rest tap-to-expand) so the screen isn't a wall of text.
- Health state shown as a coloured pill ("Healthy" green / "Stressed" amber / "Diseased" red / "Pest damaged" red).
- Confidence as a small chip ("87% confident").
- Disease + Pest sections styled with subtle red border so they stand out.
- The TaskActionButtons block already has its own card chrome — drops in cleanly.

### `src/components/PlantDoctor.tsx`

Three additions:

1. **State + handler**:
   ```ts
   const [analyseResult, setAnalyseResult] = useState<AnalyseResult | null>(null);
   const handleAnalyse = useCallback(async () => { ... }, [...]);
   ```
   Mirrors `handleIdentify` / `handleDiagnose` (same `setIsProcessing`, same `setActiveAction`, same image-base64 conversion).

2. **Button row update** — Analyse becomes the first, visually-primary button:
   ```
   [ ✨ Analyse ]  [ Identify ]  [ Diagnose ]  [ Pest Scan ]
   ```
   The first button uses `bg-rhozly-primary text-white` (filled), the other three use the existing ghost style. Same row, same disable rules (no image → all disabled).

3. **Result panel** — when `activeAction === "analyse"`, render `<AnalyseResultCard />` instead of the existing identification/diagnose/pest result blocks. The existing blocks stay for their respective actions.

4. **Session write** — write a row to `plant_doctor_sessions` with `action: "analyse_comprehensive"`, same as the other actions. History tab automatically picks it up. We add `analyse_result jsonb` (or reuse the existing `diagnosis jsonb` column — TBD by checking the table; will be confirmed during implementation).

### Optional polish (in this wave, only if cheap)

- Show a small loading skeleton inside `AnalyseResultCard` while the call is in flight (it can take 8-15s; pure-text identifying spinner is ugly for that long).
- Empty-state for `suggested_tasks: []` — "Nothing to schedule — this plant looks happy".

## Data-safety audit

| Change | Risk |
|---|---|
| New action `analyse_comprehensive` in edge fn | None — additive |
| Extract `buildEnvBlock` helper | Pure refactor — diagnose behaviour byte-identical |
| `SuggestedTask` exported from TaskActionButtons | None — interface export only |
| `AnalyseResult` type added to service | None — additive |
| Analyse button on PlantDoctor screen | None — additive |
| Session row write with new action value | The `plant_doctor_sessions.action` column is a free text field per the existing schema (will confirm); no constraint added. |
| Tasks written via TaskActionButtons (existing path) | None — same path the chat uses today, in production for months |

## Tests

| Tier | What |
|---|---|
| Deno | New unit test for `buildEnvBlock` (env enrichment correctness) — same fixtures the diagnose action could use, but the helper's now testable |
| Deno | Mock Gemini → return a fixture matching `ANALYSE_COMPREHENSIVE_SCHEMA` → assert the edge fn returns it unchanged + writes the AI-usage row |
| Vitest | `AnalyseResultCard` rendering — all sections visible for a full result; disease + pest hidden when null; edibility section hidden when not edible |
| Vitest | Suggested tasks pass through to `TaskActionButtons` — render check, not the click flow (covered by existing tests) |
| Playwright | (Skip in Wave 1 — needs a real photo upload + mocked Gemini at the edge layer. Add in Wave 2 once the mobile route exists and we can lock down selectors.) |

## App-reference updates

- **Update** [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md):
  - Add Analyse to the actions table (Role 1 + Role 2).
  - Add `analyse_comprehensive` to the Edge functions invoked list.
  - Document `AnalyseResultCard` in the component graph.
  - Role 2: add "Analyse" as the recommended default action.
- **Update** [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md):
  - Add `analyse_comprehensive` row under the `plant-doctor` function.
- **Update** [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md):
  - Add the new action to the action list with its rate-limit + tier-gate notes.
- **No new file** in 04-tools for "Visual Lens" yet — that's a Wave 2 deliverable when the mobile screen exists.

## Implementation order

1. **Extract `buildEnvBlock` helper** in `plant-doctor/index.ts`. Run existing tests to confirm no regression.
2. **Add `ANALYSE_COMPREHENSIVE_SCHEMA`** constant + the handler block.
3. **Export `SuggestedTask`** from `TaskActionButtons.tsx`.
4. **Add `AnalyseResult` type + `analyseComprehensive` method** in `plantDoctorService.ts`.
5. **Build `AnalyseResultCard.tsx`** with all sections; mock data while developing.
6. **Wire into `PlantDoctor.tsx`** — button, handler, result panel branch.
7. **Add Deno + Vitest tests**.
8. **Update app-reference docs**.
9. **Manual test** on `/doctor` with real photos: healthy plant, sick plant (leaf spot), ripe tomato, pest on leaf. Verify suggested tasks come through and `TaskActionButtons` writes them correctly.
10. **Deploy** via `npm run deploy` when results look good.

## What this wave doesn't do

- No new routes (`/quick/lens` lands in Wave 2).
- No mobile detection or layout (Wave 2).
- No journal or calendar (Waves 3-4).
- No new tier or beta gate.
- No Vercel auto-deploy — commit with `[skip ci]` per current convention; manual `npm run deploy` when validated.

## Open questions

None — this wave's decisions are all locked in. The three master-plan decisions (frost dates / Analyse placement / capture retention) belong to later waves.
