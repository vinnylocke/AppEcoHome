import { assertEquals } from "@std/assert";
import { diffGapLog, gapKey, gapTitle, type OpenLogEntry } from "@shared/managerLog.ts";

Deno.test("gapKey + gapTitle", () => {
  assertEquals(gapKey("year_round_colour", "bare_seasons"), "year_round_colour:bare_seasons");
  assertEquals(gapTitle("no_edibles"), "Start growing something edible");
  assertEquals(gapTitle("unknown_code"), "Worth a look");
});

Deno.test("diffGapLog — opens newly detected gaps not already tracked", () => {
  const open: OpenLogEntry[] = [{ id: "1", target_id: "year_round_colour:bare_seasons" }];
  const { closeIds, openKeys } = diffGapLog(
    ["year_round_colour:bare_seasons", "grow_your_own:no_edibles"],
    open,
  );
  assertEquals(closeIds, []);
  assertEquals(openKeys, ["grow_your_own:no_edibles"]);
});

Deno.test("diffGapLog — closes entries whose gap has gone", () => {
  const open: OpenLogEntry[] = [
    { id: "1", target_id: "year_round_colour:bare_seasons" },
    { id: "2", target_id: "grow_your_own:no_edibles" },
  ];
  const { closeIds, openKeys } = diffGapLog(["grow_your_own:no_edibles"], open);
  assertEquals(closeIds, ["1"]);
  assertEquals(openKeys, []);
});

Deno.test("diffGapLog — simultaneous open + close", () => {
  const open: OpenLogEntry[] = [{ id: "1", target_id: "attract_wildlife:no_wildlife_plants" }];
  const { closeIds, openKeys } = diffGapLog(["grow_your_own:no_edibles"], open);
  assertEquals(closeIds, ["1"]);
  assertEquals(openKeys, ["grow_your_own:no_edibles"]);
});

Deno.test("diffGapLog — no gaps + no open entries → no-op", () => {
  assertEquals(diffGapLog([], []), { closeIds: [], openKeys: [] });
});

Deno.test("diffGapLog — ignores open entries with null target_id", () => {
  const open: OpenLogEntry[] = [{ id: "x", target_id: null }];
  const { closeIds, openKeys } = diffGapLog(["grow_your_own:no_edibles"], open);
  assertEquals(closeIds, []);
  assertEquals(openKeys, ["grow_your_own:no_edibles"]);
});
