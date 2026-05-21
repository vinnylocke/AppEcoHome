import { assertEquals, assert, assertStringIncludes } from "@std/assert";
import {
  buildGrowGuidePrompt,
  diffGrowGuide,
  GROW_GUIDE_CATEGORIES,
  GROW_GUIDE_SCHEMA,
  type GuideSection,
  type PlantGrowGuide,
} from "@shared/growGuide.ts";

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function makeSection(overrides: Partial<GuideSection> = {}): GuideSection {
  return {
    category: "water",
    applicable: true,
    title: "Watering",
    summary: "Water deeply every few days.",
    key_facts: [{ label: "Frequency", value: "Every 3-4 days" }],
    steps: [],
    tips: ["Avoid wet leaves."],
    notes: null,
    ...overrides,
  };
}

function makeGuide(sections: GuideSection[] = []): PlantGrowGuide {
  // Pad to 9 sections so the diff helper sees a complete envelope when
  // tests don't care about the others.
  const defaults: GuideSection[] = GROW_GUIDE_CATEGORIES.map((c) =>
    makeSection({ category: c, title: c }),
  );
  const map = new Map(defaults.map((s) => [s.category, s]));
  for (const s of sections) map.set(s.category, s);
  return {
    schema_version: 1,
    generated_at: "2026-05-21T10:00:00Z",
    sections: GROW_GUIDE_CATEGORIES.map((c) => map.get(c)!),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GROW_GUIDE_SCHEMA
// ─────────────────────────────────────────────────────────────────────────

Deno.test("GROW_GUIDE_SCHEMA — top-level shape is OBJECT with sections array", () => {
  assertEquals(GROW_GUIDE_SCHEMA.type, "OBJECT");
  assertEquals(GROW_GUIDE_SCHEMA.properties.sections.type, "ARRAY");
  assertEquals(GROW_GUIDE_SCHEMA.required, [
    "schema_version",
    "generated_at",
    "sections",
  ]);
});

Deno.test("GROW_GUIDE_SCHEMA — category enum covers all 9 categories", () => {
  // deno-lint-ignore no-explicit-any
  const enumValues = (GROW_GUIDE_SCHEMA.properties.sections.items as any).properties
    .category.enum;
  assertEquals(enumValues.length, 9);
  for (const c of GROW_GUIDE_CATEGORIES) {
    assert(enumValues.includes(c), `enum missing category ${c}`);
  }
});

Deno.test("GROW_GUIDE_SCHEMA — section requires the uniform skeleton fields", () => {
  // deno-lint-ignore no-explicit-any
  const required = (GROW_GUIDE_SCHEMA.properties.sections.items as any).required;
  for (const field of ["category", "applicable", "title", "summary", "key_facts", "steps", "tips"]) {
    assert(required.includes(field), `section missing required field ${field}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// buildGrowGuidePrompt
// ─────────────────────────────────────────────────────────────────────────

Deno.test("buildGrowGuidePrompt — includes common + scientific name", () => {
  const prompt = buildGrowGuidePrompt({
    commonName: "Tomato",
    scientificName: "Solanum lycopersicum",
    source: "ai",
    hemisphere: "Northern",
    currentDate: "2026-05-21",
  });
  assertStringIncludes(prompt, '"Tomato"');
  assertStringIncludes(prompt, "Solanum lycopersicum");
});

Deno.test("buildGrowGuidePrompt — handles missing scientific name", () => {
  const prompt = buildGrowGuidePrompt({
    commonName: "Brandywine",
    scientificName: null,
    source: "manual",
    hemisphere: "Northern",
    currentDate: "2026-05-21",
  });
  assertStringIncludes(prompt, "Scientific name unknown");
});

Deno.test("buildGrowGuidePrompt — manual notes appear only for manual source", () => {
  const manualPrompt = buildGrowGuidePrompt({
    commonName: "Heritage Tomato",
    scientificName: null,
    source: "manual",
    manualNotes: "Grandma's variety from 1962",
    hemisphere: "Northern",
    currentDate: "2026-05-21",
  });
  assertStringIncludes(manualPrompt, "Grandma's variety from 1962");

  const apiPrompt = buildGrowGuidePrompt({
    commonName: "Tomato",
    scientificName: "Solanum lycopersicum",
    source: "api",
    manualNotes: "Grandma's variety from 1962",
    hemisphere: "Northern",
    currentDate: "2026-05-21",
  });
  // API source ignores manualNotes — those are only relevant for manual plants.
  assert(!apiPrompt.includes("Grandma's variety from 1962"));
});

Deno.test("buildGrowGuidePrompt — threads hemisphere into timing calibration", () => {
  const sh = buildGrowGuidePrompt({
    commonName: "Tomato",
    scientificName: null,
    source: "ai",
    hemisphere: "Southern",
    currentDate: "2026-05-21",
  });
  assertStringIncludes(sh, "Southern");
  assertStringIncludes(sh, "Sept–Nov");
});

Deno.test("buildGrowGuidePrompt — names all 9 categories in the required order", () => {
  const prompt = buildGrowGuidePrompt({
    commonName: "Tomato",
    scientificName: null,
    source: "ai",
    hemisphere: "Northern",
    currentDate: "2026-05-21",
  });
  const idx = (s: string) => prompt.indexOf(s);
  assert(idx("water") < idx("soil"));
  assert(idx("soil") < idx("sunlight"));
  assert(idx("sunlight") < idx("propagation"));
  assert(idx("propagation") < idx("germination"));
  assert(idx("germination") < idx("pruning"));
  assert(idx("pruning") < idx("flowering"));
  assert(idx("flowering") < idx("harvesting"));
  assert(idx("harvesting") < idx("senescence"));
});

// ─────────────────────────────────────────────────────────────────────────
// diffGrowGuide
// ─────────────────────────────────────────────────────────────────────────

Deno.test("diffGrowGuide — null oldGuide returns every category", () => {
  const result = diffGrowGuide(null, makeGuide());
  assertEquals(result.length, 9);
});

Deno.test("diffGrowGuide — identical guides return empty list", () => {
  const a = makeGuide();
  const b = makeGuide();
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — summary change is detected on one category", () => {
  const a = makeGuide();
  const b = makeGuide([
    makeSection({ category: "water", summary: "Water deeply every 5 days." }),
  ]);
  assertEquals(diffGrowGuide(a, b), ["water"]);
});

Deno.test("diffGrowGuide — applicable flip from true→false is a change", () => {
  const a = makeGuide([makeSection({ category: "harvesting", applicable: true })]);
  const b = makeGuide([makeSection({ category: "harvesting", applicable: false })]);
  assertEquals(diffGrowGuide(a, b), ["harvesting"]);
});

Deno.test("diffGrowGuide — cosmetic case differences in summary are ignored", () => {
  const a = makeGuide([makeSection({ category: "water", summary: "Water Deeply Every 3 Days." })]);
  const b = makeGuide([makeSection({ category: "water", summary: "water deeply every 3 days." })]);
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — trailing whitespace in summary is ignored", () => {
  const a = makeGuide([makeSection({ category: "water", summary: "Water deeply." })]);
  const b = makeGuide([makeSection({ category: "water", summary: "  Water deeply.   " })]);
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — key_facts reordering is ignored", () => {
  const a = makeGuide([
    makeSection({
      category: "water",
      key_facts: [
        { label: "Frequency", value: "Every 3 days" },
        { label: "Method", value: "Soil level" },
      ],
    }),
  ]);
  const b = makeGuide([
    makeSection({
      category: "water",
      key_facts: [
        { label: "Method", value: "Soil level" },
        { label: "Frequency", value: "Every 3 days" },
      ],
    }),
  ]);
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — added key_fact is a change", () => {
  const a = makeGuide([
    makeSection({
      category: "water",
      key_facts: [{ label: "Frequency", value: "Every 3 days" }],
    }),
  ]);
  const b = makeGuide([
    makeSection({
      category: "water",
      key_facts: [
        { label: "Frequency", value: "Every 3 days" },
        { label: "Volume", value: "1L per plant" },
      ],
    }),
  ]);
  assertEquals(diffGrowGuide(a, b), ["water"]);
});

Deno.test("diffGrowGuide — tips reordering is ignored", () => {
  const a = makeGuide([
    makeSection({ category: "water", tips: ["Tip A", "Tip B"] }),
  ]);
  const b = makeGuide([
    makeSection({ category: "water", tips: ["Tip B", "Tip A"] }),
  ]);
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — steps order DOES matter (positional how-to)", () => {
  const a = makeGuide([
    makeSection({
      category: "propagation",
      steps: [
        { step: 1, title: "Take cutting", detail: "..." },
        { step: 2, title: "Strip leaves", detail: "..." },
      ],
    }),
  ]);
  const b = makeGuide([
    makeSection({
      category: "propagation",
      steps: [
        { step: 1, title: "Strip leaves", detail: "..." },
        { step: 2, title: "Take cutting", detail: "..." },
      ],
    }),
  ]);
  assertEquals(diffGrowGuide(a, b), ["propagation"]);
});

Deno.test("diffGrowGuide — multiple categories changed are all returned", () => {
  const a = makeGuide();
  const b = makeGuide([
    makeSection({ category: "water", summary: "Different watering advice." }),
    makeSection({ category: "soil", summary: "Different soil advice." }),
    makeSection({ category: "harvesting", applicable: false }),
  ]);
  const changed = diffGrowGuide(a, b);
  // Set comparison because order in `b.sections` is canonical so result
  // is in category-list order; but we'll just check membership.
  assertEquals(changed.sort(), ["harvesting", "soil", "water"]);
});

Deno.test("diffGrowGuide — notes null→string is a change", () => {
  const a = makeGuide([makeSection({ category: "water", notes: null })]);
  const b = makeGuide([makeSection({ category: "water", notes: "Coastal microclimate" })]);
  assertEquals(diffGrowGuide(a, b), ["water"]);
});

// ─────────────────────────────────────────────────────────────────────────
// schedulable_tasks diff behaviour — additive field; missing/empty parity
// ─────────────────────────────────────────────────────────────────────────

Deno.test("diffGrowGuide — undefined vs empty schedulable_tasks is NOT a change", () => {
  const a = makeGuide([makeSection({ category: "water" })]); // no schedulable_tasks
  const b = makeGuide([makeSection({ category: "water", schedulable_tasks: [] })]);
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — adding a schedulable_task IS a change", () => {
  const a = makeGuide([makeSection({ category: "water", schedulable_tasks: [] })]);
  const b = makeGuide([
    makeSection({
      category: "water",
      schedulable_tasks: [
        {
          title: "Water Roma",
          description: "Deep water every 3 days.",
          task_type: "Watering",
          is_recurring: true,
          frequency_days: 3,
          active_months: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
          duration_days: null,
          priority: "Medium",
          depends_on_index: null,
        },
      ],
    }),
  ]);
  assertEquals(diffGrowGuide(a, b), ["water"]);
});

Deno.test("diffGrowGuide — schedulable_tasks reordering is NOT a change", () => {
  const task1 = {
    title: "Water Roma",
    description: "Deep water every 3 days.",
    task_type: "Watering" as const,
    is_recurring: true,
    frequency_days: 3,
    active_months: ["Apr", "May"] as ("Apr" | "May")[],
    duration_days: null,
    priority: "Medium" as const,
    depends_on_index: null,
  };
  const task2 = {
    title: "Feed Roma",
    description: "Weekly tomato feed.",
    task_type: "Fertilizing" as const,
    is_recurring: true,
    frequency_days: 7,
    active_months: ["May", "Jun"] as ("May" | "Jun")[],
    duration_days: null,
    priority: "Medium" as const,
    depends_on_index: null,
  };
  const a = makeGuide([
    makeSection({ category: "water", schedulable_tasks: [task1, task2] }),
  ]);
  const b = makeGuide([
    makeSection({ category: "water", schedulable_tasks: [task2, task1] }),
  ]);
  assertEquals(diffGrowGuide(a, b), []);
});

Deno.test("diffGrowGuide — schedulable_tasks active_months change IS a change", () => {
  const base = {
    title: "Water Roma",
    description: "Deep water every 3 days.",
    task_type: "Watering" as const,
    is_recurring: true,
    frequency_days: 3,
    duration_days: null,
    priority: "Medium" as const,
    depends_on_index: null,
  };
  const a = makeGuide([
    makeSection({
      category: "water",
      schedulable_tasks: [{ ...base, active_months: ["Apr", "May", "Jun"] }],
    }),
  ]);
  const b = makeGuide([
    makeSection({
      category: "water",
      schedulable_tasks: [{ ...base, active_months: ["Mar", "Apr", "May"] }],
    }),
  ]);
  assertEquals(diffGrowGuide(a, b), ["water"]);
});
