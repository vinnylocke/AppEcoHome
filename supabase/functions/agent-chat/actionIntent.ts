/**
 * Action-intent detection for the forced tool-choice retry.
 *
 * Three prompt iterations couldn't stop Gemini occasionally answering an
 * explicit "set this up for me" with prose and no tool call (eval cluster
 * N12/E02/E14/E16/E23 — docs/ai-chat-eval/). The mechanical fix: when the
 * user's message clearly asks the assistant to ACT and the model produced no
 * function call, agent-chat re-asks ONCE with `toolChoice: "ANY"` (function
 * calling forced). This module is the pure "does this message clearly ask us
 * to act?" predicate — deliberately conservative, because a false positive
 * forces a tool call on a knowledge question (over-acting), which is the
 * failure we fixed in round 2. Prefer misses over false alarms; the prompt
 * rules remain the primary staging path.
 */

// Imperative verbs / phrasings that, aimed at the assistant, mean "do it".
const ACTION_PATTERNS: RegExp[] = [
  /\bset\b[^.?!]{0,24}\bup\b/i,                        // "set up", "set that up", "can you set it up"
  /\bset (a|an|the|another) (reminder|schedule|task|automation|alert|notification)\b/i,
  /\b(create|make me|build me) (a|an|the|another)\b/i, // "create an automation", "make me a plan"
  /\badd\b[^.?!]{0,40}\b(to|into)\b[^.?!]{0,30}\b(shed|watchlist|list|plan|nursery|shopping)\b/i,
  /\badd (it|them|him|her|that|this|these|those)\b/i,
  /\b(can|could|will|would) you add\b/i,
  /\bremind me\b/i,
  /\bschedule\b[^.?!]{0,30}\b(for|every|to)\b/i,
  /\blog (that|a|an|my|the|it)\b/i,
  /\b(archive|delete|remove|rename|pause|resume|cancel)\b[^.?!]{0,40}\b(my|the|all|this|that|these|those|it|them)\b/i,
  /\b(mark|tick|check off)\b[^.?!]{0,60}\b(as )?(done|complete|completed|finished)\b/i,
  /\bpush\b[^.?!]{0,40}\b(back|forward)\b/i,
  /\b(reschedule|postpone|snooze|move)\b[^.?!]{0,30}\b(task|tasks|schedule|watering|everything)\b/i,
  /\bwater\b[^.?!]{0,30}\b(now|right now|immediately)\b/i,
  /\brun\b[^.?!]{0,30}\bautomation\b/i,
  // Constrained to garden hardware/automation objects — a bare "turn on" also
  // matches app-settings questions ("turn on dark mode"), which must not force.
  /\bturn (on|off)\b[^.?!]{0,40}\b(valve|automation|automations|watering|irrigation|device|sensor|alert)s?\b/i,
  /\bhelp me (stay on top|keep track|keep on top|remember)\b/i,
  /\blink (it|them|that|this)\b/i,
  // Wave-2 verbs (round 5 — docs/plans/garden-ai-eval-round5-read-stall-and-overuse.md)
  /\b(open|close|shut)\b[^.?!]{0,30}\bvalve\b/i,                                       // E31 "Open the Raised Bed A valve"
  /\b(change|adjust|update|amend|edit)\b[^.?!]{0,40}\b(alert|automation|schedule|reminder|blueprint|threshold)\b/i, // E45
  /^\s*plan\b[^.?!]{0,60}\b(and add|rotation)\b/i,                                     // E35 "Plan a … rotation … and add …"
];

// A refinement of a just-staged action ("actually only the greenhouse ones",
// "make it every 2 days") — recognised by the previous assistant turn having
// staged something (its reply carries the 🔧 marker) plus adjusting language.
const REFINEMENT_WORDS = /\b(actually|instead|only|just|rather|change (it|that)|make (it|that|them)|can (it|you|that)|also)\b/i;

export interface HistoryTurn {
  role: string;
  parts?: Array<{ text?: string }>;
}

// ── Ungrounded data-claim detection (round 9) ────────────────────────────────
// Wave-3 showed the model asserting "your watchlist is empty" / "you have no
// planting tasks" with ZERO tool calls behind it. When a reply matches these
// patterns and no read tool ran this turn, agent-chat forces one retry with
// tool calling ON so the claim gets grounded. Conservative on purpose: it only
// fires when nothing was read, so a false positive costs one harmless lookup.
const DATA_CLAIM_PATTERNS: RegExp[] = [
  /\byour \w+( list)?( is| are)( currently)? empty\b/i,
  /\byou (currently )?(have|'ve got) no\b/i,
  /\byou don'?t (currently )?have any\b/i,
  /\bthere (are|is) no(thing)? \w+ (in|on) your\b/i,
  /\bI (can'?t|couldn'?t|don'?t) see any \w+ (in|on) your\b/i,
  /\bnothing (is )?(scheduled|planned|overdue|logged) (for you|in your)\b/i,
];

/** True when reply text asserts facts about the user's data (empty lists, counts). */
export function claimsUserData(reply: string): boolean {
  const text = (reply ?? "").trim();
  if (!text) return false;
  return DATA_CLAIM_PATTERNS.some((re) => re.test(text));
}

/** True when `message` clearly asks the assistant to perform an action. */
export function isActionExplicit(message: string, history: HistoryTurn[] = []): boolean {
  const msg = (message ?? "").trim();
  if (!msg) return false;

  if (ACTION_PATTERNS.some((re) => re.test(msg))) return true;

  // Refinement path: last model turn staged something (🔧) and the user is
  // adjusting it in place.
  const lastModel = [...history].reverse().find((t) => t.role === "model");
  const lastModelText = lastModel?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
  if (lastModelText.includes("🔧") && REFINEMENT_WORDS.test(msg)) return true;

  return false;
}
