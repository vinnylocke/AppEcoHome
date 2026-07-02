import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { buildAliasMap, restoreNamesInObject } from "../_shared/idAlias.ts";
import { luxBandLabel } from "../_shared/luxBand.ts";

const FN = "optimise-area-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------------------
// Response schema — enforced by Gemini JSON mode
// ---------------------------------------------------------------------------
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scenario: {
            type: "string",
            enum: ["fragmentation", "redundant", "two-tier", "pileup", "frequency-change", "new-blueprint", "retire"],
          },
          category: {
            type: "string",
            enum: ["Watering", "Harvesting", "Pruning", "Maintenance", "Planting"],
          },
          reasoning:    { type: "string" },
          displayText:  { type: "string" },
          before: {
            type: "array",
            items: {
              type: "object",
              properties: {
                blueprintId:   { type: "string" },
                title:         { type: "string" },
                frequencyDays: { type: "number" },
                plantNames:    { type: "array", items: { type: "string" } },
              },
              required: ["blueprintId", "title", "frequencyDays", "plantNames"],
            },
          },
          after: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title:               { type: "string" },
                frequencyDays:       { type: "number" },
                plantNames:          { type: "array", items: { type: "string" } },
                isNew:               { type: "boolean" },
                retainedBlueprintId: { type: "string" },
              },
              required: ["title", "frequencyDays", "plantNames", "isNew"],
            },
          },
          blueprintsToArchive:             { type: "array", items: { type: "string" } },
          plantInstanceIdsForNewBlueprint: { type: "array", items: { type: "string" } },
          newBlueprintTitle:               { type: "string" },
          newBlueprintFrequencyDays:       { type: "number" },
          newBlueprintDescription:         { type: "string" },
          frequencyChanges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                blueprintId:      { type: "string" },
                newFrequencyDays: { type: "number" },
              },
              required: ["blueprintId", "newFrequencyDays"],
            },
          },
        },
        required: [
          "scenario", "category", "reasoning", "displayText",
          "before", "after", "blueprintsToArchive",
          "plantInstanceIdsForNewBlueprint", "newBlueprintTitle",
          "newBlueprintFrequencyDays", "newBlueprintDescription",
        ],
      },
    },
  },
  required: ["proposals"],
};

// ---------------------------------------------------------------------------
// Validation — strip proposals referencing IDs not in context
// ---------------------------------------------------------------------------
function validateProposals(
  raw: any[],
  validBlueprintIds: Set<string>,
  validInstanceIds: Set<string>,
  areaId: string,
): any[] {
  return raw.filter((p) => {
    if (!["fragmentation","redundant","two-tier","pileup","frequency-change","new-blueprint","retire"].includes(p.scenario)) return false;
    if (!["Watering","Harvesting","Pruning","Maintenance","Planting"].includes(p.category)) return false;
    if (p.newBlueprintFrequencyDays <= 0 || p.newBlueprintFrequencyDays > 365) return false;

    for (const id of (p.blueprintsToArchive ?? [])) {
      if (!validBlueprintIds.has(id)) { warn(FN, "hallucinated_archive_id", { id }); return false; }
    }
    for (const fc of (p.frequencyChanges ?? [])) {
      if (!validBlueprintIds.has(fc.blueprintId)) { warn(FN, "hallucinated_freq_id", { id: fc.blueprintId }); return false; }
      if (fc.newFrequencyDays <= 0 || fc.newFrequencyDays > 365) return false;
    }
    for (const id of (p.plantInstanceIdsForNewBlueprint ?? [])) {
      if (!validInstanceIds.has(id)) { warn(FN, "hallucinated_instance_id", { id }); return false; }
    }
    for (const a of (p.after ?? [])) {
      if (a.retainedBlueprintId && !validBlueprintIds.has(a.retainedBlueprintId)) {
        warn(FN, "hallucinated_retained_id", { id: a.retainedBlueprintId }); return false;
      }
    }
    // frequency-change must not also archive
    if (p.scenario === "frequency-change" && p.blueprintsToArchive?.length > 0) return false;

    return true;
  }).map((p, i) => ({
    ...p,
    id: `ai-${p.scenario}-${p.category}-${areaId}-${i}`,
    areaId,
    source: "ai",
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    const db = createClient(supabaseUrl, serviceKey);

    // Auth
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const { homeId, areaId, regenerateReason, previousNegativeFeedback } = await req.json() as {
      homeId: string;
      areaId: string;
      regenerateReason?: string;
      previousNegativeFeedback?: { proposalId: string; displayText: string; reasoning: string }[];
    };

    if (!homeId || !areaId) return json({ error: "homeId and areaId are required" }, 400);

    const membershipRes = await requireHomeMembership(db, homeId, userId);
    if (membershipRes) return membershipRes;

    const aiGuardRes = await guardAiByHome(db, homeId);
    if (aiGuardRes) return aiGuardRes;

    const rateLimitRes = await enforceRateLimit(db, userId, FN);
    if (rateLimitRes) return rateLimitRes;

    // -----------------------------------------------------------------------
    // Fetch context in parallel
    // -----------------------------------------------------------------------
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];
    const sevenDaysAgo  = new Date(Date.now() -  7 * 86_400_000).toISOString();

    const [
      { data: blueprints },
      { data: inventoryItems },
      { data: taskHistory },
      { data: ailments },
      { data: areaRow },
      { data: homeRow },
      { data: weatherAlerts },
    ] = await Promise.all([
      db.from("task_blueprints")
        .select("id, title, task_type, frequency_days, start_date, inventory_item_ids, area_id")
        .eq("home_id", homeId)
        .eq("is_recurring", true)
        .eq("is_archived", false),

      db.from("inventory_items")
        .select("id, plant_name, planted_at, area_id")
        .eq("home_id", homeId)
        .eq("area_id", areaId),

      db.from("tasks")
        .select("blueprint_id, status, due_date")
        .eq("home_id", homeId)
        .gte("due_date", thirtyDaysAgo)
        .not("blueprint_id", "is", null),

      db.from("ailments")
        .select("id, name, type, plant_instance_ailments(plant_instance_id)")
        .eq("home_id", homeId)
        .eq("is_archived", false),

      // is_outside lives on the parent location; climate_zone on homes.
      db.from("areas")
        .select("id, name, light_intensity_lux, locations(name, is_outside, home_id)")
        .eq("id", areaId)
        .maybeSingle(),

      db.from("homes")
        .select("id, hardiness_zone, climate_zone")
        .eq("id", homeId)
        .maybeSingle(),

      // weather_alerts is LOCATION-scoped (no home_id column) — filter
      // through the locations join.
      db.from("weather_alerts")
        .select("type, severity, locations!inner(home_id)")
        .eq("locations.home_id", homeId)
        .gte("created_at", sevenDaysAgo),
    ]);

    // Area blueprints = those with area_id == areaId OR covering an instance in this area
    const areaInstanceIds = new Set((inventoryItems ?? []).map((i: any) => i.id));
    const areaBlueprintIds = new Set(
      (blueprints ?? [])
        .filter((bp: any) =>
          bp.area_id === areaId ||
          (bp.inventory_item_ids ?? []).some((id: string) => areaInstanceIds.has(id))
        )
        .map((bp: any) => bp.id)
    );
    const areaBlueprints = (blueprints ?? []).filter((bp: any) => areaBlueprintIds.has(bp.id));

    if (areaBlueprints.length === 0 && (inventoryItems ?? []).length === 0) {
      return json({ proposals: [] });
    }

    // Build task history map: blueprintId → { completed, postponed, skipped, overdue }
    const histMap: Record<string, { completed: number; postponed: number; skipped: number; overdue: number }> = {};
    for (const t of (taskHistory ?? []) as any[]) {
      if (!areaBlueprintIds.has(t.blueprint_id)) continue;
      if (!histMap[t.blueprint_id]) histMap[t.blueprint_id] = { completed: 0, postponed: 0, skipped: 0, overdue: 0 };
      if (t.status === "Completed")  histMap[t.blueprint_id].completed++;
      else if (t.status === "Postponed") histMap[t.blueprint_id].postponed++;
      else if (t.status === "Skipped")   histMap[t.blueprint_id].skipped++;
      else if (t.status === "Pending" && t.due_date < today) histMap[t.blueprint_id].overdue++;
    }

    // Ailments linked to plants in this area
    const areaAilments = (ailments ?? []).filter((a: any) =>
      (a.plant_instance_ailments ?? []).some((l: any) => areaInstanceIds.has(l.plant_instance_id))
    );

    // Build inventory name map for blueprint plant label lookup
    const invNameMap: Record<string, string> = {};
    for (const item of (inventoryItems ?? []) as any[]) invNameMap[item.id] = item.plant_name;
    // Also fetch names for items in other areas referenced by blueprints
    const allBpInstanceIds = [...new Set(areaBlueprints.flatMap((bp: any) => bp.inventory_item_ids ?? []))];
    if (allBpInstanceIds.length > 0) {
      const { data: extraItems } = await db
        .from("inventory_items")
        .select("id, plant_name")
        .in("id", allBpInstanceIds);
      for (const item of extraItems ?? []) invNameMap[item.id] = item.plant_name;
    }

    const validBlueprintIds = new Set(areaBlueprints.map((bp: any) => bp.id));
    const validInstanceIds  = areaInstanceIds;

    // -----------------------------------------------------------------------
    // Build prompt
    // -----------------------------------------------------------------------
    const location   = (areaRow as any)?.locations;
    const areaName   = (areaRow as any)?.name ?? "Unknown area";
    const isOutside  = location?.is_outside ? "outdoor" : "indoor";
    const areaSunlight = luxBandLabel((areaRow as any)?.light_intensity_lux);
    const climateZone = (homeRow as any)?.climate_zone ?? "unknown";
    const hardinessZone = (homeRow as any)?.hardiness_zone ?? "unknown";

    // Build alias map so area names never appear in the Gemini prompt.
    // IDs are restored in the response before it leaves this function.
    const areaAliasMap = buildAliasMap([{ id: areaId, name: areaName }]);

    const bpLines = areaBlueprints.map((bp: any) => {
      const plants = (bp.inventory_item_ids ?? []).map((id: string) => invNameMap[id] ?? id).join(", ") || "area-level (all plants)";
      return `  ID: ${bp.id}\n  Title: ${bp.title}\n  Type: ${bp.task_type}\n  Frequency: every ${bp.frequency_days ?? "?"} days\n  Plants covered: ${plants}`;
    }).join("\n\n");

    const histLines = areaBlueprints.map((bp: any) => {
      const h = histMap[bp.id];
      if (!h) return `  ${bp.title} (${bp.id}): (no task history — blueprint may be new)`;
      return `  ${bp.title} (${bp.id}): completed=${h.completed}, postponed=${h.postponed}, skipped=${h.skipped}, overdue=${h.overdue}`;
    }).join("\n");

    const plantLines = (inventoryItems ?? []).map((item: any) =>
      `  ID: ${item.id}  Name: ${item.plant_name}  Planted: ${item.planted_at ?? "unknown"}`
    ).join("\n") || "  (no plants recorded in this area)";

    const ailmentLines = areaAilments.length > 0
      ? areaAilments.map((a: any) => {
          const linkedPlants = (a.plant_instance_ailments ?? [])
            .map((l: any) => invNameMap[l.plant_instance_id] ?? l.plant_instance_id)
            .filter(Boolean).join(", ");
          return `  ${a.type}: ${a.name} — affecting: ${linkedPlants || "unknown"}`;
        }).join("\n")
      : "  None";

    const weatherLines = (weatherAlerts ?? []).length > 0
      ? (weatherAlerts as any[]).map((w) => `  ${w.type} (${w.severity})`).join("\n")
      : "  None";

    let feedbackSection = "";
    if ((previousNegativeFeedback ?? []).length > 0 || regenerateReason) {
      feedbackSection = "\n== PREVIOUS FEEDBACK FROM THIS USER ==\n";
      if ((previousNegativeFeedback ?? []).length > 0) {
        feedbackSection += "You previously analysed this area. The user rejected the following suggestions:\n";
        for (const f of previousNegativeFeedback!) {
          feedbackSection += `  - [rejected] "${f.displayText}"`;
          if (f.reasoning) feedbackSection += ` — your reasoning was: "${f.reasoning}"`;
          feedbackSection += "\n";
        }
      }
      if (regenerateReason) {
        feedbackSection += `User's regenerate reason: "${regenerateReason}"\n`;
      }
      feedbackSection += "Do NOT repeat proposals the user has already rejected. Adjust your analysis accordingly.\n";
    }

    const prompt = `AREA: ${areaId} (${isOutside})${areaSunlight ? `\nSUNLIGHT: ${areaSunlight}` : ""}
LOCATION: climate zone: ${climateZone}
HOME: hardiness zone ${hardinessZone}

== BLUEPRINTS IN THIS AREA ==
${bpLines || "  (no blueprints)"}

== TASK HISTORY (last 30 days) ==
${histLines || "  (no history)"}

== PLANTS IN THIS AREA ==
${plantLines}

== ACTIVE PEST / DISEASE ALERTS ==
${ailmentLines}

== RECENT WEATHER ALERTS (last 7 days) ==
${weatherLines}
${feedbackSection}
== YOUR TASK ==
Propose improvements to the task blueprints for this area. Follow these rules strictly:

ALLOWED task types to optimise: Watering, Harvesting, Pruning.
For Maintenance and Planting blueprints: you may ONLY propose "retire" — never consolidate or frequency-change or create new ones.
Do NOT propose changes to blueprints with no task history — insufficient data to make a recommendation.
Do NOT create a blueprint for a task type that already has an area-level (area_id-based) blueprint in this area.
All blueprintId and plantInstanceId values you output MUST exactly match IDs listed above — do not invent or guess IDs.
Only reference inventory item IDs from the "PLANTS IN THIS AREA" section.
If there is nothing meaningful to optimise, return an empty proposals array.

For each proposal, write a "reasoning" field of 1–2 sentences citing specific data (e.g. "This blueprint was postponed 8 times and completed 0 times in 30 days, suggesting the frequency is too high").

SCENARIO REFERENCE:
- frequency-change: adjust frequency_days of an existing blueprint (use frequencyChanges field; blueprintsToArchive must be empty)
- new-blueprint: create a brand-new blueprint (use newBlueprintTitle, newBlueprintFrequencyDays, plantInstanceIdsForNewBlueprint)
- retire: archive a blueprint that is clearly not working or not being used (blueprintsToArchive = [id], no new blueprint)
- fragmentation: consolidate multiple instance-level blueprints into one area blueprint
- redundant: archive instance-level duplicates that an area blueprint already covers
- two-tier: split mainstream from outlier frequency plants
- pileup: consolidate blueprints all firing on the same day`;

    // -----------------------------------------------------------------------
    // Call Gemini
    // -----------------------------------------------------------------------
    const { text, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      toMessages([prompt]),
      {
        systemPrompt: "You are a garden task optimisation assistant for Rhozly, a plant care app. Your job is to analyse recurring task blueprints and recent task history for one garden area and return improvement proposals as structured JSON. Return ONLY the JSON object — no explanation, no markdown, no preamble.",
        responseSchema: RESPONSE_SCHEMA,
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 2048,
        logContext: { homeId, areaId },
      },
    );

    await logAiUsage(db, { userId, homeId, functionName: FN, action: "optimise_area", usage, contextBlock: prompt, prompt, rawResult: text });

    let parsed: { proposals: any[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      logError(FN, "parse_failed", { text: text.slice(0, 200) });
      return json({ proposals: [] });
    }

    const validated = validateProposals(
      parsed.proposals ?? [],
      validBlueprintIds,
      validInstanceIds,
      areaId,
    );

    // Restore area names in human-readable fields (displayText, reasoning) before
    // the response leaves this function — Gemini saw IDs, client sees names.
    const restoredProposals = restoreNamesInObject(validated, areaAliasMap) as any[];

    log(FN, "complete", { homeId, areaId, proposed: restoredProposals.length, dropped: (parsed.proposals?.length ?? 0) - restoredProposals.length });
    return json({ proposals: restoredProposals });

  } catch (err: any) {
    captureException(err, { function: FN });
    logError(FN, "unhandled", { error: err.message });
    return json({ error: err.message }, 500);
  }
});
