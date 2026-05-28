// Prompt builder for `analyse-plant-end-of-life`. Pure functions only —
// no DB calls, no Supabase imports. Kept separate so the prompt can be
// unit-tested in isolation.

export interface AnalysisContext {
  plantName: string;
  cultivar?: string | null;
  daysAlive: number | null;
  endSummary?: string | null;
  areaName?: string | null;
  areaContext?: {
    lux?: number | null;
    ph?: number | null;
    soil?: string | null;
    waterMovement?: string | null;
  };
  locationContext?: {
    placement?: string | null;
    postcode?: string | null;
  };
  journalEntries: Array<{
    subject: string;
    description?: string | null;
    created_at: string;
  }>;
  tasks: Array<{
    title: string;
    type: string;
    status: string;
    due_date: string | null;
    completed_at?: string | null;
  }>;
  ailments: Array<{
    name: string;
    type?: string | null;
    linked_at?: string | null;
  }>;
  weatherSummary?: string | null;
}

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    likely_causes: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    prevention_next_time: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    affirmation: { type: "STRING" },
  },
  required: ["likely_causes", "prevention_next_time", "affirmation"],
};

function formatJournal(entries: AnalysisContext["journalEntries"]): string {
  if (entries.length === 0) return "(no journal entries)";
  return entries
    .slice(0, 30)
    .map(
      (e) =>
        `- ${e.created_at.split("T")[0]} · ${e.subject}${
          e.description ? ` — ${e.description}` : ""
        }`,
    )
    .join("\n");
}

function formatTasks(tasks: AnalysisContext["tasks"]): string {
  if (tasks.length === 0) return "(no tasks recorded for this plant)";
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const recent = tasks
    .slice(0, 30)
    .map(
      (t) =>
        `- ${t.due_date ?? "(no date)"} · ${t.type} · ${t.title} · status=${t.status}`,
    )
    .join("\n");
  return `Counts: ${summary}\n\nRecent:\n${recent}`;
}

function formatAilments(ailments: AnalysisContext["ailments"]): string {
  if (ailments.length === 0) return "(no ailments linked)";
  return ailments
    .map((a) => `- ${a.name}${a.type ? ` (${a.type})` : ""}`)
    .join("\n");
}

function formatArea(ctx: AnalysisContext): string {
  const a = ctx.areaContext ?? {};
  const parts: string[] = [];
  if (ctx.areaName) parts.push(`Area: ${ctx.areaName}`);
  if (a.lux != null) parts.push(`Lux: ${a.lux}`);
  if (a.ph != null) parts.push(`pH: ${a.ph}`);
  if (a.soil) parts.push(`Soil: ${a.soil}`);
  if (a.waterMovement) parts.push(`Water movement: ${a.waterMovement}`);
  if (ctx.locationContext?.placement) parts.push(`Placement: ${ctx.locationContext.placement}`);
  if (ctx.locationContext?.postcode) parts.push(`Postcode: ${ctx.locationContext.postcode}`);
  return parts.length > 0 ? parts.join(" · ") : "(no area details recorded)";
}

/**
 * Builds the user-side prompt body. The system prompt sets tone +
 * structured-output expectations; the user content is the gathered
 * context. Pure function — no IO.
 */
export function buildAnalysisPrompt(ctx: AnalysisContext): string {
  const lines = [
    `Plant: ${ctx.plantName}${ctx.cultivar ? ` (${ctx.cultivar})` : ""}`,
    `Days alive in this home: ${ctx.daysAlive ?? "unknown"}`,
    "",
    "Area + location:",
    formatArea(ctx),
    "",
    "Journal entries (oldest first up to 30):",
    formatJournal(ctx.journalEntries),
    "",
    "Tasks (status counts then recent):",
    formatTasks(ctx.tasks),
    "",
    "Linked ailments / pests / diseases:",
    formatAilments(ctx.ailments),
  ];
  if (ctx.weatherSummary) {
    lines.push("", "Recent weather summary:", ctx.weatherSummary);
  }
  if (ctx.endSummary) {
    lines.push("", "Gardener's closing note:", ctx.endSummary);
  }
  return lines.join("\n");
}

export const ANALYSIS_SYSTEM_PROMPT = `
You are a warm, experienced horticulturalist helping a gardener understand why one of their plants didn't make it. Tone is empathetic and specific — never preachy, never blaming.

Given the records below, return strictly the following JSON:
- likely_causes: 2 to 4 short bullets. Each names a specific likely contributor and cites the evidence from the records (e.g. "Frequent watering tasks suggest possibly overwatered roots — water movement is recorded as 'low-drained'").
- prevention_next_time: 2 to 4 concrete, actionable bullets the gardener can do differently. Be specific to THIS plant + THIS area — generic tips are noise.
- affirmation: ONE sentence acknowledging the gardener's effort and reframing this as a learning step. No exclamation marks. No "don't worry" or "no big deal" — be respectful, not breezy.

If the records are sparse, say so plainly in one of the likely_causes (e.g. "Few records make it hard to pinpoint the exact cause — see notes below for what to log next time").
`.trim();
