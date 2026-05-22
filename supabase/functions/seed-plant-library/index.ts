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
import { fetchWikipediaThumbnail } from "../_shared/plantLibrarySources.ts";

const FN = "seed-plant-library";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 25;
const MAX_RECENT_HINTS = 50; // names sent to AI as "avoid these"

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

function buildSeedPrompt(batchCount: number, avoid: string[]): string {
  const avoidLines = avoid.length
    ? `\nDO NOT propose any of these already-known plants:\n${avoid.map((n) => `- ${n}`).join("\n")}\n`
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

For each plant, fill the structured fields with the best information you have. Use realistic ranges (e.g. tomatoes 60-80 days to harvest, not "90-90"). Leave fields as null / empty arrays only when you genuinely have no information rather than guessing.

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
  avoid: string[],
): Promise<{ inserted: number; skipped: number; failed: number }> {
  const stats = { inserted: 0, skipped: 0, failed: 0 };

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

    // `select=*` after insert with `ignoreDuplicates: true` returns []
    // when the row already exists, so the inserted-vs-skipped count is
    // derived from the returning rows.
    const { data, error } = await db
      .from("plant_library")
      .insert(row, { count: "exact" })
      .select("id");

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
  deltas: { inserted?: number; skipped?: number; failed?: number; error?: string | null },
) {
  // Read-modify-write the counter columns. Cheap because there's only
  // one writer per run. The heartbeat is touched on every progress
  // update so the admin sweep can tell live runs from dead ones.
  const { data: row } = await db
    .from("plant_library_runs")
    .select("count_inserted, count_skipped, count_failed, error_message")
    .eq("id", runId)
    .maybeSingle();
  if (!row) return;
  const patch: Record<string, unknown> = {
    count_inserted: row.count_inserted + (deltas.inserted ?? 0),
    count_skipped: row.count_skipped + (deltas.skipped ?? 0),
    count_failed: row.count_failed + (deltas.failed ?? 0),
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
    // Pull the most recent N scientific-name keys so we can bias AI
    // away from immediate repeats. The unique index still backstops
    // anything that slips through.
    const { data: recent } = await db
      .from("plant_library")
      .select("scientific_name_key")
      .order("seeded_at", { ascending: false })
      .limit(MAX_RECENT_HINTS);
    const avoid = (recent ?? [])
      .map((r: { scientific_name_key: string | null }) => r.scientific_name_key)
      .filter((k: string | null): k is string => !!k);

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
        await updateRunProgress(db, runId, stats);
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
