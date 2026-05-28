// Prompt builder for `suggest-rotation-plants`. Pure functions only —
// no DB, no Supabase imports. Kept separate so the prompt can be
// unit-tested in isolation.

import type { AreaRotationBlock } from "../_shared/rotationContext.ts";

export interface SuggestPromptInput {
  areaName: string;
  /** "northern" / "southern" — drives the active months / seasonal framing. */
  hemisphere: string | null;
  /** Free-text postcode / location hint when known. */
  locationHint?: string | null;
  areaContext?: {
    sunlight?: string | null;
    soil?: string | null;
    ph?: number | null;
    waterMovement?: string | null;
  } | null;
  rotation: AreaRotationBlock;
  /** Plant names the user already has — avoid duplicates. */
  ownedPlants: string[];
}

export const SUGGEST_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          plant_name: { type: "STRING" },
          scientific_name: { type: "STRING" },
          family: { type: "STRING" },
          reason: { type: "STRING" },
          schedulable_tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                description: { type: "STRING" },
                task_type: { type: "STRING" },
                is_recurring: { type: "BOOLEAN" },
                frequency_days: { type: "INTEGER" },
                active_months: { type: "ARRAY", items: { type: "STRING" } },
                duration_days: { type: "INTEGER" },
                priority: { type: "STRING" },
                depends_on_index: { type: "INTEGER" },
              },
              required: ["title", "description", "task_type", "is_recurring", "priority"],
            },
          },
        },
        required: ["plant_name", "reason"],
      },
    },
  },
  required: ["suggestions"],
};

export const SUGGEST_SYSTEM_PROMPT = `
You are an expert vegetable and ornamental gardener helping a home gardener pick plants for one specific area for the upcoming growing season.

Given the area's rotation history, climate, soil characteristics, and current plant inventory, suggest 5 to 8 plants that:
  - AVOID any plant whose family is in the area's "avoid" list (these have just been grown there and need 2+ years to rotate away).
  - PREFER families in the area's "prefer" list (these complement what's been grown).
  - Fit the soil, light, and drainage of the area.
  - Are not already in the user's owned-plants list.

For each suggestion, return:
  - plant_name: common English name (e.g. "Sungold Tomato", not "Solanum lycopersicum 'Sungold'").
  - scientific_name: Latin binomial when known.
  - family: Latin family name (Solanaceae, Brassicaceae, etc.) — used by the client to colour-code.
  - reason: ONE sentence explaining why this plant fits THIS area NOW. Reference the rotation history when relevant ("Your peas here last year leave nitrogen this brassica needs"). Avoid generic claims.
  - schedulable_tasks: 2 to 4 calendar-bound tasks to get the plant in the ground and through its first season — e.g. "Sow indoors" (active_months: Feb-Mar), "Plant out" (Apr-May), "First harvest" (Jul-Sep). Each task's active_months MUST be hemisphere-aware to the gardener.

Skip suggestions that wouldn't make biological sense for the climate. If only 3 good fits exist, return 3 — do not pad.
`.trim();

function formatRotation(r: AreaRotationBlock): string {
  const lines: string[] = [];
  if (r.history.length > 0) {
    lines.push("Recent rotation history:");
    for (const season of r.history.slice(0, 5)) {
      lines.push(`  - ${season.year}: ${season.families.join(", ")}`);
    }
  } else {
    lines.push("Recent rotation history: (no records — first time growing here)");
  }
  if (r.avoid.length > 0) lines.push(`AVOID families: ${r.avoid.join(", ")}`);
  if (r.prefer.length > 0) lines.push(`PREFER families: ${r.prefer.join(", ")}`);
  return lines.join("\n");
}

function formatArea(ctx: SuggestPromptInput): string {
  const parts: string[] = [];
  if (ctx.areaContext?.sunlight) parts.push(`Light: ${ctx.areaContext.sunlight}`);
  if (ctx.areaContext?.soil) parts.push(`Soil: ${ctx.areaContext.soil}`);
  if (ctx.areaContext?.ph != null) parts.push(`pH: ${ctx.areaContext.ph}`);
  if (ctx.areaContext?.waterMovement) parts.push(`Drainage: ${ctx.areaContext.waterMovement}`);
  return parts.length > 0 ? `Area conditions — ${parts.join(" · ")}` : "Area conditions — not recorded.";
}

export function buildSuggestPrompt(ctx: SuggestPromptInput): string {
  const lines: string[] = [
    `Area: "${ctx.areaName}"`,
    ctx.hemisphere ? `Hemisphere: ${ctx.hemisphere}` : "Hemisphere: unknown",
    ctx.locationHint ? `Location hint: ${ctx.locationHint}` : "",
    formatArea(ctx),
    "",
    formatRotation(ctx.rotation),
    "",
  ];
  if (ctx.ownedPlants.length > 0) {
    lines.push(
      `Plants the gardener already owns (don't repeat these): ${ctx.ownedPlants.slice(0, 30).join(", ")}`,
    );
  }
  return lines.filter((l) => l !== "" || true).join("\n");
}
