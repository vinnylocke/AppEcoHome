// Plant Library seeder.
//
// Triggered by cron (daily 02:00 UTC) AND admin manual runs. Asks Gemini
// to propose N plants of varying families/types, fetches a free
// thumbnail per plant via the existing plant-image-search infra, then
// inserts them into `plant_library` with `valid = null` (verification
// happens in a separate pass via `verify-plant-library`).
//
// Fire-and-forget: HTTP responds with `{ run_id }` after creating the
// run row; the actual seeding continues in the background via
// EdgeRuntime.waitUntil so the caller doesn't hold a long-lived
// connection open.
//
// Dedup is enforced by the `plants_library_sci_key_idx` unique index;
// repeated proposals are silently dropped via `ON CONFLICT DO NOTHING`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { estimateGeminiCostUsd } from "../_shared/geminiCost.ts";
import { fetchWikipediaThumbnail } from "../_shared/plantLibrarySources.ts";

const FN = "seed-plant-library";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 25;
/**
 * Initial number of already-known plants we fetch from the library
 * and feed to the AI as "do NOT propose these". 500 keeps the prompt
 * comfortably small (~25KB) while still covering the obvious common
 * plants the AI would otherwise re-suggest.
 */
const INITIAL_AVOID_FETCH = 500;
/**
 * Hard cap on the avoid list passed to any single batch. The list
 * grows as the run progresses (we append every newly-inserted name
 * so subsequent batches in the same run don't propose duplicates),
 * but we cap it here to keep the prompt size predictable. Once full
 * we drop the OLDEST entries — the most recent additions are what
 * the AI is most likely to repeat.
 */
const MAX_AVOID_LIST_SIZE = 1000;

// Structured-output schema for one seed batch — Gemini returns this verbatim.
const SEED_BATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    plants: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          common_name:         { type: "STRING" },
          scientific_name:     { type: "ARRAY", items: { type: "STRING" } },
          family:              { type: "STRING" },
          plant_type:          { type: "STRING" },
          cycle:               { type: "STRING" },
          care_level:          { type: "STRING" },
          watering:            { type: "STRING" },
          watering_min_days:   { type: "NUMBER" },
          watering_max_days:   { type: "NUMBER" },
          sunlight:            { type: "ARRAY", items: { type: "STRING" } },
          hardiness_min:       { type: "STRING" },
          hardiness_max:       { type: "STRING" },
          growth_rate:         { type: "STRING" },
          growth_habit:        { type: "STRING" },
          maintenance:         { type: "STRING" },
          is_edible:           { type: "BOOLEAN" },
          is_toxic_pets:       { type: "BOOLEAN" },
          is_toxic_humans:     { type: "BOOLEAN" },
          attracts:            { type: "ARRAY", items: { type: "STRING" } },
          description:         { type: "STRING" },
          drought_tolerant:    { type: "BOOLEAN" },
          salt_tolerant:       { type: "BOOLEAN" },
          flowers:             { type: "BOOLEAN" },
          fruits:              { type: "BOOLEAN" },
          indoor:              { type: "BOOLEAN" },
          invasive:            { type: "BOOLEAN" },
          flowering_season:    { type: "ARRAY", items: { type: "STRING" } },
          harvest_season:      { type: "ARRAY", items: { type: "STRING" } },
          propagation:         { type: "ARRAY", items: { type: "STRING" } },
          pest_susceptibility: { type: "ARRAY", items: { type: "STRING" } },
          soil:                { type: "ARRAY", items: { type: "STRING" } },
          soil_ph_min:         { type: "NUMBER" },
          soil_ph_max:         { type: "NUMBER" },
          days_to_harvest_min: { type: "NUMBER" },
          days_to_harvest_max: { type: "NUMBER" },
        },
        required: ["common_name", "scientific_name"],
      },
    },
  },
  required: ["plants"],
};

interface AvoidEntry {
  key: string;          // scientific_name_key
  common_name: string;
}

function buildSeedPrompt(batchCount: number, avoid: AvoidEntry[]): string {
  // Each line gives the AI both anchors so it doesn't propose a
  // common-name-equivalent plant under a slightly different scientific
  // name and still collide with the unique index. Capped at
  // MAX_AVOID_LIST_SIZE entries by the caller.
  const avoidLines = avoid.length
    ? `\nThe knowledge base already contains the plants listed below. DO NOT propose any of these, even under a different spelling or common name:\n${avoid.map((e) => `- ${e.key} — ${e.common_name}`).join("\n")}\n`
    : "";
  return `You are seeding a global plant knowledge base.

Propose ${batchCount} plants for a single seed batch. PRIORITISE variety in TWO dimensions:

1. **Plant types** — mix vegetables, herbs, fruits, flowers, trees, shrubs, indoor plants, climbers, succulents, and grasses across different families.
2. **Species AND cultivars** — include BOTH species-level entries (e.g. "Lavender", "Tomato", "Rose") AND well-known commercial cultivars/varieties of popular species. App users want to find data on the specific variety they actually grow, so rows like "Tomato 'Sungold'", "Lavender 'Hidcote'", "Rose 'Peace'", "Basil 'Genovese'", and "Apple 'Cox's Orange Pippin'" are valuable. Roughly 40-60% of each batch should be named cultivars/varieties of popular species — the rest species-level.

Cultivar naming rules:
- \`common_name\` includes the variety: e.g. "Tomato 'Sungold'", "Lavender 'Hidcote'".
- \`scientific_name[0]\` uses the full cultivar form: "Solanum lycopersicum 'Sungold'", "Lavandula angustifolia 'Hidcote'".
- Only include cultivars that are widely commercially available and well-documented. Skip obscure or unverifiable cultivars — quality matters more than count.
- Care info for a cultivar should reflect its actual differences from the parent species (size, flavour, hardiness, days-to-harvest) where you know them; otherwise inherit from the species. Don't invent differences you're not confident about.

CRITICAL — variety types vs base species:
When the common name represents a distinct horticultural TYPE that shares a base species name with another type (cherry tomato vs garden tomato, plum tomato vs beefsteak tomato, sweet pepper vs hot pepper, etc), you MUST include a botanical variety / form qualifier in \`scientific_name[0]\` so each type has a unique scientific name. Examples:
- "Tomato" → "Solanum lycopersicum"
- "Cherry Tomato" → "Solanum lycopersicum var. cerasiforme"
- "Plum Tomato" → "Solanum lycopersicum var. pyriforme"
- "Beefsteak Tomato" → "Solanum lycopersicum var. beefsteak"
- "Sweet Pepper" → "Capsicum annuum var. grossum"
- "Hot Pepper" → "Capsicum annuum var. annuum"
Without this qualifier, distinct horticultural types collide on the same scientific name and the second one is silently dropped. The qualifier doesn't have to be a formally-published botanical name — \`var. <descriptor>\` is acceptable to disambiguate so long as it reflects the type.

POPULATE EVERY APPLICABLE FIELD. The database does NOT inherit values between rows — every row must stand alone. Empty arrays / null values are only acceptable when the field is genuinely irrelevant to the plant:

- Skip \`harvest_season\` / \`days_to_harvest_*\` / \`fruits\` / \`cuisine\` ONLY for ornamentals with no edible parts.
- Skip \`flowering_season\` / \`flowers\` / \`attracts\` ONLY for non-flowering plants (ferns, most succulents, conifers).
- Skip \`pruning_month\` / \`pruning_count\` ONLY for plants that genuinely don't need pruning (most annual vegetables).

All other fields MUST be populated. EVERY row needs:
- cycle, plant_type, family, care_level
- watering (frequent/average/minimum), watering_min_days, watering_max_days
- sunlight (at least one of: full sun, part sun, part shade, full shade)
- hardiness_min, hardiness_max (USDA zone numbers as strings)
- growth_rate, growth_habit, maintenance
- soil (at least one), soil_ph_min, soil_ph_max
- propagation (every plant has propagation methods — seed at minimum)
- description (2-3 sentences in your own words)
- is_edible, is_toxic_pets, is_toxic_humans (decisive booleans)
- drought_tolerant, salt_tolerant, indoor, invasive (decisive booleans)

For varieties/cultivars: REPEAT the parent species' values explicitly. A "Tomato 'Sungold'" row needs its own watering / sunlight / propagation values even if they match the base Tomato row. Don't say "inherits from parent" — copy the values.

Use realistic ranges (e.g. tomatoes 60-80 days to harvest, not "90-90"). Don't invent specifics you aren't confident about, but don't skip whole fields either — pick the most likely value.

PREFERRED VALUES for constrained fields. Use ONE of these where applicable; if none fit, pick the closest sensible descriptor in the same form (e.g. "Bromeliad" for plant_type is OK if Herb / Succulent etc don't apply):
- plant_type: Shrub, Tree, Flower, Vegetable, Houseplant, Herb, Succulent, Climber, Grass, Fern, Cactus, Bulb, Vine, Groundcover, Aquatic
- cycle: Perennial, Annual, Biennial, Herbaceous Perennial
- watering: frequent, average, minimum
- care_level: low, medium, high
- growth_rate: slow, moderate, fast
- maintenance: low, moderate, high

Write the \`description\` in your own words — a 2-3 sentence horticultural summary. Do not copy from Wikipedia or any other source.

Be especially careful with safety fields: \`is_toxic_pets\` and \`is_toxic_humans\` should ONLY be true when you are confident the plant is toxic. False positives on toxicity damage the user's trust.
${avoidLines}
Return JSON matching the schema. No prose, no markdown, just the JSON.`;
}

interface SeedRow {
  common_name?: string | null;
  scientific_name?: string[] | null;
  family?: string | null;
  plant_type?: string | null;
  cycle?: string | null;
  care_level?: string | null;
  watering?: string | null;
  watering_min_days?: number | null;
  watering_max_days?: number | null;
  sunlight?: string[] | null;
  hardiness_min?: string | null;
  hardiness_max?: string | null;
  growth_rate?: string | null;
  growth_habit?: string | null;
  maintenance?: string | null;
  is_edible?: boolean | null;
  is_toxic_pets?: boolean | null;
  is_toxic_humans?: boolean | null;
  attracts?: string[] | null;
  description?: string | null;
  drought_tolerant?: boolean | null;
  salt_tolerant?: boolean | null;
  flowers?: boolean | null;
  fruits?: boolean | null;
  indoor?: boolean | null;
  invasive?: boolean | null;
  flowering_season?: string[] | null;
  harvest_season?: string[] | null;
  propagation?: string[] | null;
  pest_susceptibility?: string[] | null;
  soil?: string[] | null;
  soil_ph_min?: number | null;
  soil_ph_max?: number | null;
  days_to_harvest_min?: number | null;
  days_to_harvest_max?: number | null;
}

async function fetchThumbnail(db: any, query: string): Promise<string | null> {
  if (!query?.trim()) return null;

  // Primary — plant-image-search. Uses the shared plant_image_cache so
  // seed runs warm the cache for organic search traffic; returns a
  // Wikipedia / Pixabay / Unsplash thumbnail depending on which
  // providers have keys configured.
  try {
    const { data, error } = await db.functions.invoke("plant-image-search", {
      body: { query, count: 1 },
    });
    if (!error) {
      const thumb = (data?.images?.[0]?.thumb_url as string | undefined) ?? null;
      if (thumb) return thumb;
    }
  } catch {
    // Fall through to the Wikipedia-only path.
  }

  // Fallback — direct Wikipedia summary lookup. Free, no auth, no
  // shared cache writes (the function call would have done that
  // already if it could). Always tried so seed runs get a thumbnail
  // even when plant-image-search fails entirely.
  try {
    const wiki = await fetchWikipediaThumbnail(query);
    return wiki?.url ?? null;
  } catch {
    return null;
  }
}

async function runSeedBatch(
  db: any,
  apiKey: string,
  runId: string,
  batchCount: number,
  avoid: AvoidEntry[],
): Promise<{
  inserted: number;
  skipped: number;
  failed: number;
  /** Newly-inserted entries — appended to the running avoid list so
   *  the next batch in the same run doesn't re-propose them. */
  insertedEntries: AvoidEntry[];
  /** Gemini token usage for this batch — accumulated on the run row. */
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  costUsd: number;
}> {
  const stats = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    insertedEntries: [] as AvoidEntry[],
    promptTokens: 0,
    candidatesTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };

  const { text, usage } = await callGeminiCascade(
    apiKey,
    FN,
    toMessages([buildSeedPrompt(batchCount, avoid)]),
    {
      temperature: 0.9,
      maxOutputTokens: 8192,
      responseSchema: SEED_BATCH_SCHEMA,
      responseMimeType: "application/json",
      // Bumped from the default 2 because Gemini Flash overload
      // events have spiked recently — give every model an extra
      // attempt before the cascade gives up. 4 models × 3 retries =
      // 12 total attempts before we throw the batch.
      maxRetriesPerModel: 3,
      logContext: { run_id: runId, batch_count: batchCount },
    },
  );

  // Record AI usage for this batch — sums onto the run's totals later.
  stats.promptTokens = usage.promptTokenCount ?? 0;
  stats.candidatesTokens = usage.candidatesTokenCount ?? 0;
  stats.totalTokens = usage.totalTokenCount ?? 0;
  stats.costUsd = estimateGeminiCostUsd(
    usage.model,
    stats.promptTokens,
    stats.candidatesTokens,
  );

  let parsed: { plants: SeedRow[] };
  try {
    parsed = JSON.parse(text) as { plants: SeedRow[] };
  } catch (err) {
    logError(FN, "parse_failed", { run_id: runId, error: (err as Error).message });
    stats.failed += batchCount;
    return stats;
  }

  const plants = Array.isArray(parsed.plants) ? parsed.plants : [];
  log(FN, "batch_received", { run_id: runId, ai_returned: plants.length, model: usage.model });

  // Pull thumbnails in parallel — plant-image-search has its own DB
  // cache so repeats of the same name are ~50ms each.
  const thumbnails = await Promise.all(
    plants.map((p) =>
      fetchThumbnail(db, p.scientific_name?.[0] ?? p.common_name ?? ""),
    ),
  );

  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    if (!p.common_name?.trim()) {
      stats.failed += 1;
      continue;
    }

    const row = {
      common_name:         p.common_name.trim(),
      scientific_name:     Array.isArray(p.scientific_name) ? p.scientific_name : [],
      family:              p.family ?? null,
      plant_type:          p.plant_type ?? null,
      cycle:               p.cycle ?? null,
      care_level:          p.care_level ?? null,
      watering:            p.watering ?? null,
      watering_min_days:   p.watering_min_days ?? null,
      watering_max_days:   p.watering_max_days ?? null,
      sunlight:            Array.isArray(p.sunlight) ? p.sunlight : [],
      hardiness_min:       p.hardiness_min ?? null,
      hardiness_max:       p.hardiness_max ?? null,
      growth_rate:         p.growth_rate ?? null,
      growth_habit:        p.growth_habit ?? null,
      maintenance:         p.maintenance ?? null,
      is_edible:           !!p.is_edible,
      is_toxic_pets:       !!p.is_toxic_pets,
      is_toxic_humans:     !!p.is_toxic_humans,
      attracts:            Array.isArray(p.attracts) ? p.attracts : [],
      description:         p.description ?? null,
      drought_tolerant:    !!p.drought_tolerant,
      salt_tolerant:       !!p.salt_tolerant,
      flowers:             !!p.flowers,
      fruits:              !!p.fruits,
      indoor:              !!p.indoor,
      invasive:            !!p.invasive,
      flowering_season:    Array.isArray(p.flowering_season) ? p.flowering_season : [],
      harvest_season:      Array.isArray(p.harvest_season) ? p.harvest_season : [],
      propagation:         Array.isArray(p.propagation) ? p.propagation : [],
      pest_susceptibility: Array.isArray(p.pest_susceptibility) ? p.pest_susceptibility : [],
      soil:                Array.isArray(p.soil) ? p.soil : [],
      soil_ph_min:         p.soil_ph_min ?? null,
      soil_ph_max:         p.soil_ph_max ?? null,
      days_to_harvest_min: p.days_to_harvest_min ?? null,
      days_to_harvest_max: p.days_to_harvest_max ?? null,
      thumbnail_url:       thumbnails[i],
      image_url:           thumbnails[i],
      seeded_by_run_id:    runId,
      valid:               null as boolean | null,
    };

    // Return the generated scientific_name_key so the running avoid
    // list can grow with the row we just inserted — the next batch in
    // this run gets to see it.
    const { data, error } = await db
      .from("plant_library")
      .insert(row, { count: "exact" })
      .select("id, scientific_name_key, common_name");

    if (error) {
      // Unique-violation = silent skip. Anything else = real failure.
      if (error.code === "23505") {
        stats.skipped += 1;
      } else {
        stats.failed += 1;
        logError(FN, "insert_failed", {
          run_id: runId,
          common_name: row.common_name,
          error: error.message,
        });
      }
    } else if (data && data.length > 0) {
      stats.inserted += 1;
      const inserted = data[0] as { scientific_name_key: string | null; common_name: string };
      if (inserted.scientific_name_key) {
        stats.insertedEntries.push({
          key: inserted.scientific_name_key,
          common_name: inserted.common_name,
        });
      }
    } else {
      // Defensive — empty data without error usually means a constraint
      // dropped it. Count as skipped.
      stats.skipped += 1;
    }
  }

  return stats;
}

async function updateRunProgress(
  db: any,
  runId: string,
  deltas: {
    inserted?: number;
    skipped?: number;
    failed?: number;
    error?: string | null;
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  },
) {
  // Read-modify-write the counter columns. Cheap because there's only
  // one writer per run. The heartbeat is touched on every progress
  // update so the admin sweep can tell live runs from dead ones.
  const { data: row } = await db
    .from("plant_library_runs")
    .select(
      "count_inserted, count_skipped, count_failed, error_message, total_prompt_tokens, total_candidates_tokens, total_tokens, total_cost_usd",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!row) return;
  const patch: Record<string, unknown> = {
    count_inserted: row.count_inserted + (deltas.inserted ?? 0),
    count_skipped: row.count_skipped + (deltas.skipped ?? 0),
    count_failed: row.count_failed + (deltas.failed ?? 0),
    total_prompt_tokens: row.total_prompt_tokens + (deltas.promptTokens ?? 0),
    total_candidates_tokens:
      row.total_candidates_tokens + (deltas.candidatesTokens ?? 0),
    total_tokens: row.total_tokens + (deltas.totalTokens ?? 0),
    total_cost_usd:
      Number(row.total_cost_usd ?? 0) + (deltas.costUsd ?? 0),
    last_heartbeat_at: new Date().toISOString(),
  };
  // Preserve the first batch error we see so the admin can read it
  // off the run row. Fatal failures still overwrite this via the
  // outer catch in `backgroundSeed`.
  if (deltas.error && !row.error_message) {
    patch.error_message = deltas.error.slice(0, 2000);
  }
  await db
    .from("plant_library_runs")
    .update(patch)
    .eq("id", runId);
}

async function backgroundSeed(
  db: any,
  apiKey: string,
  runId: string,
  count: number,
) {
  try {
    // Pull the most recent N already-known plants and feed them to
    // the AI as "do NOT propose these". Both the scientific key
    // (drives dedup at the DB level) and common name go in so the AI
    // doesn't suggest a colliding entry under a slightly different
    // form. The unique index still backstops anything that slips
    // through; this is purely about avoiding wasted AI calls.
    const { data: recent } = await db
      .from("plant_library")
      .select("scientific_name_key, common_name")
      .order("seeded_at", { ascending: false })
      .limit(INITIAL_AVOID_FETCH);
    let avoid: AvoidEntry[] = (recent ?? [])
      .map(
        (r: { scientific_name_key: string | null; common_name: string }) => ({
          key: r.scientific_name_key,
          common_name: r.common_name,
        }),
      )
      .filter((e: { key: string | null }): e is AvoidEntry => !!e.key);

    // Stamp a heartbeat immediately so the admin sweep can't
    // false-positive a run that's just starting.
    await db
      .from("plant_library_runs")
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq("id", runId);

    let remaining = count;
    while (remaining > 0) {
      const batch = Math.min(remaining, BATCH_SIZE);
      try {
        const stats = await runSeedBatch(db, apiKey, runId, batch, avoid);
        await updateRunProgress(db, runId, {
          inserted: stats.inserted,
          skipped: stats.skipped,
          failed: stats.failed,
          promptTokens: stats.promptTokens,
          candidatesTokens: stats.candidatesTokens,
          totalTokens: stats.totalTokens,
          costUsd: stats.costUsd,
        });
        // Append newly-inserted entries to the running avoid list so
        // the next batch in THIS run can see them too. Without this,
        // batches 2-N would re-propose plants batch 1 just inserted.
        // Cap the list size so the prompt doesn't balloon on long runs.
        if (stats.insertedEntries.length > 0) {
          avoid = [...stats.insertedEntries, ...avoid].slice(0, MAX_AVOID_LIST_SIZE);
        }
        remaining -= batch;
      } catch (err) {
        const reason = (err as Error).message ?? "unknown";
        logError(FN, "batch_failed", { run_id: runId, error: reason });
        // Cascade exhausted (e.g. Gemini overload, all 12 attempts
        // failed) → mark the whole batch as failed and remember the
        // first error so the admin can see WHY. Subsequent batches
        // still run.
        await updateRunProgress(db, runId, { failed: batch, error: reason });
        remaining -= batch;
      }
    }

    // Reflect partial failures in the final status: if any batch
    // failed, the run is `partial` (some plants in, some not) or
    // `failed` (every batch failed — typically all Gemini quota gone).
    const { data: final } = await db
      .from("plant_library_runs")
      .select("count_inserted, count_failed")
      .eq("id", runId)
      .maybeSingle();
    const inserted = final?.count_inserted ?? 0;
    const failed = final?.count_failed ?? 0;
    const finalStatus =
      failed > 0 && inserted === 0
        ? "failed"
        : failed > 0
        ? "partial"
        : "succeeded";

    await db
      .from("plant_library_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("id", runId);
    log(FN, "run_finished", { run_id: runId, status: finalStatus, inserted, failed });
  } catch (err: any) {
    await captureException(FN, err);
    await db
      .from("plant_library_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: err?.message ?? "unknown",
      })
      .eq("id", runId);
    logError(FN, "run_failed", { run_id: runId, error: err?.message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !apiKey) {
      throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY env vars.");
    }
    const db = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const rawCount = typeof body.count === "number" ? body.count : 0;
    const count = Math.max(1, Math.min(5000, Math.floor(rawCount)));
    const triggeredBy = typeof body.triggered_by === "string" ? body.triggered_by : null;

    const { data: run, error: runError } = await db
      .from("plant_library_runs")
      .insert({
        kind: "seed",
        triggered_by: triggeredBy,
        count_requested: count,
      })
      .select("id")
      .single();
    if (runError || !run) throw runError ?? new Error("Failed to create run row");

    log(FN, "started", { run_id: run.id, count, triggered_by: triggeredBy });

    // Fire-and-forget — release the connection immediately and let the
    // batches run in the background.
    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil(backgroundSeed(db, apiKey, run.id, count));

    return new Response(JSON.stringify({ run_id: run.id }), {
      status: 202,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "fatal", { error: err?.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err?.message ?? "unknown" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
