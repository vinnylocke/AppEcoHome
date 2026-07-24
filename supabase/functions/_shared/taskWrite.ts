// Pure planner for the Wear write path (complete / postpone / delete), the
// server-side mirror of the browser mutation core (src/lib/taskActions.ts +
// src/lib/taskMutations.ts). The thin Wear client sends {action, task, ...};
// this module decides the exact DB operations, the pattern-engine event, and
// any "finish on phone" hint — WITHOUT touching the DB, so it is fully
// unit-testable (supabase/tests/taskWrite.test.ts). The handler
// (mutate-task/index.ts) executes the ops with the service client and bakes in
// the 23505 → UPDATE-on-(blueprint_id,due_date) recovery.
//
// Why a server function at all: get-today-tasks returns only 7 columns, but a
// faithful materialised row needs ~15 (buildGhostPayload). There are ZERO DB
// triggers on `tasks`, so every side-effect (the user_events row that feeds the
// pattern engine + streaks, auto-journal) is code-orchestrated and must be
// emitted here or it is silently lost. See docs/plans/wear-phase3-task-actions.md.

/** Task types allowed by the live `tasks_type_check` (20260430010000).
 *  A materialised (INSERT) row carrying any other type raises 23514 — which the
 *  23505 fallback does NOT catch — so we guard inserts against this set.
 *  NB: 'Feeding' is deliberately ABSENT (it is a live AI-generated blueprint
 *  type but was dropped from the check; materialising it would throw). */
export const ALLOWED_TASK_TYPES = new Set<string>([
  "Planting",
  "Watering",
  "Harvesting",
  "Maintenance",
  "Inspection",
  "Pest Control",
  "Pruning",
  "Fertilizing",
  "Plant",
  "Water",
  "Harvest",
]);

export const isMaterialisable = (type: string): boolean => ALLOWED_TASK_TYPES.has(type);

const PLANTING_TYPES = new Set(["Planting", "Plant"]);
const HARVEST_TYPES = new Set(["Harvesting", "Harvest"]);

export type MutateAction = "complete" | "postpone" | "delete";

/** Normalised source row the payload builder reads from — for a ghost it is
 *  assembled from the re-fetched blueprint + the ghost's date/window; for a
 *  physical task it is the real `tasks` row. Field names match `tasks`. */
export interface SourceRow {
  home_id: string;
  blueprint_id: string | null;
  title: string;
  description: string | null;
  type: string;
  due_date: string;
  location_id: string | null;
  area_id: string | null;
  plan_id: string | null;
  inventory_item_ids: string[] | null;
  scope: string | null;
  created_by: string | null;
  assigned_to: string | null;
  window_end_date: string | null;
  next_check_at: string | null;
}

/** Deno mirror of src/lib/taskMutations.ts buildGhostPayload — carries the
 *  ownership/visibility fields (scope/created_by/assigned_to) so a personal
 *  routine's occurrence never leaks home-wide (bug-audit-2026-07-10 #5), and
 *  the harvest window context (window_end_date/next_check_at). */
export function buildGhostPayload(
  source: SourceRow,
  status: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    home_id: source.home_id,
    blueprint_id: source.blueprint_id,
    title: source.title,
    description: source.description,
    type: source.type,
    due_date: source.due_date,
    status,
    location_id: source.location_id,
    area_id: source.area_id,
    plan_id: source.plan_id,
    inventory_item_ids: source.inventory_item_ids,
    scope: source.scope ?? "home",
    created_by: source.created_by ?? null,
    assigned_to: source.assigned_to ?? null,
    window_end_date: source.window_end_date ?? null,
    next_check_at: source.next_check_at ?? null,
    ...overrides,
  };
}

/** One DB operation the executor runs in order. State-changing ops carry an
 *  optional CAS `guardNeq` (only touch rows where col <> value) so a retried
 *  action is a no-op — no event double-log. */
export type WriteOp =
  | {
      kind: "update_by_id";
      id: string;
      set: Record<string, unknown>;
      guardNeq?: Record<string, unknown>;
    }
  | {
      kind: "insert";
      values: Record<string, unknown>;
      /** 23505 → UPDATE the (blueprint_id,due_date) slot with this set (CAS-guarded). */
      onConflict?: { set: Record<string, unknown>; guardNeq?: Record<string, unknown> } | null;
      /** 23505 → treat as a no-op (leave the existing row untouched). */
      tolerateConflict?: boolean;
    }
  | { kind: "delete_by_id"; id: string }
  | { kind: "delete_blueprint"; id: string };

export interface EventSpec {
  event_type: string; // task_completed | task_skipped | task_postponed | blueprint_deleted
  meta: Record<string, unknown>;
}

export interface MutationPlan {
  ops: WriteOp[];
  /** Emitted by the executor ONLY if the ops changed ≥1 row (retry-safe). */
  event: EventSpec | null;
  /** "finish on phone" note for Planting/Harvest completion; null otherwise. */
  hint: string | null;
  /** Present ⇒ the handler returns this instead of executing (e.g. bad type). */
  error?: { status: number; code: string; hint?: string };
}

export interface PlanInput {
  action: MutateAction;
  /** The original task id — a real UUID (physical) or `ghost-{bp}-{date}` (ghost).
   *  Used as user_events.meta.task_id and as the id for physical UPDATE/DELETE. */
  taskId: string;
  isGhost: boolean;
  blueprintId: string | null;
  source: SourceRow;
  userId: string;
  /** ISO timestamp for completed_at — injected so the planner stays pure. */
  now: string;
  newDate?: string | null; // postpone
  deleteSeries?: boolean; // delete
}

const EMPTY: MutationPlan = { ops: [], event: null, hint: null };

function completionHint(type: string): string | null {
  if (PLANTING_TYPES.has(type)) return "Finish the planting details on your phone";
  if (HARVEST_TYPES.has(type)) return "Log your harvest on your phone";
  return null;
}

function unsupportedType(): MutationPlan {
  return {
    ...EMPTY,
    error: { status: 422, code: "unsupported_type", hint: "Finish this task on your phone" },
  };
}

/**
 * Decide the DB operations + side-effect event for one watch action.
 * Pure: no DB, no clock (now is injected). The executor runs `ops` and emits
 * `event` iff any op changed a row.
 */
export function planTaskMutation(input: PlanInput): MutationPlan {
  const { action, isGhost, source, userId, now } = input;
  const blueprintId = input.blueprintId ?? source.blueprint_id ?? null;
  const dueDate = source.due_date;
  const type = source.type;
  const invIds = source.inventory_item_ids ?? [];

  if (action === "complete") {
    // A ghost completion INSERTs a row → guard the type (23514 otherwise).
    if (isGhost && !isMaterialisable(type)) return unsupportedType();

    const completedSet = { status: "Completed", completed_at: now, completed_by: userId };
    const event: EventSpec = {
      event_type: "task_completed",
      meta: { task_id: input.taskId, task_type: type, inventory_item_ids: invIds },
    };

    if (isGhost) {
      return {
        ops: [
          {
            kind: "insert",
            values: buildGhostPayload(source, "Completed", { completed_at: now, completed_by: userId }),
            onConflict: { set: completedSet, guardNeq: { status: "Completed" } },
          },
        ],
        event,
        hint: completionHint(type),
      };
    }
    return {
      ops: [{ kind: "update_by_id", id: input.taskId, set: completedSet, guardNeq: { status: "Completed" } }],
      event,
      hint: completionHint(type),
    };
  }

  if (action === "postpone") {
    const newDate = input.newDate ?? null;
    if (!newDate || newDate === dueDate) return EMPTY; // no-op

    // Ghost + physical-blueprint both INSERT a new Pending row → guard the type.
    if ((isGhost || blueprintId) && !isMaterialisable(type)) return unsupportedType();

    const delayDays = Math.round(
      (Date.parse(`${newDate}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`)) / 86_400_000,
    );
    const event: EventSpec = {
      event_type: "task_postponed",
      meta: { task_id: input.taskId, task_type: type, delay_days: delayDays, inventory_item_ids: invIds },
    };
    const pendingAtNewDate: WriteOp = {
      kind: "insert",
      values: buildGhostPayload(source, "Pending", { due_date: newDate }),
      tolerateConflict: true, // another surface may already own the new slot
    };

    if (isGhost) {
      return {
        ops: [
          // Tombstone the original slot so the ghost engine / cron won't regen it.
          {
            kind: "insert",
            values: buildGhostPayload(source, "Skipped"),
            onConflict: { set: { status: "Skipped" }, guardNeq: { status: "Skipped" } },
          },
          pendingAtNewDate,
        ],
        event,
        hint: null,
      };
    }
    if (blueprintId) {
      return {
        ops: [
          { kind: "update_by_id", id: input.taskId, set: { status: "Skipped" }, guardNeq: { status: "Skipped" } },
          pendingAtNewDate,
        ],
        event,
        hint: null,
      };
    }
    // Standalone one-off — just move it.
    return {
      ops: [{ kind: "update_by_id", id: input.taskId, set: { due_date: newDate }, guardNeq: { due_date: newDate } }],
      event,
      hint: null,
    };
  }

  // action === "delete"
  if (input.deleteSeries && blueprintId) {
    // Destructive: CASCADE-wipes every child task incl. history. Gated behind
    // the watch's hard-confirm screen.
    return {
      ops: [{ kind: "delete_blueprint", id: blueprintId }],
      event: { event_type: "blueprint_deleted", meta: { blueprint_id: blueprintId, task_type: type } },
      hint: null,
    };
  }

  const dismissEvent: EventSpec = {
    // Fire task_skipped on single-occurrence dismiss — the browser's inline
    // executeSingleDelete omits this (bulk delete logs it); we fix it here.
    event_type: "task_skipped",
    meta: { task_id: input.taskId, task_type: type, inventory_item_ids: invIds },
  };

  if (isGhost) {
    if (!isMaterialisable(type)) return unsupportedType();
    return {
      ops: [
        {
          kind: "insert",
          values: buildGhostPayload(source, "Skipped"),
          onConflict: { set: { status: "Skipped" }, guardNeq: { status: "Skipped" } },
        },
      ],
      event: dismissEvent,
      hint: null,
    };
  }
  if (blueprintId) {
    // Physical blueprint-linked → tombstone (NEVER hard-delete, or it regenerates).
    return {
      ops: [{ kind: "update_by_id", id: input.taskId, set: { status: "Skipped" }, guardNeq: { status: "Skipped" } }],
      event: dismissEvent,
      hint: null,
    };
  }
  // Standalone one-off → hard delete (permanent).
  return { ops: [{ kind: "delete_by_id", id: input.taskId }], event: dismissEvent, hint: null };
}

// ── Auto-journal pure helpers (mirror journalAutoUpdateService.ts) ───────────

export function shouldAutoCreate(type: string, enabledCategories: string[]): boolean {
  if (!enabledCategories || enabledCategories.length === 0) return false;
  return enabledCategories.includes(type);
}

export interface AutoEntryCopy {
  subject: string;
  description: string;
}

export function buildAutoEntryCopy(
  task: { title: string; type: string },
  plantNames: string[],
): AutoEntryCopy {
  const verbMap: Record<string, string> = {
    Planting: "Planted",
    Harvesting: "Harvested",
    Pruning: "Pruned",
    Watering: "Watered",
    Maintenance: "Maintained",
  };
  const verb = verbMap[task.type] ?? task.type;
  const plantsLabel =
    plantNames.length === 0 ? null : plantNames.length === 1 ? plantNames[0] : `${plantNames.length} plants`;
  const subject = plantsLabel ? `${verb} · ${plantsLabel}` : verb;
  const description =
    plantNames.length > 1 ? `${task.title}\n\nPlants: ${plantNames.join(", ")}` : task.title;
  return { subject, description };
}
