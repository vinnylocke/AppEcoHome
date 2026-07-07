import { assert } from "@std/assert";
import { isActionExplicit, claimsUserData } from "../functions/agent-chat/actionIntent.ts";

// The predicate behind the forced tool-choice retry. Fixtures are the REAL
// question-bank phrasings (docs/ai-chat-eval/question-bank.mjs): the stuck
// staging cluster must be detected; knowledge questions must NOT be (a false
// positive forces a tool call onto a knowledge answer = over-acting).

const ACTION = [
  // Wave-2 verbs (round 5)
  "Open the Raised Bed A valve for 10 minutes.",                                      // E31
  "Change my dry soil alert to trigger at 25% instead of 30%.",                       // E45
  "Plan a winter brassica rotation for Raised Bed B and add whatever seeds I need to a shopping list.", // E35
  "Turn off all my automations for the winter.",                                      // E29
  "Set up a watering schedule for my raised beds every 3 days.",                    // E02
  "For succession planting of lettuce, how often should I sow — and can you set that up?", // E14
  "My courgettes have powdery mildew. Add it to the watchlist and link it to them.", // E16
  "Log that I sowed a tray of kale today.",                                          // E23
  "I keep forgetting to water things. Can you help me stay on top of it?",           // N12
  "Remind me to water my plants this Saturday.",                                     // N08
  "Can you add basil to my shed?",                                                   // N07
  "Add slugs to my watchlist — they're eating everything.",                          // N17
  "Set a reminder to feed the roses every fortnight from now on.",                   // E15
  "Water Raised Bed A right now.",                                                   // E04
  "Mark all of this week's tasks in the veg patch as done.",                         // E07
  "It's been raining all week — push all my watering tasks back by 3 days.",         // E06
  "My summer crops are done — archive my finished courgettes.",                      // E20
  "Create a spring shopping list and add tomato feed and slug pellets to it.",       // E17
];

const KNOWLEDGE = [
  // Wave-2 over-use victims (round 5) — the model over-acted here; the DETECTOR must not force it
  "Is monstera poisonous to cats?",                                          // N30
  "My greenhouse hit 95 degrees today, is that bad?",                        // N33
  "My soil EC is reading 2400 µS/cm in the veg bed — is that too high for lettuce?", // E33
  "Should I water deeply twice a week or lightly every day? Justify it.",    // E46
  "How do I turn on dark mode in the app?",                                  // N37 — app-settings, not a garden action
  "How often should I water a peace lily?",                       // N03
  "How do I know when my strawberries are ripe?",                 // N13
  "What's an easy houseplant that's really hard to kill?",        // N14
  "Are coffee grounds actually good for my plants?",              // N22 ("actually" without a staged card)
  "How much sun does a tomato plant actually need?",              // N20
  "What's the ideal soil EC and moisture range for tomatoes?",    // E12
  "Is it too late to plant carrots?",                             // N10
  "Which of my plants haven't been watered in a while?",          // E05 — read question, no forced mutation
  "What's my soil moisture reading right now?",                   // E09 — read question
];

Deno.test("actionIntent — explicit action requests are detected", () => {
  for (const q of ACTION) assert(isActionExplicit(q, []), `should detect: ${q}`);
});

Deno.test("actionIntent — knowledge/read questions are NOT flagged (no forced over-acting)", () => {
  for (const q of KNOWLEDGE) assert(!isActionExplicit(q, []), `should NOT detect: ${q}`);
});

Deno.test("actionIntent — refinement after a staged card is detected via the 🔧 marker", () => {
  const history = [
    { role: "user", parts: [{ text: "Push all my watering tasks back by 3 days." }] },
    { role: "model", parts: [{ text: "🔧 Ready to confirm: shift 2 watering tasks +3 days." }] },
  ];
  assert(isActionExplicit("Actually only the ones in the greenhouse.", history), "refinement should be detected");
  // Same words with no staged card in history → not a refinement.
  assert(!isActionExplicit("Actually only the ones in the greenhouse.", []), "no 🔧 in history → not action-explicit");
});

Deno.test("actionIntent — empty/gibberish is not action-explicit", () => {
  assert(!isActionExplicit("", []));
  assert(!isActionExplicit("???", []));
  assert(!isActionExplicit("thanks, you've been really helpful!", []));
});

// ── claimsUserData (round 9 — ungrounded data-claim guard) ──────────────────

Deno.test("claimsUserData — the wave-3 fabrications are detected", () => {
  for (const s of [
    "Your Watchlist is currently empty, so there's nothing to track.",           // RB16
    "You have no planting tasks scheduled at the moment.",                       // RE10
    "You don't have any seed packets in the Nursery yet.",
    "There are no automations in your home right now.",
    "I can't see any sensors in your garden.",
    "Nothing is scheduled for you this week.",
  ]) assert(claimsUserData(s), `should detect: ${s}`);
});

Deno.test("claimsUserData — knowledge answers and grounded phrasing are NOT flagged", () => {
  for (const s of [
    "Blueberries like acidic soil around pH 4.5–5.5.",
    "Lavender is best pruned in late summer, right after flowering.",
    "A heatwave is forecast, so your outdoor plants will need extra water.",
    "If your watering can is empty, refill it before feeding.",
    "",
  ]) assert(!claimsUserData(s), `should NOT detect: ${s}`);
});
