/**
 * Deterministic reply-template markers (round 6 — docs/plans/garden-ai-eval-
 * round6-mechanical-template.md).
 *
 * The eval proved the pattern: the server-composed 🔧 line hit 29/29 staged
 * turns while the model-emitted 🔎 line hit 2/60 read turns. So the markers the
 * server can derive from ground truth are now written BY the server:
 *
 *   - `🔎 Checked: …` is built from the read tools that actually ran (any
 *     model-written 🔎 line is stripped — it may be wrong).
 *   - `🔧 Ready to confirm: …` is kept from the model when cards are pending
 *     (its wording carries the assumptions) or composed from the card previews
 *     when the model omitted it; when NOTHING is pending every 🔧 line is
 *     stripped (the phantom-🔧 guard — the reply can never claim an action is
 *     staged when no card exists).
 *   - Tail order is canonical: body → 🔎 → 🔧 → one trailing `→` offer.
 *
 * Pure module — no Deno APIs — so supabase/tests can exercise it directly.
 */

/** Friendly names for the 🔎 line. Display-only tools are deliberately absent. */
const READ_TOOL_LABELS: Record<string, string> = {
  list_plants: "your plants",
  list_tasks: "your tasks",
  list_blueprints: "your schedules",
  list_locations: "your locations",
  list_areas: "your areas",
  list_ailments: "your watchlist",
  list_shopping_lists: "your shopping lists",
  list_seed_packets: "your seed packets",
  list_plans: "your plans",
  search_plant_database: "the plant catalogue",
  get_plant_details: "the plant catalogue",
  get_weather_now: "weather",
  get_overdue_summary: "what needs attention",
  optimise_area_schedule: "schedule optimisation",
  list_devices: "your devices & sensors",
  list_automations: "your automations",
};

/** Build the canonical 🔎 line from executed read-tool names (deduped, ordered). */
export function buildCheckedLine(readTools: string[]): string | null {
  const labels: string[] = [];
  for (const t of readTools) {
    const label = READ_TOOL_LABELS[t];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.length ? `🔎 Checked: ${labels.join(" · ")}` : null;
}

export interface NormaliseInput {
  /** Names of read tools that RAN this turn (toolResults[].tool). */
  readTools: string[];
  /** Preview strings of the confirm cards staged this turn ([] = none pending). */
  pendingPreviews: string[];
}

export interface NormaliseOutput {
  reply: string;
  /** True when a 🔧 line was stripped because nothing was pending (phantom claim). */
  phantomStripped: boolean;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Compose a 🔧 line from card previews (used when the model omitted its own). */
export function buildActionLine(pendingPreviews: string[]): string | null {
  const parts = pendingPreviews
    .map((p) => (p ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((p) => truncate(p, 140));
  return parts.length ? `🔧 Ready to confirm: ${parts.join(" · ")}` : null;
}

/**
 * Rebuild the reply's tail so the template markers are always present, truthful
 * and in canonical order. Interior content is left untouched.
 */
export function normaliseReplyMarkers(reply: string, input: NormaliseInput): NormaliseOutput {
  const pending = input.pendingPreviews.length > 0;
  const lines = (reply ?? "").split("\n");

  const bodyLines: string[] = [];
  let modelActionLine: string | null = null;
  let phantomStripped = false;

  for (const line of lines) {
    if (line.includes("🔎")) continue; // always replaced by the canonical line
    if (line.includes("🔧")) {
      if (pending) {
        // Keep the model's first 🔧 wording (it carries the assumptions).
        if (!modelActionLine) modelActionLine = line.trim();
      } else {
        phantomStripped = true; // claim with no card — drop it
      }
      continue;
    }
    bodyLines.push(line);
  }

  // Pull a trailing `→` offer out of the body so it can go back at the very end.
  let trailingOffer: string | null = null;
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();
  if (bodyLines.length && bodyLines[bodyLines.length - 1].trim().startsWith("→")) {
    trailingOffer = bodyLines.pop()!.trim();
    while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();
  }

  const checkedLine = buildCheckedLine(input.readTools);
  const actionLine = pending ? (modelActionLine ?? buildActionLine(input.pendingPreviews)) : null;

  const out: string[] = [...bodyLines];
  if (checkedLine) out.push("", checkedLine);
  if (actionLine) out.push("", actionLine);
  if (trailingOffer) out.push("", trailingOffer);

  const rebuilt = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { reply: rebuilt, phantomStripped };
}
