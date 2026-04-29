import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn } from "../_shared/logger.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { buildMessage } from "../_shared/templates.ts";

const FN = "pattern-evaluate";

// Max hits to process per run — prevents timeouts on large backlogs.
const BATCH_LIMIT = 80;

const SYSTEM_PROMPT = `You are a plant care assistant evaluating detected behavioural patterns to decide whether they warrant surfacing an insight to the user.

Return JSON with exactly these fields:
{
  "isSignificant": true or false,
  "reason": "brief one-sentence explanation of your decision",
  "vars": {
    "plant_name": "the plant display name",
    "count": integer,   // consecutive_postponements only: number of consecutive postponements
    "days": integer,    // neglected_plant only: days since last care event
    "rate": integer     // high_postpone_rate only: postpone percentage e.g. 67
  }
}

Only include the vars fields relevant to the pattern.

Be conservative — only mark isSignificant=true when the pattern represents a genuine concern:
- Consider the plant's watering frequency (a weekly plant postponed twice is fine; five times is not)
- Consider the season given the user's location (plants naturally need less attention in winter)
- Consider how recently the plant was added (a new plant in the first two weeks may have no events yet)
- Avoid surfacing the same concern repeatedly — if events show recent activity after the pattern, it may already be resolved`;

serve(async (_req) => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    // Fetch unevaluated hits, oldest first so backlog clears in order
    const { data: hits, error: hitsErr } = await db
      .from("user_pattern_hits")
      .select("id, user_id, pattern_id, inventory_item_id, raw_data, created_at")
      .eq("evaluated", false)
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (hitsErr) throw hitsErr;

    if (!hits || hits.length === 0) {
      log(FN, "no_hits", {});
      return new Response(
        JSON.stringify({ evaluated: 0, insights: 0, errors: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Pre-fetch supporting data in parallel ---

    const userIds = [...new Set(hits.map((h: any) => h.user_id as string))];
    const itemIds = [...new Set(
      hits.map((h: any) => h.inventory_item_id).filter(Boolean) as string[],
    )];

    const [
      { data: members },
      { data: itemRows },
    ] = await Promise.all([
      db.from("home_members").select("user_id, home_id").in("user_id", userIds),
      itemIds.length
        ? db.from("inventory_items")
            .select("id, plant_name, nickname, area_name, planted_at, species_id")
            .in("id", itemIds)
        : Promise.resolve({ data: [] }),
    ]);

    const homeIds = [...new Set((members ?? []).map((m: any) => m.home_id as string))];
    const speciesIds = [...new Set(
      (itemRows ?? []).map((i: any) => i.species_id).filter(Boolean) as number[],
    )];

    const [{ data: homeRows }, { data: speciesRows }] = await Promise.all([
      homeIds.length
        ? db.from("homes").select("id, address, lat, lng").in("id", homeIds)
        : Promise.resolve({ data: [] }),
      speciesIds.length
        ? db.from("plants").select("id, watering, care_level, cycle").in("id", speciesIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Build lookup maps
    const userHomeMap = new Map<string, { address: string | null; lat: number | null; lng: number | null }>();
    for (const m of members ?? []) {
      if (!userHomeMap.has(m.user_id)) {
        const home = (homeRows ?? []).find((h: any) => h.id === m.home_id);
        if (home) userHomeMap.set(m.user_id, { address: home.address, lat: home.lat, lng: home.lng });
      }
    }

    const itemMap = new Map<string, any>();
    for (const item of itemRows ?? []) itemMap.set(item.id, item);

    const speciesMap = new Map<number, any>();
    for (const s of speciesRows ?? []) speciesMap.set(s.id, s);

    const today = new Date().toISOString().split("T")[0];
    let evaluated = 0;
    let insights = 0;
    let errors = 0;

    for (const hit of hits as any[]) {
      try {
        // Skip hits with no item (item was deleted) — just mark evaluated
        if (!hit.inventory_item_id) {
          await db.from("user_pattern_hits").update({ evaluated: true }).eq("id", hit.id);
          evaluated++;
          continue;
        }

        // Skip if an undismissed insight already exists for this pattern+item
        const { count: existing } = await db
          .from("user_insights")
          .select("id", { count: "exact", head: true })
          .eq("user_id", hit.user_id)
          .eq("pattern_id", hit.pattern_id)
          .eq("inventory_item_id", hit.inventory_item_id)
          .is("dismissed_at", null);

        if ((existing ?? 0) > 0) {
          await db.from("user_pattern_hits").update({ evaluated: true }).eq("id", hit.id);
          evaluated++;
          continue;
        }

        const item = itemMap.get(hit.inventory_item_id);
        const homeInfo = userHomeMap.get(hit.user_id);
        const species = item?.species_id != null ? speciesMap.get(item.species_id) : null;
        const plantName = item?.nickname ?? item?.plant_name ?? "Unknown plant";

        // Fetch last 20 events for this item
        const { data: recentEvents } = await db
          .from("user_events")
          .select("event_type, created_at")
          .eq("user_id", hit.user_id)
          .contains("meta", { inventory_item_ids: [hit.inventory_item_id] })
          .order("created_at", { ascending: false })
          .limit(20);

        const eventLines = (recentEvents ?? [])
          .map((e: any) => `${new Date(e.created_at).toISOString().split("T")[0]}: ${e.event_type}`)
          .join("\n");

        const userMessage = [
          `Today's date: ${today}`,
          homeInfo?.address ? `Location: ${homeInfo.address}` : null,
          homeInfo?.lat != null
            ? `Coordinates: lat ${homeInfo.lat.toFixed(2)}, lng ${(homeInfo.lng ?? 0).toFixed(2)}`
            : null,
          "",
          `Plant: ${plantName}`,
          item?.area_name ? `Area: ${item.area_name}` : null,
          item?.planted_at
            ? `Planted: ${new Date(item.planted_at).toISOString().split("T")[0]}`
            : "Status: In Shed (not yet planted)",
          species?.watering ? `Watering frequency: ${species.watering}` : null,
          species?.care_level ? `Care level: ${species.care_level}` : null,
          species?.cycle ? `Plant cycle: ${species.cycle}` : null,
          "",
          `Pattern: ${hit.pattern_id}`,
          `Pattern data: ${JSON.stringify(hit.raw_data)}`,
          "",
          recentEvents?.length
            ? `Recent events for this plant (newest first):\n${eventLines}`
            : "No recorded events for this plant yet.",
        ].filter((l) => l !== null).join("\n");

        const rawText = await callGeminiCascade(
          apiKey,
          FN,
          toMessages([userMessage]),
          {
            systemPrompt: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 512,
            logContext: {
              userId: hit.user_id,
              patternId: hit.pattern_id,
              itemId: hit.inventory_item_id,
            },
          },
        );

        const result = JSON.parse(rawText);

        if (result.isSignificant) {
          const insightText = buildMessage(hit.pattern_id, {
            plant_name: plantName,
            ...(result.vars ?? {}),
          });

          await db.from("user_insights").insert({
            user_id: hit.user_id,
            pattern_id: hit.pattern_id,
            inventory_item_id: hit.inventory_item_id,
            is_significant: true,
            insight_text: insightText,
            ai_meta: result,
          });
          insights++;
        }

        await db.from("user_pattern_hits").update({ evaluated: true }).eq("id", hit.id);
        evaluated++;
      } catch (err: any) {
        errors++;
        warn(FN, "hit_error", {
          hitId: hit.id,
          patternId: hit.pattern_id,
          error: String(err),
        });
        // Leave evaluated=false so the hit retries on the next run
      }
    }

    log(FN, "evaluate_complete", { evaluated, insights, errors });

    return new Response(
      JSON.stringify({ evaluated, insights, errors }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
