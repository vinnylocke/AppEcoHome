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

Deno.test("agent rules — a consistent house answer format is specified", () => {
  assert(/ANSWER FORMAT/i.test(RULES), "missing the answer-format rule");
  assert(/bottom-line/i.test(RULES) && /bullet/i.test(RULES), "format rule must define bottom-line-first + bullets");
});
