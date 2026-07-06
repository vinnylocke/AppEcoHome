/**
 * Per-turn grounding context for the agent.
 *
 * Builds a compact "what the user has" summary fed into the system
 * prompt so Gemini can pick the right IDs without making things up.
 * Cached in-memory for 5 minutes per (user, home) so the same chat
 * conversation doesn't re-fetch context on every message.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildUserContext, renderContextBlock } from "../_shared/userContext.ts";
import { AGENT_RULES } from "./rules.ts";

interface CachedContext {
  prompt: string;
  timezone: string | null;
  builtAt: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CachedContext>();

const cacheKey = (userId: string, homeId: string) => `${userId}|${homeId}`;

export interface HomeContext {
  homeName: string;
  tier: "sprout" | "botanist" | "sage" | "evergreen";
  /** IANA timezone (e.g. 'Europe/London') from homes.timezone, or null if unset. */
  timezone: string | null;
  /** The system-prompt-ready string describing the user's setup.
   *  Does NOT include today's date — that's injected per-turn in index.ts
   *  so a long-running chat can't span midnight with a stale date. */
  prompt: string;
}

export async function buildHomeContext(
  db: SupabaseClient,
  userId: string,
  homeId: string,
): Promise<HomeContext> {
  const cached = cache.get(cacheKey(userId, homeId));
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    // Pull tier from profile — fast lookup, not cached because it can change.
    const { data: profile } = await db
      .from("user_profiles")
      .select("subscription_tier, display_name")
      .eq("uid", userId)
      .maybeSingle();
    return {
      homeName: extractHomeName(cached.prompt),
      tier: (profile?.subscription_tier ?? "sprout") as HomeContext["tier"],
      timezone: cached.timezone,
      prompt: cached.prompt,
    };
  }

  // areas links via location_id → locations.home_id (no home_id column).
  // Fetch location ids first, then areas filtered by those ids.
  const { data: locationsFirst } = await db
    .from("locations")
    .select("id, name, is_outside")
    .eq("home_id", homeId);
  const locationIds = (locationsFirst ?? []).map((l: any) => l.id);

  const [
    { data: home },
    { data: profile },
    { data: areas },
    { data: plants },
    { data: blueprints },
    { data: plans },
    { data: insights },
  ] = await Promise.all([
    db.from("homes").select("name, timezone").eq("id", homeId).maybeSingle(),
    db.from("user_profiles").select("subscription_tier, display_name").eq("uid", userId).maybeSingle(),
    locationIds.length > 0
      ? db.from("areas").select("id, name, location_id").in("location_id", locationIds)
      : Promise.resolve({ data: [] as any[] }),
    db
      .from("inventory_items")
      .select("id, plant_name, identifier, area_name, status")
      .eq("home_id", homeId)
      .is("ended_at", null)
      .limit(30),
    db
      .from("task_blueprints")
      .select("id, title, task_type, frequency_days, area_id")
      .eq("home_id", homeId)
      .eq("is_recurring", true)
      .eq("is_archived", false)
      .limit(20),
    db
      .from("plans")
      .select("id, name, status")
      .eq("home_id", homeId)
      .in("status", ["draft", "in_progress"])
      .limit(10),
    // Pattern-engine findings (e.g. "high postpone rate", "neglected plant") so
    // the assistant can reference detected patterns proactively.
    db
      .from("user_insights")
      .select("insight_text, created_at")
      .eq("user_id", userId)
      .eq("is_significant", true)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const tier = (profile?.subscription_tier ?? "sprout") as HomeContext["tier"];
  const displayName = profile?.display_name ?? "the gardener";
  const homeName = home?.name ?? "this garden";

  const lines: string[] = [
    `You are Rhozly, a gardening assistant.`,
    `User: ${displayName}.`,
    `Active home: "${homeName}". Tier: ${tier}.`,
    "",
    `STRUCTURE:`,
  ];

  if (locationsFirst && locationsFirst.length > 0) {
    lines.push(`  Locations:`);
    for (const l of locationsFirst) {
      lines.push(`    - ${l.name} (id=${l.id}${l.is_outside ? ", outdoor" : ", indoor"})`);
    }
  } else {
    lines.push(`  Locations: none yet — user hasn't set up the garden structure.`);
  }

  if ((areas ?? []).length > 0) {
    lines.push(`  Areas:`);
    for (const a of areas!) {
      lines.push(`    - ${a.name} (id=${a.id}, location=${a.location_id})`);
    }
  }

  lines.push("");
  lines.push("SHED (top 30 active plant instances):");
  if ((plants ?? []).length > 0) {
    for (const p of plants!) {
      const label = p.identifier || p.plant_name || "Unnamed plant";
      lines.push(`  - ${label} (id=${p.id}, area=${p.area_name ?? "unassigned"}, status=${p.status})`);
    }
  } else {
    lines.push(`  (no active plants yet)`);
  }

  if ((blueprints ?? []).length > 0) {
    lines.push("");
    lines.push("ACTIVE TASK SCHEDULES (top 20):");
    for (const b of blueprints!) {
      lines.push(`  - "${b.title}" (${b.task_type}, every ${b.frequency_days} days, id=${b.id})`);
    }
  }

  if ((plans ?? []).length > 0) {
    lines.push("");
    lines.push("ACTIVE PLANS:");
    for (const p of plans!) {
      lines.push(`  - "${p.name}" (${p.status}, id=${p.id})`);
    }
  }

  if ((insights ?? []).length > 0) {
    lines.push("");
    lines.push("DETECTED PATTERNS (from the gardener's recent behaviour — reference proactively when relevant):");
    for (const ins of insights!) {
      if (ins.insight_text) lines.push(`  - ${ins.insight_text}`);
    }
  }

  lines.push("");
  lines.push("RULES:");
  lines.push(...AGENT_RULES);

  // Enrich with environment (location / climate / season / weather), gardener
  // preferences, and 30-day behaviour so the assistant is seasonal + personal,
  // not just structural. Reuses the tested shared context builder; "garden" +
  // "tasks" are skipped because the STRUCTURE/SHED blocks above already cover them.
  let envBlock = "";
  try {
    const uctx = await buildUserContext(
      db as unknown as Parameters<typeof buildUserContext>[0],
      { userId, homeId, skip: ["garden", "tasks"] },
    );
    envBlock = renderContextBlock(uctx, ["location", "weather", "preferences", "behaviour"]);
  } catch {
    // Non-fatal — the structural context above is enough to function.
  }

  const prompt = envBlock ? `${lines.join("\n")}\n\n${envBlock}` : lines.join("\n");
  const timezone = (home?.timezone as string | null) ?? null;
  cache.set(cacheKey(userId, homeId), { prompt, timezone, builtAt: Date.now() });

  return { homeName, tier, timezone, prompt };
}

function extractHomeName(prompt: string): string {
  const m = prompt.match(/Active home: "([^"]+)"/);
  return m?.[1] ?? "this garden";
}

/** Clear cache for one user + home — call after structural changes. */
export function invalidateContext(userId: string, homeId: string) {
  cache.delete(cacheKey(userId, homeId));
}
