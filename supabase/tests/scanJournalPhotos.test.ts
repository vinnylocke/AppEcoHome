import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  GROWTH_STAGES,
  MAX_ACTIONS,
  MAX_PHOTOS_PER_HOME,
  PHOTO_OBSERVATION_SCHEMA,
  PHOTO_TASK_TYPES,
  buildPhotoPrompt,
  selectPhotos,
  shouldApplyStage,
  validateObservation,
  type CandidatePhoto,
} from "@shared/scanJournalPhotos.ts";

const TODAY = "2026-07-10";

function candidate(over: Partial<CandidatePhoto> = {}): CandidatePhoto {
  return {
    journal_id: crypto.randomUUID(),
    inventory_item_id: "item-1",
    image_url: "https://x/img.jpg",
    created_at: "2026-07-08T10:00:00Z",
    alreadyObserved: false,
    ...over,
  };
}

// ─── selectPhotos ────────────────────────────────────────────────────────────

Deno.test("SJP-001: unlinked photos (no inventory_item_id) are excluded", () => {
  const picked = selectPhotos([candidate({ inventory_item_id: null })], TODAY);
  assertEquals(picked.length, 0);
});

Deno.test("SJP-002: photos without an image are excluded", () => {
  const picked = selectPhotos([candidate({ image_url: null })], TODAY);
  assertEquals(picked.length, 0);
});

Deno.test("SJP-003: already-observed photos are excluded (one analysis ever)", () => {
  const picked = selectPhotos([candidate({ alreadyObserved: true })], TODAY);
  assertEquals(picked.length, 0);
});

Deno.test("SJP-004: photos older than the 14-day window are excluded", () => {
  const picked = selectPhotos([
    candidate({ journal_id: "old", created_at: "2026-06-25T00:00:00Z" }), // 15d ago
    candidate({ journal_id: "edge", created_at: "2026-06-26T00:00:00Z" }), // exactly 14d
  ], TODAY);
  assertEquals(picked.map((p) => p.journal_id), ["edge"]);
});

Deno.test("SJP-005: results are oldest-first and capped at MAX_PHOTOS_PER_HOME", () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    candidate({
      journal_id: `j${i}`,
      created_at: `2026-07-0${(i % 9) + 1}T0${i % 10}:00:00Z`,
    }));
  const picked = selectPhotos(many, TODAY);
  assertEquals(picked.length, MAX_PHOTOS_PER_HOME);
  const sorted = [...picked].sort((a, b) => a.created_at.localeCompare(b.created_at));
  assertEquals(picked, sorted);
});

// ─── validateObservation — the closed-vocabulary contract ────────────────────

Deno.test("SJP-010: unusable core (missing/invalid health) returns null", () => {
  assertEquals(validateObservation(null), null);
  assertEquals(validateObservation({ findings: "x", confidence: 1, recommended_actions: [] }), null);
  assertEquals(validateObservation({ health: "great", findings: "x", confidence: 1, recommended_actions: [] }), null);
});

Deno.test("SJP-011: unknown action kinds are dropped silently", () => {
  const obs = validateObservation({
    health: "watch",
    findings: "Leaves curling",
    confidence: 0.7,
    recommended_actions: [
      { kind: "delete_plant", reason: "nope" },
      { kind: "repot_immediately", reason: "nope" },
      { kind: "watch_closely", reason: "Curl may be heat stress" },
    ],
  })!;
  assertEquals(obs.actions.length, 1);
  assertEquals(obs.actions[0].kind, "watch_closely");
});

Deno.test("SJP-012: actions are truncated to MAX_ACTIONS", () => {
  const obs = validateObservation({
    health: "concern",
    findings: "Multiple issues",
    confidence: 0.9,
    recommended_actions: [
      { kind: "watch_closely", reason: "r1" },
      { kind: "watch_closely", reason: "r2" },
      { kind: "watch_closely", reason: "r3" },
    ],
  })!;
  assertEquals(obs.actions.length, MAX_ACTIONS);
});

Deno.test("SJP-013: create_task requires a valid task_type AND a title", () => {
  const obs = validateObservation({
    health: "watch",
    findings: "f",
    confidence: 0.6,
    recommended_actions: [
      { kind: "create_task", task_type: "Repotting", title: "Repot", due_in_days: 1, reason: "invalid type" },
      { kind: "create_task", task_type: "Pruning", due_in_days: 1, reason: "no title" },
      { kind: "create_task", task_type: "Pruning", title: "Trim damaged leaves", due_in_days: 3, reason: "ok" },
    ],
  })!;
  assertEquals(obs.actions.length, 1);
  assertEquals(obs.actions[0].kind, "create_task");
  assertEquals((obs.actions[0] as { title: string }).title, "Trim damaged leaves");
});

Deno.test("SJP-014: due_in_days is clamped to 0..14 (and defaults to 0)", () => {
  const obs = validateObservation({
    health: "watch",
    findings: "f",
    confidence: 0.6,
    recommended_actions: [
      { kind: "create_task", task_type: "Watering", title: "Water now", due_in_days: -5, reason: "r" },
      { kind: "create_task", task_type: "Pruning", title: "Prune later", due_in_days: 60, reason: "r" },
    ],
  })!;
  assertEquals((obs.actions[0] as { due_in_days: number }).due_in_days, 0);
  assertEquals((obs.actions[1] as { due_in_days: number }).due_in_days, 14);
});

Deno.test("SJP-015: check_for_ailment requires a suspected name", () => {
  const obs = validateObservation({
    health: "concern",
    findings: "f",
    confidence: 0.8,
    recommended_actions: [
      { kind: "check_for_ailment", reason: "no suspect" },
      { kind: "check_for_ailment", suspected: "Powdery mildew", reason: "white dust on leaves" },
    ],
  })!;
  assertEquals(obs.actions.length, 1);
  assertEquals((obs.actions[0] as { suspected: string }).suspected, "Powdery mildew");
});

Deno.test("SJP-016: reasons cap at 160 chars, findings at 200, titles at 80", () => {
  const long = "x".repeat(500);
  const obs = validateObservation({
    health: "watch",
    findings: long,
    confidence: 0.6,
    recommended_actions: [
      { kind: "create_task", task_type: "Maintenance", title: long, due_in_days: 1, reason: long },
    ],
  })!;
  assertEquals(obs.findings.length, 200);
  const a = obs.actions[0] as { title: string; reason: string };
  assertEquals(a.title.length, 80);
  assertEquals(a.reason.length, 160);
});

Deno.test("SJP-017: actionless reason-free entries are dropped; all stored actions start proposed", () => {
  const obs = validateObservation({
    health: "healthy",
    findings: "Thriving",
    confidence: 0.95,
    recommended_actions: [
      { kind: "watch_closely" }, // no reason
      { kind: "watch_closely", reason: "   " }, // blank reason
    ],
  })!;
  assertEquals(obs.actions.length, 0);
  const withAction = validateObservation({
    health: "watch",
    findings: "f",
    confidence: 0.6,
    recommended_actions: [{ kind: "watch_closely", reason: "keep an eye" }],
  })!;
  assertEquals(withAction.actions[0].status, "proposed");
});

Deno.test("SJP-018: growth_stage outside the enum is nulled; confidence clamps 0..1", () => {
  const obs = validateObservation({
    health: "healthy",
    growth_stage: "Teenager",
    findings: "f",
    confidence: 3,
    recommended_actions: [],
  })!;
  assertEquals(obs.growth_stage, null);
  assertEquals(obs.confidence, 1);
  const ok = validateObservation({
    health: "healthy",
    growth_stage: "Flowering/Bloom",
    findings: "f",
    confidence: -1,
    recommended_actions: [],
  })!;
  assertEquals(ok.growth_stage, "Flowering/Bloom");
  assertEquals(ok.confidence, 0);
});

// ─── shouldApplyStage ────────────────────────────────────────────────────────

Deno.test("SJP-020: stage applies only at ≥0.8 confidence AND when it differs", () => {
  assertEquals(shouldApplyStage("Flowering/Bloom", "Vegetative", 0.9), true);
  assertEquals(shouldApplyStage("Flowering/Bloom", "Vegetative", 0.79), false);
  assertEquals(shouldApplyStage("Vegetative", "Vegetative", 0.99), false);
  assertEquals(shouldApplyStage(null, "Vegetative", 0.99), false);
});

// ─── Schema + prompt sanity ──────────────────────────────────────────────────

Deno.test("SJP-030: responseSchema pins the closed enums (stages, kinds, task types)", () => {
  const props = PHOTO_OBSERVATION_SCHEMA.properties;
  assertEquals([...props.growth_stage.enum], [...GROWTH_STAGES]);
  assertEquals([...props.recommended_actions.items.properties.kind.enum], [
    "create_task", "check_for_ailment", "watch_closely",
  ]);
  assertEquals([...props.recommended_actions.items.properties.task_type.enum], [...PHOTO_TASK_TYPES]);
});

Deno.test("SJP-031: prompt names the plant, its believed stage, and the conservative rule", () => {
  const p = buildPhotoPrompt("Sungold Tomato", "Vegetative");
  assertStringIncludes(p, "Sungold Tomato");
  assertStringIncludes(p, '"Vegetative" stage');
  assertStringIncludes(p, "NO actions");
  const noStage = buildPhotoPrompt("Rose", null);
  assertEquals(noStage.includes("currently believes"), false);
});
