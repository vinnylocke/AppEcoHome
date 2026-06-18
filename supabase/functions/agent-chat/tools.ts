/**
 * Tool catalog for the agent-chat function.
 *
 * Phase 1 — read-only tools (13). All `auto` risk level (no confirm card needed).
 * Phase 2-4 will add mutation tools with 'confirm' / 'strong_confirm' risk levels.
 *
 * Each tool declaration becomes part of the system prompt sent to Gemini.
 * The model picks one (or more) per turn; the agent-chat handler routes
 * each call through the executor in `./executors/`.
 */

import type { GeminiToolDeclaration } from "../_shared/gemini.ts";

export type RiskLevel = "auto" | "confirm" | "strong_confirm";

export interface ToolMeta {
  decl: GeminiToolDeclaration;
  /** Risk level drives whether a confirm card is shown before execution. */
  risk: RiskLevel;
  /** Minimum tier that may invoke this tool. */
  minTier: "sprout" | "botanist" | "sage" | "evergreen";
}

// ─────────────────────────────────────────────────────────────────────
// Phase 1 — Read tools (no mutations, no confirmation)
// ─────────────────────────────────────────────────────────────────────

export const READ_TOOLS: ToolMeta[] = [
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_plants",
      description:
        "List plants the user has in their Shed (their personal plant inventory). Filter by area, status (e.g. 'Planted', 'In Shed', 'Archived'), or a free-text search across plant names.",
      parameters: {
        type: "object",
        properties: {
          area_id: { type: "string", description: "Optional area UUID to filter by." },
          status:  { type: "string", description: "Optional status filter — typical values: Planted, In Shed, Archived." },
          search:  { type: "string", description: "Optional free-text search across plant common name + nickname + identifier." },
          limit:   { type: "integer", description: "Max rows to return (default 30, max 100)." },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_tasks",
      description:
        "List the user's gardening tasks (one-off or generated from blueprints). Filter by area, due window, status. Returns both physical and ghost (blueprint-projected) tasks.",
      parameters: {
        type: "object",
        properties: {
          area_id:    { type: "string" },
          due_from:   { type: "string", description: "ISO date — only tasks due on or after this date." },
          due_to:     { type: "string", description: "ISO date — only tasks due on or before this date." },
          status:     { type: "string", description: "Pending | Completed | Skipped" },
          overdue_only: { type: "boolean", description: "If true, only return tasks past their due date." },
          limit:      { type: "integer" },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_blueprints",
      description:
        "List the user's recurring Task Schedules (blueprints). These are reusable templates that generate periodic tasks (watering every 4 days, pruning every 3 weeks, etc.).",
      parameters: {
        type: "object",
        properties: {
          area_id:     { type: "string" },
          type:        { type: "string", description: "Watering | Pruning | Harvesting | Maintenance | Planting" },
          is_archived: { type: "boolean", description: "Default false." },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_locations",
      description: "List the user's locations. Each location is a top-level place like 'Back Garden', 'Front Garden', 'Greenhouse'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_areas",
      description: "List the user's garden areas. Each area sits inside a location (e.g. 'Veg Bed' in 'Back Garden').",
      parameters: {
        type: "object",
        properties: {
          location_id: { type: "string", description: "Optional — filter areas to one location." },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_ailments",
      description: "List ailments on the user's Watchlist (pests, diseases, invasives). May include archived ones if requested.",
      parameters: {
        type: "object",
        properties: {
          include_archived: { type: "boolean", description: "Default false." },
          type:             { type: "string", description: "pest | disease | invasive" },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_shopping_lists",
      description: "List the user's shopping lists with their items (plants and supplies).",
      parameters: {
        type: "object",
        properties: {
          include_completed: { type: "boolean", description: "Default false." },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_seed_packets",
      description: "List the user's seed packets in the Nursery. Optionally filter to packets that have or haven't been sown yet.",
      parameters: {
        type: "object",
        properties: {
          sown: { type: "boolean", description: "true = sown packets, false = unsown, omit = both." },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "list_plans",
      description: "List the user's garden plans (the Planner). Plans group plants, tasks, and notes for a project like 'Spring Veg Bed 2026'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "draft | in_progress | completed | archived" },
        },
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "show_plant_images",
      description:
        "Display real photos of one or more plants to the user. Call this whenever the user asks to SEE a plant, asks what something looks like, or would benefit from a picture. The app renders a licensed photo (Wikipedia/Unsplash) for each — you cannot embed images yourself, so use this tool instead of saying you can't show pictures.",
      parameters: {
        type: "object",
        properties: {
          plants: {
            type: "array",
            description: "The plants to show (1-8).",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Common name to label the photo." },
                search_query: { type: "string", description: "Optional better image search phrase (e.g. scientific name)." },
              },
              required: ["name"],
            },
          },
        },
        required: ["plants"],
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "search_plant_database",
      description:
        "Search the global plant database (Perenual + Verdantly + Rhozly AI catalogue) for a plant species the user does NOT yet have. Use this to find candidate plants before suggesting one to add. Returns species metadata, never plants from the user's Shed.",
      parameters: {
        type: "object",
        properties: {
          query:    { type: "string", description: "The plant name or part of a name (common or scientific)." },
          edible:   { type: "boolean", description: "Restrict to edible plants." },
          limit:    { type: "integer", description: "Default 8, max 20." },
        },
        required: ["query"],
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "get_plant_details",
      description: "Fetch the full care guide for a plant by its plants.id. Use this AFTER list_plants or search_plant_database has identified the right plant.",
      parameters: {
        type: "object",
        properties: {
          plant_id: { type: "integer", description: "The plants.id (integer PK)." },
        },
        required: ["plant_id"],
      },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "get_weather_now",
      description: "Get the current weather snapshot + 7-day forecast for the user's home location.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    risk: "auto",
    minTier: "sprout",
    decl: {
      name: "get_overdue_summary",
      description:
        "Get a digest of what needs the user's attention right now: overdue tasks, unresolved ailments, weather alerts, plants that haven't been touched recently. Use this when the user asks 'what's going on?' or 'what needs doing?'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    risk: "auto",
    minTier: "botanist",
    decl: {
      name: "optimise_area_schedule",
      description:
        "Analyse an area's task schedules and suggest consolidations (merge fragmented waterings, retire redundant tasks, adjust frequencies). Returns suggestions only — applying them stays manual in the Optimise tab. Use when the user asks to 'tidy up', 'streamline', or 'optimise' their schedules for an area.",
      parameters: {
        type: "object",
        properties: {
          area_id: { type: "string", description: "The area UUID to analyse." },
        },
        required: ["area_id"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Phase 2 — Safe-create mutation tools (confirm card before each)
// ─────────────────────────────────────────────────────────────────────

export const MUTATION_TOOLS: ToolMeta[] = [
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "create_one_off_task",
      description:
        "Create a single (non-recurring) gardening task. Use this for 'remind me to prune the tomatoes on Saturday' style asks. For recurring schedules, use create_blueprint instead (Phase 3).",
      parameters: {
        type: "object",
        properties: {
          title:    { type: "string", description: "Short, action-oriented title." },
          type:     { type: "string", description: "Watering | Pruning | Harvesting | Maintenance | Planting" },
          due_date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
          area_id:  { type: "string", description: "Optional area UUID." },
          inventory_item_ids: {
            type: "array",
            description: "Optional list of inventory_items.id this task is for.",
            items: { type: "string" },
          },
          description: { type: "string", description: "Optional longer description." },
        },
        required: ["title", "type", "due_date"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "add_journal_entry",
      description:
        "Add a journal entry. AT MOST ONE of inventory_item_id / location_id / area_id / plan_id may be set — leave all four blank for a general garden note.",
      parameters: {
        type: "object",
        properties: {
          subject:           { type: "string", description: "Short subject line." },
          description:       { type: "string", description: "Body of the note." },
          photo_url:         { type: "string", description: "Optional storage URL for an attached image." },
          inventory_item_id: { type: "string", description: "Attach to a plant instance." },
          location_id:       { type: "string", description: "Attach to a location." },
          area_id:           { type: "string", description: "Attach to an area." },
          plan_id:           { type: "string", description: "Attach to a planner plan." },
        },
        required: ["subject", "description"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "add_plant_to_shed",
      description:
        "Add a new plant to the user's Shed. Creates a manual `plants` species record (source='manual') and an `inventory_items` row. If area_id is supplied, the instance is set to 'Planted'; otherwise it lands as 'In Shed'. Use search_plant_database first to verify the plant name.",
      parameters: {
        type: "object",
        properties: {
          common_name:     { type: "string", description: "Common name e.g. 'Sweet Million Tomato'." },
          scientific_name: { type: "string", description: "Optional scientific name e.g. 'Solanum lycopersicum'." },
          area_id:         { type: "string", description: "Optional — assigns the instance to an area." },
          identifier:      { type: "string", description: "Optional user-facing label e.g. 'Tomato #3'." },
          quantity:        { type: "integer", description: "Number of plants (default 1)." },
        },
        required: ["common_name"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "assign_plant_to_area",
      description: "Move an existing inventory item into an area. Sets the instance status to 'Planted'.",
      parameters: {
        type: "object",
        properties: {
          inventory_item_id: { type: "string" },
          area_id:           { type: "string" },
        },
        required: ["inventory_item_id", "area_id"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "add_ailment",
      description: "Add an ailment (pest, disease, or invasive plant) to the user's Watchlist.",
      parameters: {
        type: "object",
        properties: {
          name:        { type: "string" },
          type:        { type: "string", description: "pest | disease | invasive_plant" },
          description: { type: "string", description: "Optional notes about the ailment." },
        },
        required: ["name", "type"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "link_ailment_to_instance",
      description: "Mark a plant instance as currently affected by a Watchlist ailment.",
      parameters: {
        type: "object",
        properties: {
          ailment_id:        { type: "string" },
          inventory_item_id: { type: "string" },
        },
        required: ["ailment_id", "inventory_item_id"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "create_shopping_list",
      description: "Create a new shopping list.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "List name e.g. 'Spring Veg'." },
        },
        required: ["name"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "add_to_shopping_list",
      description: "Add an item to a shopping list. Either pass list_id to target a specific list, or omit it to use the most recent active list.",
      parameters: {
        type: "object",
        properties: {
          list_id:   { type: "string", description: "Optional — defaults to most recent active list." },
          name:      { type: "string", description: "Item name." },
          item_type: { type: "string", description: "plant | product" },
          category:  { type: "string", description: "Optional category for product items." },
        },
        required: ["name", "item_type"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "add_seed_packet",
      description: "Add a seed packet to the Nursery.",
      parameters: {
        type: "object",
        properties: {
          plant_name: { type: "string", description: "Common name on the packet." },
          variety:    { type: "string", description: "Optional variety name e.g. 'Cherokee Purple'." },
          vendor:     { type: "string", description: "Optional vendor / seed supplier." },
          sow_by:     { type: "string", description: "Optional ISO date to sow by." },
        },
        required: ["plant_name"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "log_sowing",
      description: "Log a sowing event against an existing seed packet.",
      parameters: {
        type: "object",
        properties: {
          packet_id:    { type: "string", description: "seed_packets.id" },
          sown_on:      { type: "string", description: "ISO date sowing took place (defaults to today)." },
          quantity:     { type: "integer", description: "Number of seeds sown." },
          location_note:{ type: "string", description: "Where they were sown — bed name / module label." },
        },
        required: ["packet_id"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Phase 3 — Structural / schedule tools (confirm card before each)
// ─────────────────────────────────────────────────────────────────────

export const STRUCTURAL_TOOLS: ToolMeta[] = [
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "create_blueprint",
      description:
        "Create a recurring Task Schedule (blueprint). The schedule generates a task every `frequency_days` days starting from `start_date`. Used for watering, pruning, harvesting cycles. The next 5 occurrences are previewed in the confirm card.",
      parameters: {
        type: "object",
        properties: {
          title:           { type: "string", description: "e.g. 'Water tomatoes'" },
          task_type:       { type: "string", description: "Watering | Pruning | Harvesting | Maintenance | Planting" },
          frequency_days:  { type: "integer", description: "Cadence — every N days." },
          start_date:      { type: "string", description: "ISO date (YYYY-MM-DD)." },
          end_date:        { type: "string", description: "Optional ISO date when the schedule stops." },
          area_id:         { type: "string", description: "Optional area UUID." },
          inventory_item_ids: {
            type: "array",
            description: "Optional list of inventory_items.id this schedule covers.",
            items: { type: "string" },
          },
          description:     { type: "string", description: "Optional longer description." },
        },
        required: ["title", "task_type", "frequency_days", "start_date"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "update_blueprint",
      description:
        "Modify an existing Task Schedule. You can change the title, description, frequency, end date, or area. Future tasks will reflect the change on the next generation cycle.",
      parameters: {
        type: "object",
        properties: {
          blueprint_id:   { type: "string" },
          title:          { type: "string" },
          description:    { type: "string" },
          frequency_days: { type: "integer" },
          end_date:       { type: "string", description: "ISO date or null to clear." },
          area_id:        { type: "string", description: "Move the schedule to a different area." },
        },
        required: ["blueprint_id"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "pause_blueprint",
      description:
        "Pause a Task Schedule until a given date. While paused, no new tasks are generated from it. Pass null to unpause.",
      parameters: {
        type: "object",
        properties: {
          blueprint_id: { type: "string" },
          until_date:   { type: "string", description: "ISO date to resume on, or null to clear the pause." },
        },
        required: ["blueprint_id"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "create_location",
      description: "Create a new location in the user's home. A location is a top-level place ('Back Garden', 'Greenhouse').",
      parameters: {
        type: "object",
        properties: {
          name:     { type: "string" },
          postcode: { type: "string", description: "Optional — used for weather data." },
        },
        required: ["name"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "create_area",
      description: "Create a new area inside an existing location. Areas hold plants (e.g. 'Veg Bed' inside 'Back Garden').",
      parameters: {
        type: "object",
        properties: {
          location_id: { type: "string" },
          name:        { type: "string" },
        },
        required: ["location_id", "name"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "create_plan",
      description: "Create a new Planner plan. A plan groups plants + tasks for a project like 'Spring Veg Bed 2026'.",
      parameters: {
        type: "object",
        properties: {
          name:        { type: "string" },
          description: { type: "string" },
          status:      { type: "string", description: "Default 'Draft'. Other values: 'In Progress', 'Completed'." },
        },
        required: ["name"],
      },
    },
  },
  {
    risk: "confirm",
    minTier: "botanist",
    decl: {
      name: "add_plant_to_plan",
      description:
        "Add a plant to a Planner plan's plant list. Appends to the plan's plant manifest — the plant then appears in the plan's Shed phase for procurement. Use list_plans first to get the plan_id. For 'plant this in a bed right now' use add_plant_to_shed + assign_plant_to_area instead.",
      parameters: {
        type: "object",
        properties: {
          plan_id:         { type: "string" },
          common_name:     { type: "string" },
          quantity:        { type: "integer", description: "How many (default 1)." },
          scientific_name: { type: "string", description: "Optional." },
        },
        required: ["plan_id", "common_name"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Phase 4 — Destructive / bulk tools (strong-confirm; hold-to-confirm UX)
// ─────────────────────────────────────────────────────────────────────

export const DESTRUCTIVE_TOOLS: ToolMeta[] = [
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "archive_plant",
      description:
        "Soft-archive a plant species record from the Shed. The plant disappears from the active list but its inventory items remain. Reversible via restore_plant.",
      parameters: {
        type: "object",
        properties: {
          plant_id: { type: "integer" },
        },
        required: ["plant_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "restore_plant",
      description: "Un-archive a previously archived plant species.",
      parameters: {
        type: "object",
        properties: {
          plant_id: { type: "integer" },
        },
        required: ["plant_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "end_of_life_instance",
      description:
        "Mark a plant instance as having reached the end of its life cycle. Sets ended_at + was_natural_end + status='Archived' and writes a closing journal entry. The instance moves to the Senescence tab. Reversible via restore_instance.",
      parameters: {
        type: "object",
        properties: {
          inventory_item_id: { type: "string" },
          was_natural:       { type: "boolean", description: "true = harvest close / natural senescence; false = deliberate ending (pest, mistake)." },
          summary:           { type: "string", description: "Optional closing note." },
          photo_url:         { type: "string", description: "Optional closing photo URL." },
        },
        required: ["inventory_item_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "restore_instance",
      description:
        "Restore an instance from the Senescence tab back to active. Clears ended_at / was_natural_end / end_summary, flips status to 'Planted', writes a 'Restored from Senescence' journal entry.",
      parameters: {
        type: "object",
        properties: {
          inventory_item_id: { type: "string" },
        },
        required: ["inventory_item_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "delete_instance",
      description:
        "Permanently delete a plant instance. NOT REVERSIBLE — for accidental adds or test data only. For finished plants, use end_of_life_instance instead (reversible, preserves history).",
      parameters: {
        type: "object",
        properties: {
          inventory_item_id: { type: "string" },
        },
        required: ["inventory_item_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "archive_ailment",
      description: "Soft-archive an ailment from the Watchlist. Reversible by setting is_archived=false.",
      parameters: {
        type: "object",
        properties: {
          ailment_id: { type: "string" },
        },
        required: ["ailment_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "archive_blueprint",
      description:
        "Soft-archive a Task Schedule. Future tasks stop generating but historical tasks survive. Reversible. (For permanent removal you'd need to delete via the Schedule Manager — the agent doesn't hard-delete blueprints because that cascades to tasks.)",
      parameters: {
        type: "object",
        properties: {
          blueprint_id: { type: "string" },
        },
        required: ["blueprint_id"],
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "bulk_reschedule",
      description:
        "Shift the due date of many tasks at once. Either pass shift_days (relative move) OR new_date (absolute). Filter narrows which tasks are affected: area_id, type, blueprint_id, due_before. Only Pending tasks are touched.",
      parameters: {
        type: "object",
        properties: {
          area_id:      { type: "string" },
          task_type:    { type: "string", description: "Watering | Pruning | etc." },
          blueprint_id: { type: "string" },
          due_before:   { type: "string", description: "ISO date — restrict to tasks due before this date." },
          shift_days:   { type: "integer", description: "Positive = push back, negative = pull forward." },
          new_date:     { type: "string", description: "Absolute ISO date for all matching tasks." },
        },
      },
    },
  },
  {
    risk: "strong_confirm",
    minTier: "botanist",
    decl: {
      name: "bulk_complete_tasks",
      description:
        "Mark many tasks as Completed at once. Filter: area_id, type, blueprint_id, due_before. Reversible — Undo restores Pending status.",
      parameters: {
        type: "object",
        properties: {
          area_id:      { type: "string" },
          task_type:    { type: "string" },
          blueprint_id: { type: "string" },
          due_before:   { type: "string" },
        },
      },
    },
  },
];

/**
 * Master catalog — combination of all phases.
 */
export const ALL_TOOLS: ToolMeta[] = [
  ...READ_TOOLS,
  ...MUTATION_TOOLS,
  ...STRUCTURAL_TOOLS,
  ...DESTRUCTIVE_TOOLS,
];

/** Look up a tool by name. */
export function getToolMeta(name: string): ToolMeta | undefined {
  return ALL_TOOLS.find((t) => t.decl.name === name);
}

/**
 * Tier-filtered tool catalog. Returns just the GeminiToolDeclaration[]
 * suitable for passing to `callGeminiWithTools`.
 */
export function getToolsForTier(
  tier: "sprout" | "botanist" | "sage" | "evergreen",
): GeminiToolDeclaration[] {
  const tierRank: Record<string, number> = {
    sprout: 0, botanist: 1, sage: 2, evergreen: 3,
  };
  const userRank = tierRank[tier] ?? 0;
  return ALL_TOOLS
    .filter((t) => tierRank[t.minTier] <= userRank)
    .map((t) => t.decl);
}
