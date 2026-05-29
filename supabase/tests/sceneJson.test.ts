import { assertEquals } from "@std/assert";
import { parseSceneJson } from "@shared/sceneJson.ts";

Deno.test("parseSceneJson — clean JSON", () => {
  const out = parseSceneJson('{"notes":"ok","regions":[{"box_2d":[1,2,3,4],"candidates":[]}]}');
  assertEquals(out.notes, "ok");
  assertEquals((out.regions ?? []).length, 1);
});

Deno.test("parseSceneJson — strips a code fence", () => {
  const out = parseSceneJson('```json\n{"regions":[{"box_2d":[0,0,10,10],"candidates":[]}]}\n```');
  assertEquals((out.regions ?? []).length, 1);
});

Deno.test("parseSceneJson — strips a prose preamble", () => {
  const out = parseSceneJson('Here is the analysis:\n{"notes":"x","regions":[{"box_2d":[0,0,5,5],"candidates":[]}]}');
  assertEquals(out.notes, "x");
  assertEquals((out.regions ?? []).length, 1);
});

Deno.test("parseSceneJson — salvages complete regions from a truncated array", () => {
  // Truncated mid-third-object (no closing array/brace).
  const truncated =
    '{"notes":"x","regions":[' +
    '{"box_2d":[0,0,10,10],"candidates":[{"name":"Basil","confidence":80}]},' +
    '{"box_2d":[20,20,40,40],"candidates":[{"name":"Mint","confidence":60}]},' +
    '{"box_2d":[50,50,';
  const out = parseSceneJson(truncated);
  assertEquals((out.regions ?? []).length, 2);
});

Deno.test("parseSceneJson — unrecoverable input → empty regions, never throws", () => {
  const out = parseSceneJson("Here is the answer but no JSON at all.");
  assertEquals(out.regions, []);
});

Deno.test("parseSceneJson — null/empty input → empty regions", () => {
  assertEquals(parseSceneJson("").regions, []);
  // deno-lint-ignore no-explicit-any
  assertEquals(parseSceneJson(null as any).regions, []);
});
