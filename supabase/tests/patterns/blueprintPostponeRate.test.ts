import { assertEquals } from "@std/assert";
import blueprintPostponeRate from "@shared/patterns/blueprintPostponeRate.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";
import { makeUserEvent } from "../fixtures/patternData.ts";

// Fires when a blueprint has been postponed >= 4 times in 30 days.
// THRESHOLD = 4, WINDOW_DAYS = 30.
// Ghost task IDs: "ghost-<blueprint_id>-YYYY-MM-DD" — parsed without a DB lookup.
// Physical task IDs: looked up in `tasks` table to resolve blueprint_id.
//
// Ghost ID parsing: strip "ghost-" (6 chars) prefix, then strip last 11 chars ("-YYYY-MM-DD")
// Blueprint ID used in tests: "bp-test-1234-abc" (16 chars)
// Ghost task IDs:  "ghost-bp-test-1234-abc-2026-05-01", "ghost-bp-test-1234-abc-2026-05-02" …

const USER = "user-1";
const HOME = "home-1";
const BP_ID = "bp-test-1234-abc";

function ghostPostpone(date: string) {
  return makeUserEvent({
    user_id: USER,
    event_type: "task_postponed",
    meta: { task_id: `ghost-${BP_ID}-${date}` },
  });
}

function physicalPostpone(taskId: string) {
  return makeUserEvent({
    user_id: USER,
    event_type: "task_postponed",
    meta: { task_id: taskId },
  });
}

Deno.test("blueprintPostponeRate — hit from 4 ghost task postponements", async () => {
  const db = makeMockDb({
    user_events: [
      ghostPostpone("2026-05-01"),
      ghostPostpone("2026-05-08"),
      ghostPostpone("2026-05-15"),
      ghostPostpone("2026-05-22"),
    ],
    task_blueprints: [{ id: BP_ID, title: "Weekly Watering" }],
  });
  const hits = await blueprintPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].blueprintId, BP_ID);
});

Deno.test("blueprintPostponeRate — rawData includes count and task_name", async () => {
  const db = makeMockDb({
    user_events: [
      ghostPostpone("2026-05-01"),
      ghostPostpone("2026-05-08"),
      ghostPostpone("2026-05-15"),
      ghostPostpone("2026-05-22"),
    ],
    task_blueprints: [{ id: BP_ID, title: "Weekly Watering" }],
  });
  const hits = await blueprintPostponeRate.detect(USER, HOME, db as any);
  assertEquals((hits[0].rawData as any).count, 4);
  assertEquals((hits[0].rawData as any).task_name, "Weekly Watering");
});

Deno.test("blueprintPostponeRate — no hit when count < 4", async () => {
  const db = makeMockDb({
    user_events: [
      ghostPostpone("2026-05-01"),
      ghostPostpone("2026-05-08"),
      ghostPostpone("2026-05-15"),
    ],
    task_blueprints: [{ id: BP_ID, title: "Weekly Watering" }],
  });
  const hits = await blueprintPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("blueprintPostponeRate — hit from physical task postponements (DB lookup)", async () => {
  // The code increments physicalCounts once per unique task ROW returned, not per event.
  // So 4 different physical task IDs (each postponed once) → count = 4 → threshold met.
  const taskIds = ["task-p1", "task-p2", "task-p3", "task-p4"];
  const db = makeMockDb({
    user_events: taskIds.map((tid) => physicalPostpone(tid)),
    tasks: taskIds.map((tid) => ({ id: tid, blueprint_id: BP_ID })),
    task_blueprints: [{ id: BP_ID, title: "Monthly Pruning" }],
  });
  const hits = await blueprintPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].blueprintId, BP_ID);
});

Deno.test("blueprintPostponeRate — combines ghost + physical postponements for same blueprint", async () => {
  // 2 ghost events (parsed directly) + 2 different physical tasks (resolved via DB) = 4 total
  const db = makeMockDb({
    user_events: [
      ghostPostpone("2026-05-01"),
      ghostPostpone("2026-05-08"),
      physicalPostpone("task-phys-a"),
      physicalPostpone("task-phys-b"),
    ],
    tasks: [
      { id: "task-phys-a", blueprint_id: BP_ID },
      { id: "task-phys-b", blueprint_id: BP_ID },
    ],
    task_blueprints: [{ id: BP_ID, title: "Fortnightly Feed" }],
  });
  const hits = await blueprintPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals((hits[0].rawData as any).count, 4);
});

Deno.test("blueprintPostponeRate — no hit when there are no postponement events", async () => {
  const db = makeMockDb({ user_events: [] });
  const hits = await blueprintPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});
