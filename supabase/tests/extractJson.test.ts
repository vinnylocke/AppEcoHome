import { assert, assertEquals } from "@std/assert";
import { extractJsonObject } from "@shared/extractJson.ts";

Deno.test("extractJsonObject — clean JSON object", () => {
  assertEquals(extractJsonObject('{"a":1}'), { a: 1 });
});

Deno.test("extractJsonObject — strips a ```json fence", () => {
  assertEquals(extractJsonObject("```json\n{\"name\":\"Rose\"}\n```"), { name: "Rose" });
});

Deno.test("extractJsonObject — bare ``` fence", () => {
  assertEquals(extractJsonObject("```\n{\"x\":true}\n```"), { x: true });
});

Deno.test("extractJsonObject — prose preamble + suffix", () => {
  assertEquals(
    extractJsonObject('Here is the identification: {"plant":"Basil"}. Hope this helps!'),
    { plant: "Basil" },
  );
});

Deno.test("extractJsonObject — array payload", () => {
  assertEquals(extractJsonObject("Results:\n[1,2,3]"), [1, 2, 3]);
});

Deno.test("extractJsonObject — throws on empty / unrecoverable", () => {
  let threw = false;
  try { extractJsonObject(""); } catch { threw = true; }
  assert(threw);
  threw = false;
  try { extractJsonObject("totally not json"); } catch { threw = true; }
  assert(threw);
});
