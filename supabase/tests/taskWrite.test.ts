import { assertEquals } from "@std/assert";
import {
  ALLOWED_TASK_TYPES,
  buildAutoEntryCopy,
  buildGhostPayload,
  isMaterialisable,
  planTaskMutation,
  shouldAutoCreate,
  type PlanInput,
  type SourceRow,
} from "@shared/taskWrite.ts";

const NOW = "2026-08-04T10:00:00.000Z";
const USER = "user-9";

const src = (over: Partial<SourceRow> = {}): SourceRow => ({
  home_id: "home-1",
  blueprint_id: "bp-1",
  title: "Water the beds",
  description: "give them a soak",
  type: "Watering",
  due_date: "2026-08-04",
  location_id: "loc-1",
  area_id: "area-1",
  plan_id: null,
  inventory_item_ids: ["inv-1"],
  scope: "home",
  created_by: "author-1",
  assigned_to: null,
  window_end_date: null,
  next_check_at: null,
  ...over,
});

const plan = (over: Partial<PlanInput> & { source: SourceRow }): ReturnType<typeof planTaskMutation> =>
  planTaskMutation({
    action: "complete",
    taskId: "task-uuid",
    isGhost: false,
    blueprintId: "bp-1",
    userId: USER,
    now: NOW,
    ...over,
  });

// deno-lint-ignore no-explicit-any
const rec = (o: unknown): Record<string, any> => o as Record<string, any>;

// ── buildGhostPayload — the ownership-carry invariant ────────────────────────

Deno.test("buildGhostPayload carries ownership/visibility + window fields", () => {
  const p = buildGhostPayload(
    src({ scope: "personal", created_by: "author-1", assigned_to: "member-2", plan_id: "plan-3", window_end_date: "2026-09-30", next_check_at: "2026-08-10" }),
    "Completed",
    { completed_at: NOW, completed_by: USER },
  );
  assertEquals(p.scope, "personal");
  assertEquals(p.created_by, "author-1"); // preserved, NOT the acting user
  assertEquals(p.assigned_to, "member-2");
  assertEquals(p.plan_id, "plan-3");
  assertEquals(p.window_end_date, "2026-09-30");
  assertEquals(p.next_check_at, "2026-08-10");
  assertEquals(p.status, "Completed");
  assertEquals(p.completed_at, NOW);
  assertEquals(p.completed_by, USER);
});

Deno.test("buildGhostPayload defaults scope to home and nulls owner fields", () => {
  const p = buildGhostPayload(src({ scope: null, created_by: null, assigned_to: null }), "Skipped");
  assertEquals(p.scope, "home");
  assertEquals(p.created_by, null);
  assertEquals(p.assigned_to, null);
});

// ── COMPLETE ─────────────────────────────────────────────────────────────────

Deno.test("complete physical → UPDATE by id with CAS guard + task_completed event", () => {
  const p = plan({ action: "complete", isGhost: false, source: src({ blueprint_id: null }) });
  assertEquals(p.ops, [
    { kind: "update_by_id", id: "task-uuid", set: { status: "Completed", completed_at: NOW, completed_by: USER }, guardNeq: { status: "Completed" } },
  ]);
  assertEquals(p.event?.event_type, "task_completed");
  assertEquals(p.event?.meta.task_id, "task-uuid");
  assertEquals(p.event?.meta.task_type, "Watering");
  assertEquals(p.event?.meta.inventory_item_ids, ["inv-1"]);
  assertEquals(p.hint, null);
});

Deno.test("complete ghost → INSERT Completed with 23505→UPDATE onConflict", () => {
  const p = plan({ action: "complete", isGhost: true, source: src() });
  assertEquals(p.ops.length, 1);
  const op = rec(p.ops[0]);
  assertEquals(op.kind, "insert");
  assertEquals(op.values.status, "Completed");
  assertEquals(op.values.completed_at, NOW);
  assertEquals(op.values.completed_by, USER);
  assertEquals(op.values.blueprint_id, "bp-1");
  assertEquals(op.values.due_date, "2026-08-04");
  assertEquals(op.onConflict.set, { status: "Completed", completed_at: NOW, completed_by: USER });
  assertEquals(op.onConflict.guardNeq, { status: "Completed" });
  assertEquals(p.event?.event_type, "task_completed");
});

Deno.test("complete Planting/Harvesting yields the 'finish on phone' hint", () => {
  assertEquals(plan({ action: "complete", isGhost: true, source: src({ type: "Planting" }) }).hint, "Finish the planting details on your phone");
  assertEquals(plan({ action: "complete", isGhost: true, source: src({ type: "Harvesting" }) }).hint, "Log your harvest on your phone");
});

Deno.test("complete ghost of an unsupported type (Feeding) → 422 unsupported_type", () => {
  const p = plan({ action: "complete", isGhost: true, source: src({ type: "Feeding" }) });
  assertEquals(p.error?.status, 422);
  assertEquals(p.error?.code, "unsupported_type");
  assertEquals(p.ops, []);
});

Deno.test("complete PHYSICAL of an odd type is allowed (no INSERT, so no type guard)", () => {
  // A physical row already exists with a valid stored type; completing it just
  // UPDATEs — the guard only applies to INSERTs.
  const p = plan({ action: "complete", isGhost: false, source: src({ type: "Feeding", blueprint_id: null }) });
  assertEquals(p.error, undefined);
  assertEquals(rec(p.ops[0]).kind, "update_by_id");
});

// ── POSTPONE ─────────────────────────────────────────────────────────────────

Deno.test("postpone with an unchanged / missing date is a no-op", () => {
  assertEquals(plan({ action: "postpone", source: src(), newDate: "2026-08-04" }).ops, []);
  assertEquals(plan({ action: "postpone", source: src(), newDate: null }).ops, []);
});

Deno.test("postpone standalone → move due_date in place + task_postponed with delay_days", () => {
  const p = plan({ action: "postpone", isGhost: false, blueprintId: null, source: src({ blueprint_id: null }), newDate: "2026-08-11" });
  assertEquals(p.ops, [
    { kind: "update_by_id", id: "task-uuid", set: { due_date: "2026-08-11" }, guardNeq: { due_date: "2026-08-11" } },
  ]);
  assertEquals(p.event?.event_type, "task_postponed");
  assertEquals(p.event?.meta.delay_days, 7);
});

Deno.test("postpone physical-blueprint → tombstone original (Skipped) + INSERT Pending at new date", () => {
  const p = plan({ action: "postpone", isGhost: false, source: src(), newDate: "2026-08-05" });
  assertEquals(p.ops.length, 2);
  assertEquals(p.ops[0], { kind: "update_by_id", id: "task-uuid", set: { status: "Skipped" }, guardNeq: { status: "Skipped" } });
  const ins = rec(p.ops[1]);
  assertEquals(ins.kind, "insert");
  assertEquals(ins.values.status, "Pending");
  assertEquals(ins.values.due_date, "2026-08-05");
  assertEquals(ins.tolerateConflict, true);
  assertEquals(p.event?.meta.delay_days, 1);
});

Deno.test("postpone ghost → INSERT Skipped tombstone (onConflict) + INSERT Pending (tolerate)", () => {
  const p = plan({ action: "postpone", isGhost: true, source: src(), newDate: "2026-08-05" });
  assertEquals(p.ops.length, 2);
  const tomb = rec(p.ops[0]);
  assertEquals(tomb.kind, "insert");
  assertEquals(tomb.values.status, "Skipped");
  assertEquals(tomb.values.due_date, "2026-08-04");
  assertEquals(tomb.onConflict.set, { status: "Skipped" });
  const pending = rec(p.ops[1]);
  assertEquals(pending.values.status, "Pending");
  assertEquals(pending.values.due_date, "2026-08-05");
  assertEquals(pending.tolerateConflict, true);
});

Deno.test("postpone ghost of an unsupported type → 422", () => {
  assertEquals(plan({ action: "postpone", isGhost: true, source: src({ type: "Feeding" }), newDate: "2026-08-05" }).error?.code, "unsupported_type");
});

// ── DELETE ───────────────────────────────────────────────────────────────────

Deno.test("delete standalone → hard DELETE by id + task_skipped event", () => {
  const p = plan({ action: "delete", isGhost: false, blueprintId: null, source: src({ blueprint_id: null }) });
  assertEquals(p.ops, [{ kind: "delete_by_id", id: "task-uuid" }]);
  assertEquals(p.event?.event_type, "task_skipped");
});

Deno.test("delete physical-blueprint → tombstone (Skipped), NEVER hard delete", () => {
  const p = plan({ action: "delete", isGhost: false, source: src() });
  assertEquals(p.ops, [{ kind: "update_by_id", id: "task-uuid", set: { status: "Skipped" }, guardNeq: { status: "Skipped" } }]);
  assertEquals(p.event?.event_type, "task_skipped");
});

Deno.test("delete ghost → INSERT Skipped tombstone with onConflict", () => {
  const p = plan({ action: "delete", isGhost: true, source: src() });
  const op = rec(p.ops[0]);
  assertEquals(op.kind, "insert");
  assertEquals(op.values.status, "Skipped");
  assertEquals(op.onConflict.set, { status: "Skipped" });
  assertEquals(p.event?.event_type, "task_skipped");
});

Deno.test("delete series → DELETE the blueprint (cascade) + blueprint_deleted event", () => {
  const p = plan({ action: "delete", isGhost: false, source: src(), deleteSeries: true });
  assertEquals(p.ops, [{ kind: "delete_blueprint", id: "bp-1" }]);
  assertEquals(p.event?.event_type, "blueprint_deleted");
  assertEquals(p.event?.meta.blueprint_id, "bp-1");
});

Deno.test("delete series with no blueprint falls back to a single-occurrence dismiss", () => {
  const p = plan({ action: "delete", isGhost: false, source: src({ blueprint_id: null }), blueprintId: null, deleteSeries: true });
  assertEquals(p.ops, [{ kind: "delete_by_id", id: "task-uuid" }]);
  assertEquals(p.event?.event_type, "task_skipped");
});

// ── Type-check set + auto-journal pure helpers ───────────────────────────────

Deno.test("ALLOWED_TASK_TYPES matches the live tasks_type_check (excludes Feeding)", () => {
  assertEquals(isMaterialisable("Fertilizing"), true);
  assertEquals(isMaterialisable("Pruning"), true);
  assertEquals(isMaterialisable("Feeding"), false);
  assertEquals(ALLOWED_TASK_TYPES.has("Pest Control"), true);
});

Deno.test("shouldAutoCreate only when the task type is an enabled category", () => {
  assertEquals(shouldAutoCreate("Watering", []), false);
  assertEquals(shouldAutoCreate("Watering", ["Pruning"]), false);
  assertEquals(shouldAutoCreate("Watering", ["Watering", "Pruning"]), true);
});

Deno.test("buildAutoEntryCopy formats subject/description by plant count", () => {
  assertEquals(buildAutoEntryCopy({ title: "Water the beds", type: "Watering" }, []), {
    subject: "Watered",
    description: "Water the beds",
  });
  assertEquals(buildAutoEntryCopy({ title: "Water the beds", type: "Watering" }, ["Tomato"]).subject, "Watered · Tomato");
  const many = buildAutoEntryCopy({ title: "Water the beds", type: "Watering" }, ["Tomato", "Basil"]);
  assertEquals(many.subject, "Watered · 2 plants");
  assertEquals(many.description, "Water the beds\n\nPlants: Tomato, Basil");
});
