import { assert } from "@std/assert";
import { AGENT_RULES } from "../functions/agent-chat/rules.ts";

// Regression: the Garden AI chat used to refuse horticultural questions about
// plants the user doesn't have catalogued — e.g. "we have a crab tree, when
// should we harvest the apples" → "I can't find any information about crab
// apple trees in my database." These assert the load-bearing prompt guarantees
// that prevent that refusal survive future edits.

const RULES = AGENT_RULES.join("\n");

Deno.test("agent rules — answer knowledge questions even for plants not in the Shed/catalogue", () => {
  assert(/KNOWLEDGE QUESTIONS/.test(RULES), "missing the KNOWLEDGE QUESTIONS rule");
  assert(
    /EVEN IF the plant is not in their Shed/i.test(RULES),
    "knowledge rule must cover plants absent from the Shed/catalogue",
  );
  assert(/harvest timing/i.test(RULES), "harvest-timing must be an explicit knowledge example");
});

Deno.test("agent rules — an explicit never-refuse-for-lack-of-data guarantee exists", () => {
  assert(/NEVER REFUSE FOR LACK OF DATA/.test(RULES), "missing the anti-refusal rule");
  assert(
    /is NOT limited|neither one bounds your horticultural knowledge/i.test(RULES),
    "anti-refusal rule must state the DB doesn't bound the AI's knowledge",
  );
});

Deno.test("agent rules — the Shed check is additive (an offer), never a gate that blocks the answer", () => {
  assert(/PLANT-IN-SHED OFFER/.test(RULES), "shed check must be framed as an additive offer");
  assert(/never a gate/i.test(RULES), "shed check must be explicitly non-blocking");
  // The old wording that caused the refusal must be gone.
  assert(
    !/does NOT make this a knowledge question/i.test(RULES),
    "the old gating phrasing ('does NOT make this a knowledge question') must be removed",
  );
  // N20 regression — must not offer to add a plant that's already in the Shed.
  assert(
    /already in the SHED, do NOT offer/i.test(RULES),
    "must not offer to add a plant that's already in the Shed",
  );
});

// ── Eval-driven fixes (docs/ai-chat-eval) ────────────────────────────────────

Deno.test("agent rules — stage the confirm card when intent is explicit (not just describe it)", () => {
  assert(/STAGE THE ACTION/i.test(RULES), "missing the stage-the-action rule");
  assert(/do NOT merely describe/i.test(RULES) && /same turn/i.test(RULES), "must require staging the tool in the same turn");
});

Deno.test("agent rules — resolve ids via list_* itself instead of asking the user", () => {
  assert(/RESOLVE IDS YOURSELF/i.test(RULES), "missing the resolve-ids rule");
  assert(/list_devices/.test(RULES) && /list_areas/.test(RULES), "must point at the list_* lookups");
});

Deno.test("agent rules — don't over-act (no unrequested mutation cards)", () => {
  assert(/DON'T OVER-ACT/i.test(RULES), "missing the don't-over-act rule");
  assert(/did NOT request/i.test(RULES) || /unrequested confirm card/i.test(RULES), "must forbid unrequested mutations");
});

Deno.test("agent rules — the Rhozly reply template is specified with its fixed markers", () => {
  assert(/REPLY TEMPLATE/i.test(RULES), "missing the reply-template rule");
  assert(/BOTTOM LINE/i.test(RULES) && /DETAIL BULLETS/i.test(RULES), "template must define bottom-line + bullets");
  assert(RULES.includes("🔎 Checked:"), "template must define the 🔎 garden line");
  assert(RULES.includes("🔧 Ready to confirm:"), "template must define the 🔧 action line");
  assert(/NEXT STEP/i.test(RULES) && RULES.includes("→"), "template must define the single → next step");
  assert(/NEVER reply with only "I need a quick confirmation"/i.test(RULES), "bare confirmation-only replies must be banned");
});

// ── Round 2 (post-fix eval, docs/plans/garden-ai-eval-round2-template-and-fixes.md) ──

Deno.test("agent rules — defaults, not interrogation (resolve place + sensible cadence, stage editable card)", () => {
  assert(/DEFAULTS, NOT INTERROGATION/i.test(RULES), "missing the defaults rule");
  assert(/AT MOST one clarifying question/i.test(RULES), "must cap clarifying questions at one");
});

Deno.test("agent rules — never stage a guessed id", () => {
  assert(/NEVER stage a mutation with a guessed or made-up id/i.test(RULES), "must forbid staging invented ids");
  assert(/MUST come from a list_\*\/search result/i.test(RULES), "ids must come from earlier lookups");
});

Deno.test("agent rules — dependent-action chains are staged across turns, never dead-ended", () => {
  assert(/DEPENDENT ACTIONS/i.test(RULES), "missing the dependent-actions rule");
  assert(/NEVER tell the user something they just asked you to create "doesn't exist"/i.test(RULES), "must ban the 'doesn't exist' dead-end");
});

Deno.test("agent rules — refinements of a staged action are re-staged immediately", () => {
  assert(/REFINEMENTS/i.test(RULES), "missing the refinements rule");
  assert(/Never answer a refinement with "could you rephrase"/i.test(RULES), "must ban the rephrase fallback for refinements");
});

Deno.test("agent rules — attention/optimise/sensor questions route to the right tools", () => {
  assert(/ATTENTION QUESTIONS/i.test(RULES) && /get_overdue_summary/.test(RULES), "attention → get_overdue_summary");
  assert(/OPTIMISE REQUESTS/i.test(RULES) && /optimise_area_schedule/.test(RULES), "optimise → optimise_area_schedule");
  assert(/SENSOR QUESTIONS/i.test(RULES) && /latest reading/i.test(RULES), "sensors → list_devices latest readings");
  assert(/TOOL HYGIENE/i.test(RULES), "must forbid search_plant_database for general-knowledge facts");
});

// ── Round 3 (docs/plans/garden-ai-eval-round3-phantom-guard-and-rubric.md) ──

Deno.test("agent rules — the 🔧 line only describes a real tool call (phantom-🔧 ban)", () => {
  assert(/DESCRIBES a confirm card created by a tool you actually CALLED/i.test(RULES), "🔧 must be tied to an actual call");
  assert(/MUST NOT write a 🔧 line/i.test(RULES), "must forbid writing 🔧 without staging");
});

Deno.test("agent rules — climate questions use location/weather context, never an assumed climate", () => {
  assert(/CLIMATE QUESTIONS/i.test(RULES) && /never assume a climate/i.test(RULES), "climate → weather/location context");
});

Deno.test("agent rules — never stage an empty-match bulk card", () => {
  assert(/Never stage a bulk card whose preview says nothing matches/i.test(RULES), "empty bulk cards banned");
});

// ── Round 5 (docs/plans/garden-ai-eval-round5-read-stall-and-overuse.md) ──

Deno.test("agent rules — use what you read (payload must shape the reply; no needless tools)", () => {
  assert(/USE WHAT YOU READ/i.test(RULES), "missing the use-what-you-read rule");
  assert(/Never call a tool and then answer as if you hadn't/i.test(RULES), "must ban ignoring fetched payloads");
  assert(/need NO tool at all/i.test(RULES), "must ban needless tool calls for pure knowledge");
});

Deno.test("agent rules — over-act examples cover the unrequested-automation case", () => {
  assert(/NOT an unrequested heatwave automation/i.test(RULES), "N33-style unrequested automation must be named");
});

Deno.test("agent rules — the SHED is the source of truth for ownership", () => {
  assert(/SOURCE OF TRUTH for what they own/i.test(RULES), "shed-ownership truth clause missing");
  assert(/never claim a plant "isn't in your Shed" based on a catalogue search miss/i.test(RULES), "catalogue-miss inference must be banned");
});

// ── Round 6 (docs/plans/garden-ai-eval-round6-mechanical-template.md) ──

Deno.test("agent rules — the app writes the 🔎 line; the model is told not to", () => {
  assert(/app appends `🔎 Checked:/i.test(RULES), "must state the app appends the 🔎 line");
  assert(/do NOT write a 🔎 line yourself/i.test(RULES), "model must be told not to write 🔎");
});

Deno.test("agent rules — prose completion claims are banned alongside phantom 🔧", () => {
  assert(/never claim in prose that you've set something up/i.test(RULES), "prose-claim ban missing");
});

Deno.test("agent rules — a worked template example is included", () => {
  assert(/TEMPLATE EXAMPLE/i.test(RULES), "missing the worked example");
  assert(/\*\*When:\*\*/.test(RULES) && /→ Want me to add a pruning reminder/i.test(RULES), "example must demonstrate bullets + →");
});
