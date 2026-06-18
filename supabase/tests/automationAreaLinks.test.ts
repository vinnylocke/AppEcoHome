import { assertEquals } from "@std/assert";
import { uniqueAutomationIds } from "@shared/automationAreaLinks.ts";

Deno.test("unions automation_devices + automation_actions links and dedupes", () => {
  const fromDevices = [{ automation_id: "a" }, { automation_id: "b" }];
  const fromActions = [{ automation_id: "b" }, { automation_id: "c" }];
  assertEquals(uniqueAutomationIds(fromDevices, fromActions).sort(), ["a", "b", "c"]);
});

Deno.test("handles null/undefined/empty lists", () => {
  assertEquals(uniqueAutomationIds(null, undefined, []), []);
  assertEquals(uniqueAutomationIds([{ automation_id: "x" }], null), ["x"]);
});

Deno.test("skips rows without an automation_id", () => {
  assertEquals(
    uniqueAutomationIds([{ automation_id: "" }, { automation_id: "y" }] as Array<{ automation_id: string }>),
    ["y"],
  );
});
