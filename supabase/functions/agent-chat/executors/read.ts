/**
 * Executors for the 13 read tools (Phase 1).
 *
 * Each executor takes a Supabase client (service role), the home/user
 * context, and the tool args, and returns a structured payload that
 * gets rendered by the chat UI's <ToolResultCard>.
 *
 * Tools never write — read-only by Phase 1 scope. RLS doesn't apply
 * since we're on the service role, so each query is scoped manually
 * to `home_id` from the validated session context.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { summariseTree, type ConditionNode } from "../../_shared/conditionTree.ts";

export interface ExecutorContext {
  db: SupabaseClient;
  userId: string;
  homeId: string;
  /** The caller's bearer token — used by tools that invoke other
   *  auth-gated edge functions (e.g. optimise_area_schedule). */
  authToken?: string;
}

type ExecResult = {
  /** Compact shape passed back to the chat UI. */
  payload: unknown;
  /** Human-readable summary for the model to include in its reply. */
  summary: string;
};

const clampLimit = (n: unknown, defLimit = 30, max = 100): number => {
  const x = typeof n === "number" ? n : defLimit;
  return Math.min(Math.max(1, x), max);
};

// ─── list_plants ───────────────────────────────────────────────────────
export async function exec_list_plants(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const limit = clampLimit(args.limit);
  let q = ctx.db
    .from("inventory_items")
    .select("id, plant_name, nickname, identifier, area_id, area_name, location_name, status, growth_state")
    .eq("home_id", ctx.homeId)
    .is("ended_at", null)
    .limit(limit);

  if (args.area_id) q = q.eq("area_id", args.area_id);
  if (args.status)  q = q.eq("status", args.status);
  if (args.search) {
    q = q.or(
      `plant_name.ilike.%${args.search}%,nickname.ilike.%${args.search}%,identifier.ilike.%${args.search}%`,
    );
  }

  const { data, error } = await q;
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} plant${data?.length === 1 ? "" : "s"} in the Shed.`,
  };
}

// ─── list_tasks ────────────────────────────────────────────────────────
export async function exec_list_tasks(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const limit = clampLimit(args.limit, 50, 200);
  const todayIso = new Date().toISOString().split("T")[0];

  let q = ctx.db
    .from("tasks")
    .select("id, title, type, status, due_date, area_id, inventory_item_ids")
    .eq("home_id", ctx.homeId)
    .neq("status", "Skipped")
    .order("due_date", { ascending: true })
    .limit(limit);

  if (args.area_id)  q = q.eq("area_id", args.area_id);
  if (args.status)   q = q.eq("status", args.status);
  if (args.due_from) q = q.gte("due_date", args.due_from);
  if (args.due_to)   q = q.lte("due_date", args.due_to);
  if (args.overdue_only) {
    q = q.lt("due_date", todayIso).eq("status", "Pending");
  }

  const { data, error } = await q;
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} task${data?.length === 1 ? "" : "s"}.`,
  };
}

// ─── list_blueprints ───────────────────────────────────────────────────
export async function exec_list_blueprints(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  let q = ctx.db
    .from("task_blueprints")
    .select("id, title, task_type, frequency_days, start_date, end_date, area_id, is_archived, paused_until")
    .eq("home_id", ctx.homeId)
    .eq("is_recurring", true);

  if (args.area_id) q = q.eq("area_id", args.area_id);
  if (args.type)    q = q.eq("task_type", args.type);
  if (typeof args.is_archived === "boolean") {
    q = q.eq("is_archived", args.is_archived);
  } else {
    q = q.eq("is_archived", false);
  }

  const { data, error } = await q;
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} task schedule${data?.length === 1 ? "" : "s"}.`,
  };
}

// ─── list_locations ────────────────────────────────────────────────────
export async function exec_list_locations(ctx: ExecutorContext): Promise<ExecResult> {
  const { data, error } = await ctx.db
    .from("locations")
    .select("id, name, placement, is_outside")
    .eq("home_id", ctx.homeId)
    .order("name");
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} location${data?.length === 1 ? "" : "s"}.`,
  };
}

// ─── list_areas ────────────────────────────────────────────────────────
// areas has no home_id column — it links via location_id → locations.home_id.
// We fetch the home's location IDs first and filter areas by IN.
export async function exec_list_areas(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  // Resolve home-scoped location ids.
  let locationIds: string[] = [];
  if (args.location_id) {
    // Caller pinned a single location — verify it belongs to this home.
    const { data: loc } = await ctx.db
      .from("locations")
      .select("id")
      .eq("home_id", ctx.homeId)
      .eq("id", args.location_id)
      .maybeSingle();
    locationIds = loc ? [loc.id] : [];
  } else {
    const { data: locs } = await ctx.db
      .from("locations")
      .select("id")
      .eq("home_id", ctx.homeId);
    locationIds = (locs ?? []).map((l: any) => l.id);
  }

  if (locationIds.length === 0) {
    return { payload: [], summary: "No areas — no locations in this home yet." };
  }

  const { data, error } = await ctx.db
    .from("areas")
    .select("id, name, location_id")
    .in("location_id", locationIds)
    .order("name");
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} area${data?.length === 1 ? "" : "s"}.`,
  };
}

// ─── list_ailments ─────────────────────────────────────────────────────
export async function exec_list_ailments(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  let q = ctx.db
    .from("ailments")
    .select("id, name, type, description, is_archived")
    .eq("home_id", ctx.homeId)
    .order("created_at", { ascending: false });
  if (!args.include_archived) q = q.eq("is_archived", false);
  if (args.type) q = q.eq("type", args.type);

  const { data, error } = await q;
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} ailment${data?.length === 1 ? "" : "s"} on the Watchlist.`,
  };
}

// ─── list_shopping_lists ───────────────────────────────────────────────
export async function exec_list_shopping_lists(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  let listQ = ctx.db
    .from("shopping_lists")
    .select("id, name, status, created_at")
    .eq("home_id", ctx.homeId)
    .order("created_at", { ascending: false });
  if (!args.include_completed) listQ = listQ.eq("status", "active");

  const { data: lists, error } = await listQ;
  if (error) throw error;
  if (!lists || lists.length === 0) {
    return { payload: [], summary: "No shopping lists yet." };
  }

  const listIds = lists.map((l) => l.id);
  const { data: items } = await ctx.db
    .from("shopping_list_items")
    .select("id, list_id, item_type, name, quantity, is_checked")
    .in("list_id", listIds);

  const itemsByList: Record<string, any[]> = {};
  for (const it of items ?? []) {
    if (!itemsByList[it.list_id]) itemsByList[it.list_id] = [];
    itemsByList[it.list_id].push(it);
  }

  const payload = lists.map((l) => ({ ...l, items: itemsByList[l.id] ?? [] }));
  return {
    payload,
    summary: `Found ${lists.length} shopping list${lists.length === 1 ? "" : "s"}.`,
  };
}

// ─── list_seed_packets ─────────────────────────────────────────────────
export async function exec_list_seed_packets(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  let q = ctx.db
    .from("seed_packets")
    .select("id, plant_id, variety, sow_by, quantity_remaining, plants(common_name)")
    .eq("home_id", ctx.homeId)
    .order("sow_by", { ascending: true });

  if (args.sown === true) {
    // Sown packets have at least one row in seed_sowings linking to them.
    // Two-pass: list packets with any sowing.
    const { data: sowings } = await ctx.db
      .from("seed_sowings")
      .select("seed_packet_id")
      .eq("home_id", ctx.homeId);
    const sownIds = [...new Set((sowings ?? []).map((s: any) => s.seed_packet_id))];
    if (sownIds.length === 0) return { payload: [], summary: "No sown packets yet." };
    q = q.in("id", sownIds);
  } else if (args.sown === false) {
    const { data: sowings } = await ctx.db
      .from("seed_sowings")
      .select("seed_packet_id")
      .eq("home_id", ctx.homeId);
    const sownIds = [...new Set((sowings ?? []).map((s: any) => s.seed_packet_id))];
    if (sownIds.length > 0) q = q.not("id", "in", `(${sownIds.join(",")})`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} seed packet${data?.length === 1 ? "" : "s"}.`,
  };
}

// ─── list_plans ────────────────────────────────────────────────────────
export async function exec_list_plans(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  let q = ctx.db
    .from("plans")
    .select("id, name, status, created_at")
    .eq("home_id", ctx.homeId)
    .order("created_at", { ascending: false });
  if (args.status) q = q.eq("status", args.status);

  const { data, error } = await q;
  if (error) throw error;
  return {
    payload: data ?? [],
    summary: `Found ${data?.length ?? 0} plan${data?.length === 1 ? "" : "s"}.`,
  };
}

// ─── search_plant_database ─────────────────────────────────────────────
export async function exec_search_plant_database(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const query = String(args.query ?? "").trim();
  if (!query) {
    return { payload: [], summary: "Provide a search term." };
  }
  // Space/punctuation-insensitive query, mirroring the SQL `search_norm`
  // column so "crab apple" matches "crabapple" (and other_names is covered).
  const qnorm = query.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!qnorm) {
    return { payload: [], summary: "Provide a search term with letters or numbers." };
  }
  const limit = clampLimit(args.limit, 8, 20);

  // Phase 1 search hits the plant_library table directly — it's the
  // home-grown AI-built catalogue with care fields ready to use.
  // Full multi-provider search (Perenual + Verdantly + AI cascade) is
  // a Phase 2 enhancement.
  // search_norm is the generated, trigram-indexed column that concatenates
  // common + scientific + other_names and collapses to alphanumerics — so a
  // normalised query matches alternate names AND is spacing-insensitive
  // ("crab apple" = "crabapple"). sunlight (jsonb) is the sun column — there
  // is no `sun` or `scientific_name_text` column.
  let q = ctx.db
    .from("plant_library")
    .select("id, common_name, scientific_name, other_names, is_edible, sunlight, watering, hardiness_min, hardiness_max")
    .ilike("search_norm", `%${qnorm}%`)
    .limit(limit);
  if (args.edible === true) q = q.eq("is_edible", true);

  const { data, error } = await q;
  if (error) throw error;
  const n = data?.length ?? 0;
  return {
    payload: data ?? [],
    summary: n > 0
      ? `Found ${n} matching plant${n === 1 ? "" : "s"} in the catalogue.`
      : `No catalogue entry for "${query}" to add — this does NOT limit your knowledge. Answer the user's question from your own horticultural expertise, and if it's a plant they grow, offer to add it as a manual plant.`,
  };
}

// ─── get_plant_details ─────────────────────────────────────────────────
export async function exec_get_plant_details(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const id = Number(args.plant_id);
  if (!Number.isInteger(id)) {
    throw new Error(`Invalid plant_id: ${args.plant_id}`);
  }
  const { data, error } = await ctx.db
    .from("plants")
    .select("id, common_name, scientific_name, source, cycle, sunlight, watering, care_guide_data, image_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (data) return { payload: data, summary: `Details for ${data.common_name}.` };

  // Fallback: search_plant_database returns plant_library (catalogue) ids, not
  // plants ids — so a details lookup after a catalogue search would otherwise
  // miss. Resolve the id against the catalogue too (incl. soil_* care ranges).
  const { data: lib, error: libErr } = await ctx.db
    .from("plant_library")
    .select("id, common_name, scientific_name, cycle, sunlight, watering, hardiness_min, hardiness_max, description, soil_moisture_min, soil_moisture_max, soil_ec_min, soil_ec_max, soil_temp_min, soil_temp_max")
    .eq("id", id)
    .maybeSingle();
  if (libErr) throw libErr;
  if (lib) return { payload: { ...lib, source: "library" }, summary: `Catalogue details for ${lib.common_name}.` };

  return { payload: null, summary: `No plant found with id ${id}.` };
}

// ─── get_weather_now ───────────────────────────────────────────────────
export async function exec_get_weather_now(ctx: ExecutorContext): Promise<ExecResult> {
  const [{ data: snapshot }, { data: alerts }] = await Promise.all([
    ctx.db.from("weather_snapshots").select("data").eq("home_id", ctx.homeId).maybeSingle(),
    // weather_alerts is LOCATION-scoped (no home_id column) — filter
    // through the locations join.
    ctx.db
      .from("weather_alerts")
      .select("id, type, severity, message, ends_at, locations!inner(home_id)")
      .eq("locations.home_id", ctx.homeId)
      .gte("ends_at", new Date().toISOString()),
  ]);

  return {
    payload: { snapshot: snapshot?.data ?? null, alerts: alerts ?? [] },
    summary: snapshot?.data
      ? `Weather snapshot loaded. ${alerts?.length ?? 0} active alert${alerts?.length === 1 ? "" : "s"}.`
      : "No weather snapshot for this home yet.",
  };
}

// ─── get_overdue_summary ───────────────────────────────────────────────
export async function exec_get_overdue_summary(ctx: ExecutorContext): Promise<ExecResult> {
  const todayIso = new Date().toISOString().split("T")[0];

  const [
    { data: overdueTasks },
    { data: activeAilments },
    { data: alerts },
  ] = await Promise.all([
    ctx.db
      .from("tasks")
      .select("id, title, type, due_date")
      .eq("home_id", ctx.homeId)
      .eq("status", "Pending")
      .lt("due_date", todayIso)
      .order("due_date", { ascending: true })
      .limit(20),
    ctx.db
      .from("ailments")
      .select("id, name, type")
      .eq("home_id", ctx.homeId)
      .eq("is_archived", false)
      .limit(10),
    // weather_alerts is LOCATION-scoped (no home_id column) — filter
    // through the locations join.
    ctx.db
      .from("weather_alerts")
      .select("id, type, severity, message, locations!inner(home_id)")
      .eq("locations.home_id", ctx.homeId)
      .gte("ends_at", new Date().toISOString())
      .limit(5),
  ]);

  const payload = {
    overdue_tasks: overdueTasks ?? [],
    active_ailments: activeAilments ?? [],
    weather_alerts: alerts ?? [],
  };

  const pieces: string[] = [];
  if (overdueTasks?.length) pieces.push(`${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}`);
  if (activeAilments?.length) pieces.push(`${activeAilments.length} active ailment${activeAilments.length === 1 ? "" : "s"}`);
  if (alerts?.length) pieces.push(`${alerts.length} weather alert${alerts.length === 1 ? "" : "s"}`);

  return {
    payload,
    summary: pieces.length > 0 ? pieces.join(", ") : "Nothing overdue — you're all caught up.",
  };
}

// ─── optimise_area_schedule ────────────────────────────────────────────
// Invokes the optimise-area-ai edge function (which proposes schedule
// consolidations) and returns the proposals. Read-shaped: it only
// *suggests* — applying stays manual in the Optimise tab. Forwards the
// caller's bearer token so the downstream function's auth + AI-quota
// gates apply.
export async function exec_optimise_area_schedule(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  if (!args.area_id) {
    return { payload: [], summary: "Tell me which area to optimise (area_id)." };
  }
  if (!ctx.authToken) {
    return { payload: [], summary: "Couldn't authenticate the optimisation request." };
  }

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/optimise-area-ai`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.authToken}`,
    },
    body: JSON.stringify({ homeId: ctx.homeId, areaId: args.area_id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Optimiser returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const proposals = (data.proposals ?? []) as Array<{ displayText?: string; scenario?: string; category?: string }>;
  return {
    payload: proposals.map((p) => ({
      scenario: p.scenario,
      category: p.category,
      displayText: p.displayText,
    })),
    summary:
      proposals.length === 0
        ? "No optimisation opportunities found for that area — your schedule looks efficient."
        : `Found ${proposals.length} optimisation suggestion${proposals.length === 1 ? "" : "s"}. Open the Optimise tab to apply.`,
  };
}

// ─── Tool router ───────────────────────────────────────────────────────

type Executor = (ctx: ExecutorContext, args: Record<string, any>) => Promise<ExecResult>;

/**
 * Display-only tool — echoes the plant names the model wants to SHOW the user.
 * The send_message handler turns these into `suggested_plants`, which the chat
 * renders as cards with real licensed photos (Wikipedia/Unsplash). This is how
 * the text chat answers "show me what a peace lily looks like" without any
 * unlicensed web-image scraping.
 */
export async function exec_show_plant_images(
  _ctx: ExecutorContext,
  args: { plants?: Array<{ name?: string; search_query?: string }> },
): Promise<ExecResult> {
  const plants = Array.isArray(args?.plants) ? args.plants : [];
  const clean = plants
    .filter((p) => p && typeof p.name === "string" && p.name.trim())
    .slice(0, 8)
    .map((p) => ({
      name: p.name!.trim(),
      search_query: (typeof p.search_query === "string" && p.search_query.trim()) ? p.search_query.trim() : p.name!.trim(),
      // Flags the client to render a multi-photo gallery (vs. the compact
      // thumbnail used for "you might like…" plant suggestions).
      show: true,
    }));
  return {
    payload: { plants: clean },
    summary: clean.length ? `Showing photos of ${clean.map((p) => p.name).join(", ")}.` : "No plants to show.",
  };
}

// ─── list_devices ──────────────────────────────────────────────────────
export async function exec_list_devices(
  ctx: ExecutorContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  let q = ctx.db
    .from("devices")
    .select("id, name, device_type, area_id")
    .eq("home_id", ctx.homeId)
    .eq("is_active", true)
    .order("name");
  if (args.device_type) q = q.eq("device_type", args.device_type);
  if (args.area_id) q = q.eq("area_id", args.area_id);
  const { data, error } = await q;
  if (error) throw error;

  // Attach each device's newest reading (soil sensors: soil_moisture /
  // soil_temp / soil_ec; valves: state) so the assistant can quote live values
  // instead of claiming it has no sensor access. Homes have a handful of
  // devices at most, so per-device lookups are fine.
  const devices = await Promise.all((data ?? []).map(async (d: Record<string, unknown>) => {
    const { data: r } = await ctx.db
      .from("device_readings")
      .select("recorded_at, data")
      .eq("device_id", d.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return r
      ? { ...d, latest_reading: r.data, reading_recorded_at: r.recorded_at }
      : { ...d, latest_reading: null, reading_recorded_at: null };
  }));

  const withReading = devices.filter((d) => d.latest_reading).length;
  return {
    payload: devices,
    summary: `Found ${devices.length} device${devices.length === 1 ? "" : "s"} (valves + sensors), ${withReading} with a latest reading attached.`,
  };
}

// ─── list_automations ──────────────────────────────────────────────────
export async function exec_list_automations(
  ctx: ExecutorContext,
  _args: Record<string, any>,
): Promise<ExecResult> {
  const { data: autos, error } = await ctx.db
    .from("automations")
    .select("id, name, is_active, trigger_logic, run_limit_count, run_limit_window_hours, sensor_cooldown_minutes, rate_limited_until, last_fired_at, area_id")
    .eq("home_id", ctx.homeId)
    .order("created_at");
  if (error) throw error;

  const ids = (autos ?? []).map((a: { id: string }) => a.id);
  const actionsByAuto = new Map<string, string[]>();
  if (ids.length) {
    const { data: acts } = await ctx.db
      .from("automation_actions")
      .select("automation_id, action_kind, ord")
      .in("automation_id", ids)
      .order("ord");
    for (const a of (acts ?? []) as Array<{ automation_id: string; action_kind: string }>) {
      const arr = actionsByAuto.get(a.automation_id) ?? [];
      arr.push(a.action_kind);
      actionsByAuto.set(a.automation_id, arr);
    }
  }

  const payload = (autos ?? []).map((a: Record<string, any>) => ({
    id: a.id,
    name: a.name,
    is_active: a.is_active,
    trigger: summariseTree(a.trigger_logic as ConditionNode),
    actions: actionsByAuto.get(a.id) ?? [],
    run_limit: a.run_limit_count ? `${a.run_limit_count} per ${a.run_limit_window_hours ?? 24}h` : "unlimited",
    cooldown_minutes: a.sensor_cooldown_minutes,
    last_fired_at: a.last_fired_at,
    rate_limited_until: a.rate_limited_until,
    area_id: a.area_id,
  }));
  return {
    payload,
    summary: `Found ${payload.length} automation${payload.length === 1 ? "" : "s"}.`,
  };
}

export const READ_EXECUTORS: Record<string, Executor> = {
  show_plant_images:     exec_show_plant_images,
  list_plants:           exec_list_plants,
  list_tasks:            exec_list_tasks,
  list_blueprints:       exec_list_blueprints,
  list_locations:        (ctx) => exec_list_locations(ctx),
  list_areas:            exec_list_areas,
  list_ailments:         exec_list_ailments,
  list_shopping_lists:   exec_list_shopping_lists,
  list_seed_packets:     exec_list_seed_packets,
  list_plans:            exec_list_plans,
  search_plant_database: exec_search_plant_database,
  get_plant_details:     exec_get_plant_details,
  get_weather_now:       (ctx) => exec_get_weather_now(ctx),
  get_overdue_summary:   (ctx) => exec_get_overdue_summary(ctx),
  optimise_area_schedule: exec_optimise_area_schedule,
  list_devices:          exec_list_devices,
  list_automations:      exec_list_automations,
};
