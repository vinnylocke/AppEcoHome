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
});
