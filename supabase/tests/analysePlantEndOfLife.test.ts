import { assertEquals, assert, assertStringIncludes } from "@std/assert";
import {
  buildAnalysisPrompt,
  ANALYSIS_RESPONSE_SCHEMA,
  type AnalysisContext,
} from "../functions/analyse-plant-end-of-life/prompt.ts";

function makeContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    plantName: "Sungold Tomato",
    daysAlive: 90,
    journalEntries: [],
    tasks: [],
    ailments: [],
    ...overrides,
  };
}

Deno.test("buildAnalysisPrompt: includes plant name + days alive", () => {
  const out = buildAnalysisPrompt(makeContext());
  assertStringIncludes(out, "Sungold Tomato");
  assertStringIncludes(out, "Days alive in this home: 90");
});

Deno.test("buildAnalysisPrompt: cultivar wrapped in parentheses when set", () => {
  const out = buildAnalysisPrompt(
    makeContext({ plantName: "Tomato", cultivar: "Sungold" }),
  );
  assertStringIncludes(out, "Tomato (Sungold)");
});

Deno.test("buildAnalysisPrompt: marks empty journal explicitly", () => {
  const out = buildAnalysisPrompt(makeContext({ journalEntries: [] }));
  assertStringIncludes(out, "(no journal entries)");
});

Deno.test("buildAnalysisPrompt: lists journal entries chronologically", () => {
  const out = buildAnalysisPrompt(
    makeContext({
      journalEntries: [
        { subject: "Sown", description: "From packet A", created_at: "2026-03-01T10:00:00Z" },
        { subject: "First true leaves", description: null, created_at: "2026-03-20T10:00:00Z" },
      ],
    }),
  );
  assertStringIncludes(out, "2026-03-01 · Sown — From packet A");
  assertStringIncludes(out, "2026-03-20 · First true leaves");
  // Newer entry should appear after the older one in the prompt text.
  const a = out.indexOf("2026-03-01");
  const b = out.indexOf("2026-03-20");
  assert(a < b, "journal entries must be in chronological order");
});

Deno.test("buildAnalysisPrompt: summarises task counts", () => {
  const out = buildAnalysisPrompt(
    makeContext({
      tasks: [
        { title: "Water", type: "Watering", status: "Completed", due_date: "2026-04-01" },
        { title: "Water", type: "Watering", status: "Completed", due_date: "2026-04-04" },
        { title: "Prune", type: "Pruning", status: "Skipped", due_date: "2026-04-10" },
      ],
    }),
  );
  assertStringIncludes(out, "Completed=2");
  assertStringIncludes(out, "Skipped=1");
});

Deno.test("buildAnalysisPrompt: marks empty tasks explicitly", () => {
  const out = buildAnalysisPrompt(makeContext({ tasks: [] }));
  assertStringIncludes(out, "(no tasks recorded for this plant)");
});

Deno.test("buildAnalysisPrompt: lists linked ailments with type chips", () => {
  const out = buildAnalysisPrompt(
    makeContext({
      ailments: [
        { name: "Aphids", type: "pest" },
        { name: "Powdery mildew", type: "disease" },
      ],
    }),
  );
  assertStringIncludes(out, "Aphids (pest)");
  assertStringIncludes(out, "Powdery mildew (disease)");
});

Deno.test("buildAnalysisPrompt: formats area + location facts", () => {
  const out = buildAnalysisPrompt(
    makeContext({
      areaName: "Greenhouse",
      areaContext: {
        lux: 50000,
        ph: 6.4,
        soil: "Potting mix",
        waterMovement: "Well-drained",
      },
      locationContext: { placement: "Outside", postcode: "SW1 1AA" },
    }),
  );
  assertStringIncludes(out, "Area: Greenhouse");
  assertStringIncludes(out, "Lux: 50000");
  assertStringIncludes(out, "pH: 6.4");
  assertStringIncludes(out, "Soil: Potting mix");
  assertStringIncludes(out, "Water movement: Well-drained");
  assertStringIncludes(out, "Postcode: SW1 1AA");
});

Deno.test("buildAnalysisPrompt: weather summary appended when present", () => {
  const out = buildAnalysisPrompt(
    makeContext({ weatherSummary: "Hot dry spell with 0.1 mm rain over 14 days." }),
  );
  assertStringIncludes(out, "Recent weather summary:");
  assertStringIncludes(out, "Hot dry spell");
});

Deno.test("buildAnalysisPrompt: gardener's closing note appended when present", () => {
  const out = buildAnalysisPrompt(
    makeContext({ endSummary: "Looked sad after the heatwave, never recovered." }),
  );
  assertStringIncludes(out, "Gardener's closing note:");
  assertStringIncludes(out, "Looked sad after the heatwave");
});

Deno.test("ANALYSIS_RESPONSE_SCHEMA: top-level shape matches contract", () => {
  assertEquals(ANALYSIS_RESPONSE_SCHEMA.type, "OBJECT");
  assertEquals(ANALYSIS_RESPONSE_SCHEMA.required, [
    "likely_causes",
    "prevention_next_time",
    "affirmation",
  ]);
});
