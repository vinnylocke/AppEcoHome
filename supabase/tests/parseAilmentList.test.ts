import { assert, assertEquals } from "@std/assert";
import {
  AILMENT_PARSE_SCHEMA,
  buildAilmentParsePrompt,
  MAX_AILMENT_CANDIDATES,
  normaliseAilments,
  normaliseAilmentType,
} from "@shared/ailmentListParse.ts";

// ── prompt + schema ──────────────────────────────────────────────────────────

Deno.test("buildAilmentParsePrompt — embeds the paste + lists the three types", () => {
  const p = buildAilmentParsePrompt("Aphids\nBlack spot");
  assert(p.includes("Aphids\nBlack spot"));
  assert(p.includes("pest"));
  assert(p.includes("disease"));
  assert(p.includes("invasive_plant"));
  assert(p.includes("JSON only"));
});

Deno.test("schema requires name + type, wraps the ailments array", () => {
  const items = AILMENT_PARSE_SCHEMA.properties.ailments.items;
  assertEquals((items.required as readonly string[]).slice(), ["name", "type"]);
  assert(AILMENT_PARSE_SCHEMA.required.includes("ailments"));
});

// ── type normalisation ───────────────────────────────────────────────────────

Deno.test("normaliseAilmentType — canonical values pass through", () => {
  assertEquals(normaliseAilmentType("pest"), "pest");
  assertEquals(normaliseAilmentType("disease"), "disease");
  assertEquals(normaliseAilmentType("invasive_plant"), "invasive_plant");
});

Deno.test("normaliseAilmentType — 'invasive plant' / 'invasive' / 'weed' → invasive_plant", () => {
  assertEquals(normaliseAilmentType("Invasive Plant"), "invasive_plant");
  assertEquals(normaliseAilmentType("invasive"), "invasive_plant");
  assertEquals(normaliseAilmentType("weed"), "invasive_plant");
});

Deno.test("normaliseAilmentType — unknown / missing → disease default", () => {
  assertEquals(normaliseAilmentType("bogus"), "disease");
  assertEquals(normaliseAilmentType(null), "disease");
  assertEquals(normaliseAilmentType(undefined), "disease");
});

// ── row normalisation ────────────────────────────────────────────────────────

Deno.test("normaliseAilments — clean rows map through with symptoms", () => {
  const rows = normaliseAilments({
    ailments: [
      { name: "Aphids", type: "pest", symptoms: ["Sticky leaves", "Curled shoots"], notes: "on roses" },
      { name: "Powdery mildew", type: "disease", symptoms: [], notes: null },
    ],
  });
  assertEquals(rows.length, 2);
  assertEquals(rows[0].name, "Aphids");
  assertEquals(rows[0].type, "pest");
  assertEquals(rows[0].symptoms, ["Sticky leaves", "Curled shoots"]);
  assertEquals(rows[0].notes, "on roses");
  assertEquals(rows[1].symptoms, []);
  assertEquals(rows[1].notes, null);
});

Deno.test("normaliseAilments — drops nameless rows + coerces bad type", () => {
  const rows = normaliseAilments({
    ailments: [
      { name: "", type: "pest" },
      { name: "Knotweed", type: "invasive" },
      { name: "Mystery", type: "gibberish" },
    ],
  });
  assertEquals(rows.length, 2);
  assertEquals(rows[0].name, "Knotweed");
  assertEquals(rows[0].type, "invasive_plant");
  assertEquals(rows[1].type, "disease");
});

Deno.test("normaliseAilments — garbage input → empty array", () => {
  assertEquals(normaliseAilments(null), []);
  assertEquals(normaliseAilments("not json"), []);
  assertEquals(normaliseAilments({}), []);
  assertEquals(normaliseAilments({ ailments: "nope" }), []);
});

Deno.test("normaliseAilments — caps at MAX_AILMENT_CANDIDATES", () => {
  const many = Array.from({ length: MAX_AILMENT_CANDIDATES + 25 }, (_, i) => ({
    name: `Ailment ${i}`,
    type: "pest",
  }));
  const rows = normaliseAilments({ ailments: many });
  assertEquals(rows.length, MAX_AILMENT_CANDIDATES);
});
