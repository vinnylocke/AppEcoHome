import { test, expect } from "@playwright/test";
import {
  signInAs,
  workerHomeId,
  workerPlantId,
  workerBlueprintId,
  workerTaskId,
} from "../utils/rlsAssertions";

// ─────────────────────────────────────────────────────────────────────────
// rls-isolation-db.spec.ts
//
// DB-level cross-home isolation sweep. Each test signs in as worker 1
// (test1@rhozly.com) with the publishable key and queries the canonical
// seed data of worker 2 directly. The RLS policies must:
//   • return zero rows on cross-home SELECT
//   • silently reject cross-home INSERT / UPDATE / DELETE (no rows
//     written, no exception leak that would expose the row's existence)
//
// These tests complement the UI-level data-isolation.spec.ts. UI tests
// catch "the surface hides this"; these catch "the policy denies this".
// The publishable key is mandatory — service-role bypasses RLS and would
// silently invalidate the entire suite.
// ─────────────────────────────────────────────────────────────────────────

test.describe("RLS — cross-home isolation (DB-level)", () => {
  test("RLS-001: SELECT tasks for another home returns zero rows", async () => {
    const supabase = await signInAs(0);
    const otherHomeId = workerHomeId(1);

    const { data, error } = await supabase
      .from("tasks")
      .select("id")
      .eq("home_id", otherHomeId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("RLS-002: SELECT plants for another home returns zero rows", async () => {
    const supabase = await signInAs(0);
    const otherHomeId = workerHomeId(1);

    const { data, error } = await supabase
      .from("plants")
      .select("id")
      .eq("home_id", otherHomeId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("RLS-003: SELECT chat_messages where user_id != self returns zero rows", async () => {
    // chat_messages is a per-user table (USING user_id = auth.uid()).
    // Worker 1 must not see worker 2's chat rows even though they share
    // a publishable key.
    const supabase = await signInAs(0);
    const otherUserHomeId = workerHomeId(1);

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("home_id", otherUserHomeId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("RLS-004: INSERT a task for another home is rejected", async () => {
    const supabase = await signInAs(0);
    const otherHomeId = workerHomeId(1);

    const { data, error } = await supabase.from("tasks").insert({
      home_id: otherHomeId,
      title: "RLS test — should never persist",
      type: "Watering",
      status: "Pending",
      due_date: new Date().toISOString().slice(0, 10),
      scope: "home",
    }).select();

    // The WITH CHECK clause denies the row. Postgres surfaces this as
    // either a 42501 (policy violation) error or an empty data array
    // depending on whether RLS RETURNING short-circuits.
    if (error) {
      expect(error.code === "42501" || error.message.match(/row.level security/i)).toBeTruthy();
    } else {
      expect(data).toEqual([]);
    }
  });

  test("RLS-005: UPDATE another home's plant affects zero rows", async () => {
    const supabase = await signInAs(0);
    const targetPlantId = workerPlantId(1, 1); // worker 2's first plant

    const { data, error } = await supabase
      .from("plants")
      .update({ care_level: "Test" })
      .eq("id", targetPlantId)
      .select();

    // Either the policy denies (error.code = 42501) or the eq() simply
    // matches zero rows because the SELECT-side of RLS hides the target.
    // Both outcomes satisfy "the row is safe".
    if (error) {
      expect(error.code === "42501" || error.message.match(/row.level security/i)).toBeTruthy();
    } else {
      expect(data).toEqual([]);
    }

    // Cross-confirm via worker 2's session — the care_level must not be "Test".
    const supabaseW2 = await signInAs(1);
    const { data: confirm } = await supabaseW2
      .from("plants")
      .select("care_level")
      .eq("id", targetPlantId)
      .single();
    expect(confirm?.care_level).not.toBe("Test");
  });

  test("RLS-006: DELETE another home's blueprint affects zero rows", async () => {
    const supabase = await signInAs(0);
    const targetBlueprintId = workerBlueprintId(1, 1); // worker 2's first blueprint

    const { data, error } = await supabase
      .from("task_blueprints")
      .delete()
      .eq("id", targetBlueprintId)
      .select();

    if (error) {
      expect(error.code === "42501" || error.message.match(/row.level security/i)).toBeTruthy();
    } else {
      expect(data).toEqual([]);
    }

    // Cross-confirm — the blueprint still exists from worker 2's side.
    const supabaseW2 = await signInAs(1);
    const { data: confirm } = await supabaseW2
      .from("task_blueprints")
      .select("id")
      .eq("id", targetBlueprintId)
      .maybeSingle();
    expect(confirm?.id).toBe(targetBlueprintId);
  });
});
