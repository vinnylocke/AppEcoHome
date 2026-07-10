// Garden Brain Phase 3 — photo-timeline scanning, the pure core.
//
// Everything deterministic about the nightly vision pass lives here so it's
// Deno-testable without a network: which photos qualify, the CLOSED action
// vocabulary + validation (the "auto-actionable template" contract), the
// stage-correction gate, and the strict response schema the model is bound to.

export const GROWTH_STAGES = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Budding/Pre-Flowering",
  "Flowering/Bloom",
  "Fruiting/Pollination",
  "Ripening/Maturity",
  "Senescence",
] as const;

export const PHOTO_TASK_TYPES = ["Watering", "Pruning", "Maintenance", "Harvesting"] as const;

export const MAX_PHOTOS_PER_HOME = 10;
export const PHOTO_WINDOW_DAYS = 14;
export const MAX_ACTIONS = 2;
export const STAGE_APPLY_CONFIDENCE = 0.8;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// ── The closed action vocabulary ─────────────────────────────────────────────

export interface CreateTaskAction {
  kind: "create_task";
  task_type: (typeof PHOTO_TASK_TYPES)[number];
  title: string;
  due_in_days: number; // 0..14
  reason: string;
  status: "proposed" | "applied" | "dismissed";
  applied_task_id?: string;
}
export interface CheckAilmentAction {
  kind: "check_for_ailment";
  suspected: string;
  reason: string;
  status: "proposed" | "applied" | "dismissed";
}
export interface WatchCloselyAction {
  kind: "watch_closely";
  reason: string;
  status: "proposed" | "applied" | "dismissed";
}
export type PhotoAction = CreateTaskAction | CheckAilmentAction | WatchCloselyAction;

export interface PhotoObservationResult {
  growth_stage: string | null;
  health: "healthy" | "watch" | "concern";
  findings: string;
  confidence: number;
  actions: PhotoAction[];
}

/** Gemini responseSchema — JSON mode makes deviation impossible; validation
 *  below is defence in depth. */
export const PHOTO_OBSERVATION_SCHEMA = {
  type: "object",
  properties: {
    growth_stage: { type: "string", enum: [...GROWTH_STAGES] },
    health: { type: "string", enum: ["healthy", "watch", "concern"] },
    findings: { type: "string" },
    confidence: { type: "number" },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["create_task", "check_for_ailment", "watch_closely"] },
          task_type: { type: "string", enum: [...PHOTO_TASK_TYPES] },
          title: { type: "string" },
          due_in_days: { type: "integer" },
          suspected: { type: "string" },
          reason: { type: "string" },
        },
        required: ["kind", "reason"],
      },
    },
  },
  required: ["health", "findings", "confidence", "recommended_actions"],
} as const;

const clampText = (s: unknown, max: number): string =>
  typeof s === "string" ? s.trim().slice(0, max) : "";

/**
 * Validate/normalise a parsed model response into the storable observation.
 * Unknown action kinds are DROPPED, actions truncated to MAX_ACTIONS,
 * due_in_days clamped 0..14, create_task requires a valid task_type + title.
 * Returns null when the core fields are unusable (no row is written).
 */
// deno-lint-ignore no-explicit-any
export function validateObservation(parsed: any): PhotoObservationResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const health = ["healthy", "watch", "concern"].includes(parsed.health) ? parsed.health : null;
  if (!health) return null;
  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const growth_stage = (GROWTH_STAGES as readonly string[]).includes(parsed.growth_stage)
    ? (parsed.growth_stage as string)
    : null;

  const actions: PhotoAction[] = [];
  for (const raw of Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : []) {
    if (actions.length >= MAX_ACTIONS) break;
    const reason = clampText(raw?.reason, 160);
    if (!reason) continue;
    if (raw?.kind === "create_task") {
      if (!(PHOTO_TASK_TYPES as readonly string[]).includes(raw.task_type)) continue;
      const title = clampText(raw.title, 80);
      if (!title) continue;
      const due = Number.isFinite(raw.due_in_days) ? Math.max(0, Math.min(14, Math.round(raw.due_in_days))) : 0;
      actions.push({ kind: "create_task", task_type: raw.task_type, title, due_in_days: due, reason, status: "proposed" });
    } else if (raw?.kind === "check_for_ailment") {
      const suspected = clampText(raw.suspected, 80);
      if (!suspected) continue;
      actions.push({ kind: "check_for_ailment", suspected, reason, status: "proposed" });
    } else if (raw?.kind === "watch_closely") {
      actions.push({ kind: "watch_closely", reason, status: "proposed" });
    }
    // anything else: dropped silently — the vocabulary is closed.
  }

  return {
    growth_stage,
    health,
    findings: clampText(parsed.findings, 200),
    confidence,
    actions,
  };
}

/** Should this observation update inventory_items.growth_state? */
export function shouldApplyStage(
  observed: string | null,
  current: string | null,
  confidence: number,
): boolean {
  if (!observed) return false;
  if (confidence < STAGE_APPLY_CONFIDENCE) return false;
  return observed !== current;
}

// ── Photo selection ───────────────────────────────────────────────────────────

export interface CandidatePhoto {
  journal_id: string;
  inventory_item_id: string | null;
  image_url: string | null;
  created_at: string;
  alreadyObserved: boolean;
}

/** Which photos qualify tonight: plant-linked, has an image, inside the
 *  window, not yet observed — oldest first, capped. */
export function selectPhotos(candidates: CandidatePhoto[], todayIso: string): CandidatePhoto[] {
  const cutoff = Date.parse(todayIso) - PHOTO_WINDOW_DAYS * 86_400_000;
  return candidates
    .filter((c) =>
      !!c.inventory_item_id &&
      !!c.image_url &&
      !c.alreadyObserved &&
      Date.parse(c.created_at) >= cutoff)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, MAX_PHOTOS_PER_HOME);
}

/** The vision prompt — the plant's identity + current believed stage. */
export function buildPhotoPrompt(plantName: string, currentStage: string | null): string {
  return [
    `You are Rhozly's head gardener reviewing a gardener's photo of their plant: ${plantName}.`,
    currentStage ? `Rhozly currently believes this plant is at the "${currentStage}" stage.` : "",
    "From THIS PHOTO ONLY, assess: the growth stage (only if visually determinable), overall health (healthy / watch / concern), and concise findings (≤200 chars, plain gardener language).",
    "Recommend at most 2 actions from the allowed kinds ONLY when the photo justifies them:",
    "- create_task: a concrete one-off job (task_type Watering/Pruning/Maintenance/Harvesting, short title, due_in_days 0-14).",
    "- check_for_ailment: visible signs of pest/disease worth a proper diagnosis (name the suspected issue).",
    "- watch_closely: something ambiguous worth re-checking — no action needed yet.",
    "A healthy plant should usually have NO actions. Never invent problems. Be conservative with confidence.",
  ].filter(Boolean).join("\n");
}
